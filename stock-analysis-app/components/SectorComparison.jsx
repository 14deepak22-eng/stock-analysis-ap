"use client";

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";

const COMPARE_METRICS = [
  { key: "pe_ratio", label: "P/E" },
  { key: "roe", label: "ROE %" },
  { key: "roce", label: "ROCE %" },
  { key: "net_margin", label: "Net Margin %" },
];

export default function SectorComparison({ raw }) {
  const data = COMPARE_METRICS.map((m) => ({
    metric: m.label,
    "This stock": raw[m.key] ?? null,
    "Sector median": raw[`sector_${m.key}_median`] ?? null,
  })).filter((d) => d["This stock"] != null && d["Sector median"] != null);

  if (data.length === 0) return null;

  return (
    <div className="border rounded-2xl p-5 bg-white shadow-sm">
      <h2 className="font-semibold text-gray-800 mb-3">This stock vs sector median</h2>
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="metric" />
          <YAxis />
          <Tooltip />
          <Legend />
          <Bar dataKey="This stock" fill="#4f46e5" radius={[4, 4, 0, 0]} />
          <Bar dataKey="Sector median" fill="#94a3b8" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
