"use client";

import { useState, useTransition } from "react";
import { MEAL_TYPE_LABELS, foodLabel } from "@/lib/types";
import type { MealWithFoods } from "@/lib/repositories/meals";
import {
  fillGlucoseAfterAction,
  updateGlucoseBeforeAction,
  deleteMealAction,
} from "./actions";

export default function MealList({
  meals,
  regUsableIds,
}: {
  meals: MealWithFoods[];
  regUsableIds: Set<string>;
}) {
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
        <MealCard key={m.id} meal={m} inRegression={regUsableIds.has(m.id)} />
      ))}
    </ul>
  );
}

function MealCard({
  meal,
  inRegression,
}: {
  meal: MealWithFoods;
  inRegression: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [after, setAfter] = useState("");
  const [afterAt, setAfterAt] = useState(nowLocalInput); // 餐後讀數的量測時間（B′）
  const [editingAfter, setEditingAfter] = useState(false);
  const [editingBefore, setEditingBefore] = useState(false);
  const [before, setBefore] = useState("");

  const rise =
    meal.glucose_before != null && meal.glucose_after != null
      ? meal.glucose_after - meal.glucose_before
      : null;

  // 餐後讀數距用餐幾小時（B′；未記量測時間則不顯示）。
  const afterElapsedHours =
    meal.glucose_after_at != null
      ? Math.round(
          ((new Date(meal.glucose_after_at).getTime() -
            new Date(meal.eaten_at).getTime()) /
            3_600_000) *
            10,
        ) / 10
      : null;

  function startEditAfter() {
    setAfter(meal.glucose_after != null ? String(meal.glucose_after) : "");
    setAfterAt(
      meal.glucose_after_at ? toLocalInput(meal.glucose_after_at) : nowLocalInput(),
    );
    setEditingAfter(true);
  }

  function saveAfter() {
    const v = Number(after);
    if (!Number.isFinite(v) || v <= 0) return;
    const measuredAt = afterAt ? new Date(afterAt).toISOString() : null;
    startTransition(() => {
      fillGlucoseAfterAction(meal.id, v, measuredAt);
      setEditingAfter(false);
    });
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
    startTransition(() => {
      deleteMealAction(meal.id);
    });
  }

  return (
    <li className="flex flex-col gap-2 rounded-xl border border-zinc-200 dark:border-zinc-700 p-4">
      <div className="flex items-start justify-between">
        <div>
          <span className="rounded bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 text-xs font-medium text-zinc-600 dark:text-zinc-300">
            {MEAL_TYPE_LABELS[meal.meal_type]}
          </span>
          {/* 這筆是否被納入 ICR/ISF 迴歸分析（對分析有貢獻）；低干擾小點，不影響閱讀 */}
          {inRegression && (
            <span
              className="ml-1.5 text-xs text-emerald-600 dark:text-emerald-400"
              title="已納入迴歸分析（乾淨、獨立、量測時間有效的餐次）"
            >
              ●
            </span>
          )}
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
                const amt = f.amount ?? f.quantity ?? 1;
                if (f.unit === "gram") return `${label} ${amt}g`;
                return amt !== 1 ? `${label}×${amt}份` : label;
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
        <div className="flex justify-between">
          <span className="text-zinc-500 dark:text-zinc-400">餐後血糖</span>
          <button
            type="button"
            onClick={startEditAfter}
            className="font-medium text-zinc-800 dark:text-zinc-100 underline decoration-dotted underline-offset-2"
            aria-label="編輯餐後血糖"
          >
            {meal.glucose_after != null ? meal.glucose_after : "—"}
          </button>
        </div>
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
          {afterElapsedHours != null && (
            <span className="ml-1 text-xs text-zinc-400 dark:text-zinc-500">
              （餐後 {afterElapsedHours} 小時量）
            </span>
          )}
        </p>
      )}

      {meal.note && <p className="text-xs text-zinc-400 dark:text-zinc-500">備註：{meal.note}</p>}

      {/* 編輯／補填餐後血糖：未填時直接顯示輸入框，已填時點數值才出現 */}
      {(editingAfter || meal.glucose_after == null) && (
        <div className="mt-1 flex flex-col gap-2">
          <div className="flex gap-2">
            <input
              type="number"
              inputMode="numeric"
              value={after}
              onChange={(e) => setAfter(e.target.value)}
              placeholder={meal.glucose_after == null ? "補填餐後血糖" : "餐後血糖"}
              className="h-11 flex-1 rounded-lg border border-zinc-300 dark:border-zinc-700 px-3 text-sm"
              autoFocus={editingAfter}
            />
            <button
              type="button"
              onClick={saveAfter}
              disabled={pending || after === ""}
              className="h-11 shrink-0 rounded-lg bg-black dark:bg-white px-4 text-sm font-medium text-white dark:text-black disabled:opacity-50"
            >
              {pending ? "…" : meal.glucose_after == null ? "補填" : "儲存"}
            </button>
            {editingAfter && (
              <button
                type="button"
                onClick={() => setEditingAfter(false)}
                disabled={pending}
                className="h-11 shrink-0 rounded-lg border border-zinc-300 dark:border-zinc-700 px-3 text-sm text-zinc-600 dark:text-zinc-300 disabled:opacity-50"
              >
                取消
              </button>
            )}
          </div>
          {/* B′：量測時間，預設帶當下、可改；用來判定是否落在分析的有效窗 */}
          <label className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
            量測時間
            <input
              type="datetime-local"
              value={afterAt}
              onChange={(e) => setAfterAt(e.target.value)}
              className="h-9 flex-1 rounded-lg border border-zinc-300 dark:border-zinc-700 px-2 text-sm"
            />
          </label>
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

// 現在時間 → <input type="datetime-local"> 的本地字串。
function nowLocalInput(): string {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

// ISO → 本地 datetime-local 字串。
function toLocalInput(iso: string): string {
  const d = new Date(iso);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
