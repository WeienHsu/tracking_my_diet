"use client";

import { useMemo, useState } from "react";
import {
  foodLabel,
  type Meal,
  type MealFood,
} from "@/lib/types";
import {
  searchFoodAggregates,
  RESIDUAL_FLAG,
  type FoodSearchGroup,
  type FoodOutcomeStats,
  type IcrModel,
} from "@/lib/analysis";

export default function FoodSearch({
  meals,
  mealFoods,
  target,
  model,
}: {
  meals: Meal[];
  mealFoods: MealFood[];
  target: { low: number; high: number };
  model: IcrModel | null;
}) {
  const [query, setQuery] = useState("");
  const [submitted, setSubmitted] = useState<string | null>(null);

  const results = useMemo<FoodSearchGroup[] | null>(() => {
    if (submitted == null) return null;
    return searchFoodAggregates(
      submitted,
      meals,
      mealFoods,
      { target_glucose_low: target.low, target_glucose_high: target.high },
      model,
    );
  }, [submitted, meals, mealFoods, target, model]);

  function onSearch(e: React.FormEvent) {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    setSubmitted(q);
  }

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-zinc-200 dark:border-zinc-700 p-4">
      <h2 className="text-sm font-medium text-zinc-700 dark:text-zinc-200">
        查上次吃同樣食物的紀錄
      </h2>
      <form onSubmit={onSearch} className="flex gap-2">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="輸入品牌或食物名，例：星巴克、便當"
          className="h-12 flex-1 rounded-lg border border-zinc-300 dark:border-zinc-700 px-3 text-base outline-none focus:border-zinc-500"
        />
        <button
          type="submit"
          disabled={query.trim() === ""}
          className="h-12 shrink-0 rounded-lg bg-black dark:bg-white px-5 text-base font-medium text-white dark:text-black disabled:opacity-50"
        >
          查詢
        </button>
      </form>

      {results != null && (
        <div className="flex flex-col gap-2">
          {results.length === 0 ? (
            <p className="text-sm text-zinc-400 dark:text-zinc-500">查無紀錄。</p>
          ) : (
            <>
              <p className="text-xs text-zinc-400 dark:text-zinc-500">
                找到 {results.length} 種食物（不同品項分開統計）
              </p>
              <ul className="flex flex-col gap-2">
                {results.map((g) => (
                  <FoodGroupCard key={foodLabel(g.brand, g.name)} group={g} />
                ))}
              </ul>
              <p className="text-[11px] leading-4 text-amber-700 dark:text-amber-400">
                ⚠️ 僅為過去紀錄的觀察統計，<strong>不可取代專業醫療判斷</strong>。
              </p>
            </>
          )}
        </div>
      )}
    </section>
  );
}

function FoodGroupCard({ group }: { group: FoodSearchGroup }) {
  const { aggregate: agg, avgResidual } = group;
  const flagged = avgResidual != null && avgResidual > RESIDUAL_FLAG;

  return (
    <li className="rounded-lg bg-zinc-50 dark:bg-zinc-800 px-3 py-2 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-1">
        <span className="font-medium text-zinc-800 dark:text-zinc-100">
          {foodLabel(group.brand, group.name)}
        </span>
        <span className="text-xs text-zinc-500 dark:text-zinc-400">
          共 {agg.all.n} 次
        </span>
      </div>

      {flagged && (
        <p className="mt-1 inline-block rounded bg-amber-100 dark:bg-amber-900/40 px-1.5 py-0.5 text-[11px] text-amber-700 dark:text-amber-300">
          ⚠ 比預期更易升糖（平均高出模型 {round0(avgResidual!)} mg/dL）
        </p>
      )}

      {agg.solo.n > 0 && (
        <StatsLine label="單獨吃" tag="此食物劑量" stats={agg.solo} showPerUnit />
      )}
      {agg.mixed.n > 0 && (
        <StatsLine
          label="混合餐"
          tag="整餐劑量（含其他食物）"
          stats={agg.mixed}
        />
      )}
    </li>
  );
}

function StatsLine({
  label,
  tag,
  stats,
  showPerUnit = false,
}: {
  label: string;
  tag: string;
  stats: FoodOutcomeStats;
  showPerUnit?: boolean;
}) {
  return (
    <div className="mt-1.5 flex flex-col gap-0.5 text-xs text-zinc-600 dark:text-zinc-300">
      <div className="flex flex-wrap items-center gap-x-2">
        <span className="font-medium text-zinc-700 dark:text-zinc-200">
          {label} {stats.n} 次
        </span>
        <span>
          理想 {stats.ideal}・偏高 {stats.high}・偏低 {stats.low}
        </span>
      </div>
      <div className="flex flex-wrap gap-x-3 text-zinc-500 dark:text-zinc-400">
        {/* 2.3：單獨吃優先顯示每份／每100克施打比例 */}
        {showPerUnit && stats.dosePerServing != null && (
          <span>每份打 {round1(stats.dosePerServing)} 單位</span>
        )}
        {showPerUnit && stats.dosePer100g != null && (
          <span>每100克打 {round1(stats.dosePer100g)} 單位</span>
        )}
        {stats.typicalDose != null && (
          <span>
            常見{tag} {round1(stats.typicalDose)} 單位
          </span>
        )}
        {stats.typicalCarbs != null && (
          <span>碳水中位 {round1(stats.typicalCarbs)}g</span>
        )}
      </div>
    </div>
  );
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function round0(n: number): number {
  return Math.round(n);
}
