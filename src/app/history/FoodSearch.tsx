"use client";

import { useState, useTransition } from "react";
import { MEAL_TYPE_LABELS, foodLabel } from "@/lib/types";
import { searchFoodHistoryAction, type FoodHistoryResult } from "./actions";

export default function FoodSearch() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<FoodHistoryResult[] | null>(null);
  const [pending, startTransition] = useTransition();

  function onSearch(e: React.FormEvent) {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    startTransition(async () => {
      const r = await searchFoodHistoryAction(q);
      setResults(r);
    });
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
          disabled={pending || query.trim() === ""}
          className="h-12 shrink-0 rounded-lg bg-black dark:bg-white px-5 text-base font-medium text-white dark:text-black disabled:opacity-50"
        >
          {pending ? "…" : "查詢"}
        </button>
      </form>

      {results != null && (
        <div className="flex flex-col gap-2">
          {results.length === 0 ? (
            <p className="text-sm text-zinc-400 dark:text-zinc-500">查無紀錄。</p>
          ) : (
            <>
              <p className="text-xs text-zinc-400 dark:text-zinc-500">{results.length} 筆歷史</p>
              <ul className="flex flex-col gap-2">
                {results.map((r, i) => (
                  <li
                    key={i}
                    className="rounded-lg bg-zinc-50 dark:bg-zinc-800 px-3 py-2 text-sm"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-zinc-800 dark:text-zinc-100">
                        {foodLabel(r.brand, r.foodName)}
                      </span>
                      <span className="text-xs text-zinc-500 dark:text-zinc-400">
                        {MEAL_TYPE_LABELS[r.mealType]}・{formatDate(r.eatenAt)}
                      </span>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-zinc-600 dark:text-zinc-300">
                      <span>碳水 {round1(r.carbs)}g</span>
                      <span>施打 {round1(r.insulinUnits)} 單位</span>
                      <span>
                        血糖 {r.glucoseBefore ?? "—"} →{" "}
                        {r.glucoseAfter ?? "—"}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </section>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("zh-TW", {
    year: "numeric",
    month: "numeric",
    day: "numeric",
  });
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
