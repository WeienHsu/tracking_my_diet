"use client";

import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import type { TrendPoint } from "@/lib/analysis";

type A1cPoint = { t: string; value: number };

export default function HomeCharts({
  trend,
  a1c,
}: {
  trend: TrendPoint[];
  a1c: A1cPoint[];
}) {
  return (
    <div className="flex flex-col gap-4">
      {/* 血糖線圖 */}
      <section className="flex min-w-0 flex-col gap-2 rounded-xl border border-zinc-200 dark:border-zinc-700 p-4">
        <h2 className="text-sm font-medium text-zinc-700 dark:text-zinc-200">
          血糖趨勢
        </h2>
        {trend.length === 0 ? (
          <EmptyHint text="尚無餐食紀錄" />
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <LineChart
              data={trend}
              margin={{ top: 5, right: 8, bottom: 0, left: -16 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#f4f4f5" />
              <XAxis
                dataKey="t"
                tick={{ fontSize: 11 }}
                interval="preserveStartEnd"
                minTickGap={24}
              />
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
        )}
      </section>

      {/* A1C 線圖 */}
      <section className="flex min-w-0 flex-col gap-2 rounded-xl border border-zinc-200 dark:border-zinc-700 p-4">
        <h2 className="text-sm font-medium text-zinc-700 dark:text-zinc-200">
          A1C 趨勢（%）
        </h2>
        {a1c.length === 0 ? (
          <EmptyHint text="尚無 A1C 紀錄" />
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <LineChart
              data={a1c}
              margin={{ top: 5, right: 8, bottom: 0, left: -16 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#f4f4f5" />
              <XAxis dataKey="t" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} domain={["auto", "auto"]} />
              <Tooltip />
              <Line
                type="monotone"
                dataKey="value"
                name="A1C"
                stroke="#7c3aed"
                strokeWidth={2}
                dot={{ r: 3 }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </section>
    </div>
  );
}

function EmptyHint({ text }: { text: string }) {
  return (
    <p className="py-10 text-center text-sm text-zinc-400 dark:text-zinc-500">
      {text}
    </p>
  );
}
