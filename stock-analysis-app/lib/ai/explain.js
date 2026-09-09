// The AI's only two jobs in this app:
//   1. Explain a score that has ALREADY been computed by lib/scoring.js
//   2. Read news headlines and summarize sentiment
// It never invents or calculates a score itself.

import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

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

/**
 * Generates the explanation for either the Investment or Trading score.
 * @param {string} scoreType - "Investment" or "Trading"
 */
export async function explainScore(symbol, scoreType, score, metrics) {
  const userPrompt = `Stock: ${symbol}
Score type: ${scoreType}
Score: ${score}/100

Key metrics:
${JSON.stringify(metrics, null, 2)}

Return the JSON now.`;

  const response = await anthropic.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 500,
    system: EXPLAIN_SYSTEM_PROMPT,
    messages: [{ role: "user", content: userPrompt }],
  });

  const text = response.content.find((b) => b.type === "text")?.text ?? "{}";
  return JSON.parse(text);
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

  const response = await anthropic.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 300,
    system: NEWS_SYSTEM_PROMPT,
    messages: [{ role: "user", content: userPrompt }],
  });

  const text = response.content.find((b) => b.type === "text")?.text ?? "{}";
  return JSON.parse(text);
}
