async function getAnalysis(symbol) {
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"}/api/stock/${symbol}`,
    { cache: "no-store" }
  );
  if (!res.ok) return null;
  return res.json();
}

function ScoreCard({ title, score, analysis }) {
  return (
    <div className="border rounded-xl p-5 bg-white">
      <div className="flex items-baseline justify-between mb-2">
        <h2 className="font-medium">{title}</h2>
        <span className="text-2xl font-semibold">{score ?? "-"}</span>
      </div>
      {analysis ? (
        <>
          <p className="text-sm text-gray-700 mb-3">{analysis.summary}</p>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="font-medium text-green-700 mb-1">Strengths</p>
              <ul className="list-disc list-inside text-gray-600">
                {(analysis.strengths || []).map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </div>
            <div>
              <p className="font-medium text-amber-700 mb-1">Concerns</p>
              <ul className="list-disc list-inside text-gray-600">
                {(analysis.concerns || []).map((c, i) => (
                  <li key={i}>{c}</li>
                ))}
              </ul>
            </div>
          </div>
        </>
      ) : (
        <p className="text-sm text-gray-400">Not yet computed for this stock.</p>
      )}
    </div>
  );
}

export default async function StockPage({ params }) {
  const symbol = params.symbol.toUpperCase();
  const data = await getAnalysis(symbol);

  if (!data) {
    return <p className="text-red-600">Could not load data for {symbol}.</p>;
  }

  const { score, analysis } = data;

  return (
    <div>
      <h1 className="text-xl font-medium mb-1">{symbol}</h1>
      <p className="text-xs text-gray-400 mb-6">
        Data as of {score?.score_date ?? "unknown"} - not investment advice.
      </p>

      <div className="grid gap-4">
        <ScoreCard
          title="Investment score"
          score={score?.investment_score}
          analysis={analysis?.investment_analysis}
        />
        <ScoreCard
          title="Trading score"
          score={score?.trading_score}
          analysis={analysis?.trading_analysis}
        />

        <div className="border rounded-xl p-5 bg-white">
          <h2 className="font-medium mb-2">News sentiment</h2>
          <p className="text-sm">
            <span className="font-medium">{analysis?.news_analysis?.sentiment ?? "Unknown"}</span>
            {" - "}
            {analysis?.news_analysis?.reasoning}
          </p>
        </div>
      </div>

      <p className="text-xs text-gray-400 mt-6">
        This information is for informational purposes only and is not
        investment advice. Please consult a SEBI-registered advisor before
        making investment decisions.
      </p>
    </div>
  );
}
