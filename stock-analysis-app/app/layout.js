import "./globals.css";
import AuthStatus from "@/components/AuthStatus";

export const metadata = {
  title: "StockScope",
  description: "Investment and trading scores for Indian stocks, explained by AI",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="bg-gray-50 min-h-screen">
        <header className="border-b bg-white px-6 py-4 flex items-center justify-between sticky top-0 z-20">
          <a href="/" className="font-bold text-lg bg-gradient-to-r from-indigo-600 to-sky-500 bg-clip-text text-transparent">
            StockScope
          </a>
          <nav className="flex items-center gap-5 text-sm font-medium text-gray-600">
            <a href="/dashboard" className="hover:text-indigo-600">Dashboard</a>
            <a href="/screener" className="hover:text-indigo-600">Screener</a>
            <AuthStatus />
          </nav>
        </header>
        <main className="max-w-5xl mx-auto px-6 py-8">{children}</main>
      </body>
    </html>
  );
}
