import "./globals.css";
import AuthStatus from "@/components/AuthStatus";
import HeaderSearch from "@/components/HeaderSearch";

export const metadata = {
  title: "StockScope",
  description: "Investment and trading scores for Indian stocks, explained by AI",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="min-h-screen">
        <header className="border-b bg-white/80 backdrop-blur-md px-6 py-4 flex items-center justify-between sticky top-0 z-20 flex-wrap gap-3">
          <div className="flex items-center gap-4">
            <a href="/" title="Home" className="text-xl hover:scale-110 transition-transform">🏠</a>
            <a href="/" className="font-bold text-lg bg-gradient-to-r from-indigo-600 to-sky-500 bg-clip-text text-transparent">
              StockScope
            </a>
          </div>
          <HeaderSearch />
          <nav className="flex items-center gap-5 text-sm font-medium text-gray-600">
            <a href="/intraday" className="hover:text-indigo-600 transition">Intraday</a>
            <a href="/trading" className="hover:text-indigo-600 transition">Swing</a>
            <a href="/paper-trades" className="hover:text-indigo-600 transition">Paper Trades</a>
            <a href="/dashboard" className="hover:text-indigo-600 transition">Dashboard</a>
            <a href="/screener" className="hover:text-indigo-600 transition">Screener</a>
            <AuthStatus />
          </nav>
        </header>
        <main className="max-w-5xl mx-auto px-6 py-8 fade-in">{children}</main>
      </body>
    </html>
  );
}
