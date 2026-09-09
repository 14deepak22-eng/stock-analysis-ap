import StockView from "@/components/StockView";

async function getAnalysis(symbol) {
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"}/api/stock/${symbol}`,
    { cache: "no-store" }
  );
  if (!res.ok) return null;
  return res.json();
}

export default async function StockPage({ params }) {
  const symbol = params.symbol.toUpperCase();
  const data = await getAnalysis(symbol);

  if (!data) {
    return <p className="text-red-600">Could not load data for {symbol}.</p>;
  }

  return <StockView symbol={symbol} initialData={data} />;
}
