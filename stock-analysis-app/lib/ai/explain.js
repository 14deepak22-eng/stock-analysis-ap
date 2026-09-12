// The AI's jobs in this app:
//   1. Explain the Investment and Trading scores
//   2. Read news headlines and summarize sentiment
//   3. Write a one-paragraph verdict combining all scores
// It never invents or calculates a score itself.
//
// All four outputs are generated in ONE combined AI call instead of four
// separate ones, to make the most of limited free-tier daily quotas.
//
// Reliability strategy: try Gemini first (free tier). If it fails, fall
// back to Groq (a different free provider) instead of giving up.

const GEMINI_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent";
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

function extractJson(text) {
  const cleaned = text.replace(/```json\s*|```/g, "").trim();
  return JSON.parse(cleaned);
}

async function callGemini(systemPrompt, userPrompt, attempt = 1) {
  const res = await fetch(`${GEMINI_URL}?key=${process.env.GEMINI_API_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: "user", parts: [{ text: userPrompt }] }],
      generationConfig: { responseMimeType: "application/json" },
    }),
  });

  const data = await res.json();

  if (data.error) {
    console.log("GEMINI ERROR:", JSON.stringify(data.error));
    if (data.error.code === 503 && attempt < 2) {
      await new Promise((r) => setTimeout(r, 1500 * attempt));
      return callGemini(systemPrompt, userPrompt, attempt + 1);
    }
    return null;
  }

  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}";
  try {
    return extractJson(text);
  } catch {
    return null;
  }
}

async function callGroq(systemPrompt, userPrompt) {
  const res = await fetch(GROQ_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: "openai/gpt-oss-20b",
      messages: [
        { role: "system", content: systemPrompt + "\n\nRespond with ONLY the JSON object, no other text, no markdown code fences." },
        { role: "user", content: userPrompt },
      ],
    }),
  });

  const data = await res.json();

  if (data.error) {
    console.log("GROQ ERROR:", JSON.stringify(data.error));
    return null;
  }

  const text = data?.choices?.[0]?.message?.content ?? "{}";
  try {
    return extractJson(text);
  } catch (e) {
    console.log("GROQ PARSE FAILED, raw text:", text);
    return null;
  }
}

async function callAI(systemPrompt, userPrompt, fallbackShape) {
  const geminiResult = await callGemini(systemPrompt, userPrompt);
  if (geminiResult) return geminiResult;

  console.log("Falling back to Groq...");
  const groqResult = await callGroq(systemPrompt, userPrompt);
  if (groqResult) return groqResult;

  console.log("Both providers failed, returning fallback.");
  return fallbackShape;
}

const COMBINED_SYSTEM_PROMPT = `You are a financial analysis assistant. You will be given
a stock's Investment score with fundamentals, Trading score with technical
signals, and recent news headlines. Produce ALL FOUR of the following in
one response.

Rules:
- Only reference numbers/headlines actually given. Never invent or estimate a figure.
- Never say "buy" or "sell". Use language like "the data suggests" or "this may warrant attention".
- Explain both strengths and weaknesses, even for high-scoring cases.
- If investment and trading scores disagree, call that out explicitly in the verdict.
- Output ONLY valid JSON, no other text, matching EXACTLY this shape:
{
  "investment_analysis": { "summary": "...", "strengths": ["..."], "concerns": ["..."], "disclaimer": "..." },
  "trading_analysis": { "summary": "...", "strengths": ["..."], "concerns": ["..."], "disclaimer": "..." } or null if no technical data given,
  "news_analysis": { "sentiment": "Positive" | "Neutral" | "Negative", "reasoning": "..." },
  "verdict": { "summary": "2-3 sentence overall takeaway combining all three" }
}`;

const FALLBACK_SHAPE = {
  investment_analysis: {
    summary: "AI explanation temporarily unavailable.",
    strengths: [],
    concerns: [],
    disclaimer: "This is not investment advice.",
  },
  trading_analysis: null,
  news_analysis: { sentiment: "Neutral", reasoning: "AI explanation temporarily unavailable." },
  verdict: { summary: "Overview temporarily unavailable." },
};

/**
 * Single combined call replacing the previous 4 separate AI calls
 * (investment explanation, trading explanation, news sentiment, verdict).
 * Cuts AI usage per stock from 4 calls to 1.
 */
export async function explainAll({ symbol, investmentScore, fundamentals, tradingScore, signals, headlines }) {
  const userPrompt = `Stock: ${symbol}

Investment score: ${investmentScore}/100
Fundamentals:
${JSON.stringify(fundamentals, null, 2)}

Trading score: ${tradingScore}/100
Technical signals:
${signals ? JSON.stringify(signals, null, 2) : "Not available"}

Recent news headlines:
${headlines && headlines.length > 0 ? headlines.map((h) => `- ${h.headline}`).join("\n") : "No recent headlines found."}

Return the JSON now.`;

  return callAI(COMBINED_SYSTEM_PROMPT, userPrompt, FALLBACK_SHAPE);
}
