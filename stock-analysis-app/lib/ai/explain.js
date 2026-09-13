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
const TRADING_SIGNAL_SYSTEM_PROMPT = `You are a technical analysis assistant. You will be given
a stock's technical signals, support/resistance levels, detected chart
patterns, a historical backtest result, and calculated risk-reward levels.
Synthesize all of this into a clear technical read.

Rules:
- Only reference numbers/patterns actually given. Never invent or estimate a figure.
- Never say "buy" or "sell" as a command. Use language like "the data suggests",
  "conditions favor", "this may warrant attention", or "signals are mixed".
- If the backtest sample size is small or the note says there's not enough
  data, say so plainly rather than overstating confidence.
- If detected patterns and momentum signals disagree with each other, say so explicitly.
- Reference the specific entry, stop-loss, and target numbers given - do not recalculate them.
- End with a one-line disclaimer that this is not investment advice and stop-loss/target levels are informational reference points, not guarantees.
- Output ONLY valid JSON, no other text, matching EXACTLY this shape:
{
  "overallRead": "1-2 sentence plain-language summary of what the data suggests right now",
  "reasoning": "2-4 sentences explaining why, referencing the specific signals/patterns/backtest given",
  "disclaimer": "..."
}`;

/**
 * Generates the AI synthesis for one of the daily top 5 trading picks.
 * Only called for 5 stocks/day (the winners of the deterministic scan),
 * not for every scanned stock - keeps AI usage minimal.
 */
export async function explainTradingSignal({ symbol, opportunityScore, signals, support, resistance, patterns, backtest, riskReward }) {
  const userPrompt = `Stock: ${symbol}
Trading Opportunity Score: ${opportunityScore}/100

Technical signals:
- Current price: ${signals.price}
- RSI: ${signals.rsi != null ? signals.rsi.toFixed(1) : "unavailable"}
- Price vs 50-day average: ${signals.ma50 ? (((signals.price - signals.ma50) / signals.ma50) * 100).toFixed(2) + "%" : "unavailable"}
- Price vs 200-day average: ${signals.ma200 ? (((signals.price - signals.ma200) / signals.ma200) * 100).toFixed(2) + "%" : "unavailable"}
- MACD line vs signal line: ${signals.macdLine != null && signals.macdSignal != null ? (signals.macdLine > signals.macdSignal ? "bullish crossover" : "bearish crossover") : "unavailable"}
- Volume trend: ${signals.recentVolume && signals.avgVolume ? (signals.recentVolume > signals.avgVolume ? "above average" : "below average") : "unavailable"}

Support levels: ${JSON.stringify(support)}
Resistance levels: ${JSON.stringify(resistance)}

Detected patterns: ${patterns.length > 0 ? JSON.stringify(patterns) : "None of the tracked patterns were detected"}

Historical backtest: ${JSON.stringify(backtest)}

Calculated risk-reward levels (already computed - do not recalculate):
- Entry: ${riskReward?.entry}
- Stop-loss: ${riskReward?.stopLoss}
- Target: ${riskReward?.target}
- Risk-reward ratio: ${riskReward?.riskRewardRatio}

Return the JSON now.`;

  return callAI(TRADING_SIGNAL_SYSTEM_PROMPT, userPrompt, {
    overallRead: "AI analysis temporarily unavailable.",
    reasoning: "Please check back shortly.",
    disclaimer: "This is not investment advice. Stop-loss and target levels are informational reference points, not guarantees.",
  });
}
