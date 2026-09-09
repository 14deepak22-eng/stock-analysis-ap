import "./globals.css";

export const metadata = {
  title: "Stock Analysis",
  description: "Investment and trading scores for Indian stocks, explained by AI",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="bg-gray-50 min-h-screen">
        <header className="border-b bg-white px-6 py-4 flex items-center justify-between">
          <a href="/" className="font-semibold text-lg">StockScope</a>
          <nav className="flex gap-4 text-sm">
            <a href="/screener">Screener</a>
            <a href="/login">Login</a>
          </nav>
        </header>
        <main className="max-w-4xl mx-auto px-6 py-8">{children}</main>
      </body>
    </html>
  );
}
