"use client";

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";

export default function PriceChart({ priceHistory }) {
  if (!priceHistory || priceHistory.length === 0) return null;

  return (
    <div className="border rounded-2xl p-5 bg-white shadow-sm">
      <h2 className="font-semibold text-gray-800 mb-3">Price history with moving averages</h2>
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={priceHistory}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="date" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
          <YAxis domain={["auto", "auto"]} tick={{ fontSize: 11 }} />
          <Tooltip />
          <Legend />
          <Line type="monotone" dataKey="close" stroke="#1f2937" dot={false} strokeWidth={2} name="Price" />
          <Line type="monotone" dataKey="ma50" stroke="#4f46e5" dot={false} strokeWidth={1.5} name="50-day avg" />
          <Line type="monotone" dataKey="ma200" stroke="#f59e0b" dot={false} strokeWidth={1.5} name="200-day avg" />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
