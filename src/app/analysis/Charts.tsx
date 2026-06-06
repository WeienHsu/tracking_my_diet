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
  ComposedChart,
  Area,
} from "recharts";
import type { IcrTrendPoint } from "@/lib/analysis";

type TrendPoint = {
  t: string;
  before: number | null;
  after: number | null;
};

type LandingCounts = { ideal: number; high: number; low: number };

type ImpactMode = "residual" | "solo-normalized" | "none";
type ImpactPoint = { foodName: string; value: number; n: number };
type Impact = { mode: ImpactMode; items: ImpactPoint[] };

// 依模式決定食物影響圖的標題與單位說明。
const IMPACT_META: Record<
  Exclude<ImpactMode, "none">,
  { title: string; barName: string }
> = {
  residual: {
    title: "食物影響（殘差：比模型預測多升 mg/dL，已扣除碳水與胰島素）",
    barName: "殘差 mg/dL",
  },
  "solo-normalized": {
    title: "食物影響（單獨吃，每 10g 碳水上升 mg/dL）",
    barName: "每10g碳水上升",
  },
};

const LANDING_COLORS = {
  ideal: "#16a34a", // green
  high: "#d97706", // amber
  low: "#2563eb", // blue
};

export default function Charts({
  trend,
  landing,
  impact,
  icrTrend,
}: {
  trend: TrendPoint[];
  landing: LandingCounts;
  impact: Impact;
  icrTrend: IcrTrendPoint[];
}) {
  const pieData = [
    { name: "理想", key: "ideal" as const, value: landing.ideal },
    { name: "偏高", key: "high" as const, value: landing.high },
    { name: "偏低", key: "low" as const, value: landing.low },
  ].filter((d) => d.value > 0);

  // 信心趨勢：把區間轉成 [下界, 上界] 範圍，用 Area 畫陰影帶。
  const icrTrendData = icrTrend.map((p) => ({
    n: p.n,
    icr: round1(p.icr),
    band: [round1(p.ciLow), round1(p.ciHigh)] as [number, number],
  }));

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

      {/* 食物影響長條圖（自適應：殘差 / 單獨吃每 10g 碳水上升）*/}
      {impact.mode !== "none" && impact.items.length > 0 && (
        <section className="flex min-w-0 flex-col gap-2 rounded-xl border border-zinc-200 dark:border-zinc-700 p-4">
          <h2 className="text-sm font-medium text-zinc-700 dark:text-zinc-200">
            {IMPACT_META[impact.mode].title}
          </h2>
          <ResponsiveContainer
            width="100%"
            height={Math.max(140, impact.items.length * 38)}
          >
            <BarChart
              data={impact.items}
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
              <Tooltip
                formatter={(value, _name, item) => [
                  `${value}（${(item?.payload as ImpactPoint).n} 餐）`,
                  IMPACT_META[impact.mode as Exclude<ImpactMode, "none">].barName,
                ]}
              />
              <Bar
                dataKey="value"
                name={IMPACT_META[impact.mode].barName}
                fill="#d97706"
                radius={[0, 4, 4, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
          <p className="text-[11px] leading-4 text-zinc-400 dark:text-zinc-500">
            {impact.mode === "residual"
              ? "已扣除碳水與胰島素的影響、可用混合餐；正值＝比模型預測更會升糖。"
              : "僅採計「單獨吃」且重複 ≥2 次的食物，避免混合餐互相干擾。"}
          </p>
        </section>
      )}

      {/* 信心趨勢：迴歸啟動後（≥30 筆有效乾淨餐），ICR 與信心區間隨餐數收窄 */}
      {icrTrendData.length > 0 && (
        <section className="flex min-w-0 flex-col gap-2 rounded-xl border border-zinc-200 dark:border-zinc-700 p-4">
          <h2 className="text-sm font-medium text-zinc-700 dark:text-zinc-200">
            ICR 信心趨勢（區間越窄＝越準）
          </h2>
          <ResponsiveContainer width="100%" height={220}>
            <ComposedChart
              data={icrTrendData}
              margin={{ top: 5, right: 8, bottom: 0, left: -16 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#f4f4f5" />
              <XAxis
                dataKey="n"
                tick={{ fontSize: 11 }}
                label={{ value: "餐數", position: "insideBottomRight", fontSize: 11 }}
              />
              <YAxis tick={{ fontSize: 11 }} domain={["auto", "auto"]} />
              <Tooltip />
              <Area
                dataKey="band"
                name="95% 信心區間"
                stroke="none"
                fill="#0ea5e9"
                fillOpacity={0.15}
                isAnimationActive={false}
              />
              <Line
                type="monotone"
                dataKey="icr"
                name="反推 ICR"
                stroke="#0ea5e9"
                strokeWidth={2}
                dot={{ r: 2 }}
                isAnimationActive={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </section>
      )}
    </div>
  );
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
