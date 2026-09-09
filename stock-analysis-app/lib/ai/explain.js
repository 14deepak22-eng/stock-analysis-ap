// The AI's only two jobs in this app:
//   1. Explain a score that has ALREADY been computed by lib/scoring.js
//   2. Read news headlines and summarize sentiment
// It never invents or calculates a score itself.
// Uses Google Gemini's free tier (no billing required) - get a key at
// aistudio.google.com and set it as GEMINI_API_KEY.

const GEMINI_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";

async function callGemini(systemPrompt, userPrompt) {
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
  console.log("GEMINI RAW RESPONSE:", JSON.stringify(data));
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}";
  return JSON.parse(text);
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

  return callGemini(EXPLAIN_SYSTEM_PROMPT, userPrompt);
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

  return callGemini(NEWS_SYSTEM_PROMPT, userPrompt);
}
