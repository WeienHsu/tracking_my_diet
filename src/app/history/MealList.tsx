"use client";

import { useState, useTransition } from "react";
import { MEAL_TYPE_LABELS, foodLabel } from "@/lib/types";
import type { MealWithFoods } from "@/lib/repositories/meals";
import {
  fillGlucoseAfterAction,
  updateGlucoseBeforeAction,
  deleteMealAction,
} from "./actions";

export default function MealList({ meals }: { meals: MealWithFoods[] }) {
  if (meals.length === 0) {
    return (
      <p className="py-12 text-center text-sm text-zinc-400 dark:text-zinc-500">
        沒有符合的紀錄。
      </p>
    );
  }
  return (
    <ul className="flex flex-col gap-3">
      {meals.map((m) => (
        <MealCard key={m.id} meal={m} />
      ))}
    </ul>
  );
}

function MealCard({ meal }: { meal: MealWithFoods }) {
  const [pending, startTransition] = useTransition();
  const [after, setAfter] = useState("");
  const [editingBefore, setEditingBefore] = useState(false);
  const [before, setBefore] = useState("");

  const rise =
    meal.glucose_before != null && meal.glucose_after != null
      ? meal.glucose_after - meal.glucose_before
      : null;

  function saveAfter() {
    const v = Number(after);
    if (!Number.isFinite(v) || v <= 0) return;
    startTransition(() => fillGlucoseAfterAction(meal.id, v));
  }

  function startEditBefore() {
    setBefore(meal.glucose_before != null ? String(meal.glucose_before) : "");
    setEditingBefore(true);
  }

  function saveBefore() {
    const v = Number(before);
    if (!Number.isFinite(v) || v <= 0) return;
    startTransition(() => {
      updateGlucoseBeforeAction(meal.id, v);
      setEditingBefore(false);
    });
  }

  function onDelete() {
    if (!confirm("確定刪除這筆紀錄？")) return;
    startTransition(() => deleteMealAction(meal.id));
  }

  return (
    <li className="flex flex-col gap-2 rounded-xl border border-zinc-200 dark:border-zinc-700 p-4">
      <div className="flex items-start justify-between">
        <div>
          <span className="rounded bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 text-xs font-medium text-zinc-600 dark:text-zinc-300">
            {MEAL_TYPE_LABELS[meal.meal_type]}
          </span>
          {/* 時間以瀏覽器當地時區/locale 顯示，與伺服器 ICU 版本可能有微小差異（如 AM/PM 分隔字元），故抑制 hydration 警告、以用戶端值為準 */}
          <span
            className="ml-2 text-sm text-zinc-500 dark:text-zinc-400"
            suppressHydrationWarning
          >
            {formatTime(meal.eaten_at)}
          </span>
        </div>
        <button
          type="button"
          onClick={onDelete}
          disabled={pending}
          aria-label="刪除"
          className="text-sm text-zinc-400 dark:text-zinc-500 disabled:opacity-50"
        >
          刪除
        </button>
      </div>

      {/* 食物 */}
      <p className="text-sm text-zinc-700 dark:text-zinc-200">
        {meal.meal_foods.length > 0
          ? meal.meal_foods
              .map((f) => {
                const label = foodLabel(f.food_brand, f.food_name);
                return f.quantity > 1 ? `${label}×${f.quantity}` : label;
              })
              .join("、")
          : "—"}
      </p>

      {/* 數據 */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
        <Row label="碳水" value={`${round1(meal.total_carbs)} g`} />
        <Row label="施打" value={`${round1(meal.insulin_units)} 單位`} />
        <div className="flex justify-between">
          <span className="text-zinc-500 dark:text-zinc-400">餐前血糖</span>
          <button
            type="button"
            onClick={startEditBefore}
            className="font-medium text-zinc-800 dark:text-zinc-100 underline decoration-dotted underline-offset-2"
            aria-label="編輯飯前血糖"
          >
            {meal.glucose_before != null ? meal.glucose_before : "—"}
          </button>
        </div>
        <Row
          label="餐後血糖"
          value={meal.glucose_after != null ? `${meal.glucose_after}` : "—"}
        />
      </div>

      {/* 編輯飯前血糖 */}
      {editingBefore && (
        <div className="mt-1 flex gap-2">
          <input
            type="number"
            inputMode="numeric"
            value={before}
            onChange={(e) => setBefore(e.target.value)}
            placeholder="飯前血糖"
            className="h-11 flex-1 rounded-lg border border-zinc-300 dark:border-zinc-700 px-3 text-sm"
            autoFocus
          />
          <button
            type="button"
            onClick={saveBefore}
            disabled={pending || before === ""}
            className="h-11 shrink-0 rounded-lg bg-black dark:bg-white px-4 text-sm font-medium text-white dark:text-black disabled:opacity-50"
          >
            {pending ? "…" : "儲存"}
          </button>
          <button
            type="button"
            onClick={() => setEditingBefore(false)}
            disabled={pending}
            className="h-11 shrink-0 rounded-lg border border-zinc-300 dark:border-zinc-700 px-3 text-sm text-zinc-600 dark:text-zinc-300 disabled:opacity-50"
          >
            取消
          </button>
        </div>
      )}

      {rise != null && (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          血糖變化：
          <span className={rise > 0 ? "text-amber-700 dark:text-amber-400" : "text-green-700 dark:text-green-400"}>
            {rise > 0 ? `+${rise}` : rise}
          </span>{" "}
          mg/dL
        </p>
      )}

      {meal.note && <p className="text-xs text-zinc-400 dark:text-zinc-500">備註：{meal.note}</p>}

      {/* 餐後血糖補填 */}
      {meal.glucose_after == null && (
        <div className="mt-1 flex gap-2">
          <input
            type="number"
            inputMode="numeric"
            value={after}
            onChange={(e) => setAfter(e.target.value)}
            placeholder="補填餐後血糖"
            className="h-11 flex-1 rounded-lg border border-zinc-300 dark:border-zinc-700 px-3 text-sm"
          />
          <button
            type="button"
            onClick={saveAfter}
            disabled={pending || after === ""}
            className="h-11 shrink-0 rounded-lg bg-black dark:bg-white px-4 text-sm font-medium text-white dark:text-black disabled:opacity-50"
          >
            {pending ? "…" : "補填"}
          </button>
        </div>
      )}
    </li>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-zinc-500 dark:text-zinc-400">{label}</span>
      <span className="font-medium text-zinc-800 dark:text-zinc-100">{value}</span>
    </div>
  );
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString("zh-TW", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
