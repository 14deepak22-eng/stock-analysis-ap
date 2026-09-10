// The AI's jobs in this app:
//   1. Explain a score that has ALREADY been computed by lib/scoring.js
//   2. Read news headlines and summarize sentiment
//   3. Write a one-paragraph verdict combining all scores
// It never invents or calculates a score itself.
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

const EXPLAIN_SYSTEM_PROMPT = `You are a financial analysis assistant. You will be given
structured data about a stock's score and underlying metrics. Write a clear,
balanced explanation of why the stock received this score.

Rules:
- Only reference numbers given in the data. Never invent or estimate a figure.
- Explain both strengths and weaknesses, even for high-scoring stocks.
- Never say "buy" or "sell". Use language like "the data suggests" or
  "this may warrant attention."
- End with a one-line disclaimer that this is not financial advice.
- Output ONLY valid JSON, no other text, matching this shape:
  { "summary": "...", "strengths": ["..."], "concerns": ["..."], "disclaimer": "..." }`;

export async function explainScore(symbol, scoreType, score, metrics) {
  const userPrompt = `Stock: ${symbol}
Score type: ${scoreType}
Score: ${score}/100

Key metrics:
${JSON.stringify(metrics, null, 2)}

Return the JSON now.`;

  return callAI(EXPLAIN_SYSTEM_PROMPT, userPrompt, {
    summary: "AI explanation temporarily unavailable.",
    strengths: [],
    concerns: [],
    disclaimer: "This is not investment advice.",
  });
}

const NEWS_SYSTEM_PROMPT = `You read recent news headlines about a company and judge
overall sentiment. Output ONLY valid JSON, no other text:
  { "sentiment": "Positive" | "Neutral" | "Negative", "reasoning": "1-2 sentences citing the headline(s)" }`;

export async function explainNewsSentiment(companyName, headlines) {
  if (!headlines || headlines.length === 0) {
    return { sentiment: "Neutral", reasoning: "No recent headlines found." };
  }

  const headlineList = headlines.map((h) => `- ${h.headline}`).join("\n");
  const userPrompt = `Company: ${companyName}

Recent headlines:
${headlineList}

Return the JSON now.`;

  return callAI(NEWS_SYSTEM_PROMPT, userPrompt, {
    sentiment: "Neutral",
    reasoning: "AI explanation temporarily unavailable.",
  });
}

const VERDICT_SYSTEM_PROMPT = `You are a financial analysis assistant. You will be given
a stock's Investment score, Trading score, and news sentiment, along with
brief context for each. Write ONE short paragraph (2-3 sentences) that
synthesizes all three into a single plain-language takeaway.

Rules:
- Only reference the scores and context given. Never invent numbers.
- If scores disagree (e.g. strong investment score but weak trading score),
  explicitly call that out - it's the most useful insight for a reader.
- Never say "buy" or "sell". Use language like "the data suggests" or
  "this may warrant attention."
- Output ONLY valid JSON: { "summary": "..." }`;

export async function explainVerdict(symbol, investmentScore, tradingScore, newsSentiment) {
  const userPrompt = `Stock: ${symbol}
Investment score: ${investmentScore}/100
Trading score: ${tradingScore}/100
News sentiment: ${newsSentiment}

Return the JSON now.`;

  return callAI(VERDICT_SYSTEM_PROMPT, userPrompt, {
    summary: "Overview temporarily unavailable.",
  });
}
