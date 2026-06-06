"use client";

import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";

type TrendPoint = {
  t: string;
  before: number | null;
  after: number | null;
};

type LandingCounts = { ideal: number; high: number; low: number };

type ImpactPoint = { foodName: string; rise: number };

const LANDING_COLORS = {
  ideal: "#16a34a", // green
  high: "#d97706", // amber
  low: "#2563eb", // blue
};

export default function Charts({
  trend,
  landing,
  impact,
}: {
  trend: TrendPoint[];
  landing: LandingCounts;
  impact: ImpactPoint[];
}) {
  const pieData = [
    { name: "理想", key: "ideal" as const, value: landing.ideal },
    { name: "偏高", key: "high" as const, value: landing.high },
    { name: "偏低", key: "low" as const, value: landing.low },
  ].filter((d) => d.value > 0);

  return (
    <div className="flex flex-col gap-6">
      {/* 血糖趨勢線圖 */}
      <section className="flex flex-col gap-2 rounded-xl border border-zinc-200 dark:border-zinc-700 p-4">
        <h2 className="text-sm font-medium text-zinc-700 dark:text-zinc-200">血糖趨勢</h2>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={trend} margin={{ top: 5, right: 8, bottom: 0, left: -16 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f4f4f5" />
            <XAxis dataKey="t" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Line
              type="monotone"
              dataKey="before"
              name="餐前"
              stroke="#a1a1aa"
              strokeWidth={2}
              connectNulls
              dot={{ r: 2 }}
            />
            <Line
              type="monotone"
              dataKey="after"
              name="餐後"
              stroke="#0ea5e9"
              strokeWidth={2}
              connectNulls
              dot={{ r: 2 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </section>

      {/* 餐後落點分布 */}
      {pieData.length > 0 && (
        <section className="flex min-w-0 flex-col gap-2 rounded-xl border border-zinc-200 dark:border-zinc-700 p-4">
          <h2 className="text-sm font-medium text-zinc-700 dark:text-zinc-200">餐後落點分布</h2>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie
                data={pieData}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                outerRadius={80}
                label={(p) => `${p.name} ${p.value}`}
              >
                {pieData.map((d) => (
                  <Cell key={d.key} fill={LANDING_COLORS[d.key]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </section>
      )}

      {/* 食物影響長條圖（平均血糖上升幅度）*/}
      {impact.length > 0 && (
        <section className="flex min-w-0 flex-col gap-2 rounded-xl border border-zinc-200 dark:border-zinc-700 p-4">
          <h2 className="text-sm font-medium text-zinc-700 dark:text-zinc-200">
            食物影響（平均餐後血糖上升 mg/dL）
          </h2>
          <ResponsiveContainer width="100%" height={Math.max(140, impact.length * 38)}>
            <BarChart
              data={impact}
              layout="vertical"
              margin={{ top: 5, right: 12, bottom: 0, left: 8 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#f4f4f5" />
              <XAxis type="number" tick={{ fontSize: 11 }} />
              <YAxis
                type="category"
                dataKey="foodName"
                width={88}
                tick={{ fontSize: 11 }}
              />
              <Tooltip />
              <Bar dataKey="rise" name="平均上升" fill="#d97706" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </section>
      )}
    </div>
  );
}
