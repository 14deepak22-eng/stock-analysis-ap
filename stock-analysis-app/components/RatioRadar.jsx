"use client";

import { RadarChart, PolarGrid, PolarAngleAxis, Radar, ResponsiveContainer } from "recharts";
import { scoreMetric } from "@/lib/scoring";

const RADAR_METRICS = [
  { key: "pe_ratio", label: "P/E", lowerIsBetter: true },
  { key: "roe", label: "ROE", lowerIsBetter: false },
  { key: "roce", label: "ROCE", lowerIsBetter: false },
  { key: "debt_to_equity", label: "Debt/Eq", lowerIsBetter: true },
  { key: "revenue_growth_yoy", label: "Growth", lowerIsBetter: false },
  { key: "net_margin", label: "Margin", lowerIsBetter: false },
];

export default function RatioRadar({ raw }) {
  const data = RADAR_METRICS.map((m) => {
    const value = raw[m.key];
    const median = raw[`sector_${m.key}_median`] ?? value;
    const std = raw[`sector_${m.key}_std`] ?? 1;
    return {
      metric: m.label,
      score: typeof value === "number" ? scoreMetric(value, median, std, m.lowerIsBetter) : 50,
    };
  });

  const hasData = data.some((d) => d.score !== 50);
  if (!hasData) return null;

  return (
    <div className="border rounded-2xl p-5 bg-white shadow-sm">
      <h2 className="font-semibold text-gray-800 mb-1">Ratio profile vs sector</h2>
      <p className="text-xs text-gray-400 mb-3">Each spoke: 50 = sector average, higher = stronger.</p>
      <ResponsiveContainer width="100%" height={260}>
        <RadarChart data={data} outerRadius={85}>
          <PolarGrid />
          <PolarAngleAxis dataKey="metric" tick={{ fontSize: 12 }} />
          <Radar dataKey="score" stroke="#4f46e5" fill="#4f46e5" fillOpacity={0.4} />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}
