"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  MEAL_TYPE_LABELS,
  EXERCISE_LABELS,
  MEAL_CONTEXT_LABELS,
  FOOD_UNIT_LABELS,
  foodCarbs,
  mealTypeForHour,
  type MealType,
  type MealRange,
  type Exercise,
  type MealContext,
  type FoodUnit,
  type Meal,
  type MealFood,
} from "@/lib/types";
import {
  aggregateFoodOutcomes,
  type FoodOutcomeStats,
} from "@/lib/analysis";
import { createMealAction } from "./actions";

type FoodOption = {
  brand: string | null;
  name: string;
  carbs_per_serving: number | null;
  carbs_per_100g: number | null;
};
type FoodLine = {
  brand: string;
  name: string;
  unit: FoodUnit; // 份 / 克
  carbsPerServing: string; // 每份碳水
  carbsPer100g: string; // 每100克碳水
  amount: string; // 份數（serving）或克數（gram）
};

const MEAL_TYPES = Object.keys(MEAL_TYPE_LABELS) as MealType[];
const EXERCISES = Object.keys(EXERCISE_LABELS) as Exercise[];
const CONTEXTS = Object.keys(MEAL_CONTEXT_LABELS) as MealContext[];
const FOOD_UNITS = Object.keys(FOOD_UNIT_LABELS) as FoodUnit[];

function emptyLine(): FoodLine {
  return {
    brand: "",
    name: "",
    unit: "serving",
    carbsPerServing: "",
    carbsPer100g: "",
    amount: "1",
  };
}

// 一列食物換算後的總碳水（共用 foodCarbs，與後端一致）。
function lineCarbs(l: FoodLine): number {
  const per = Number(l.unit === "gram" ? l.carbsPer100g : l.carbsPerServing);
  return foodCarbs(l.unit, per, Number(l.amount));
}

// 現在時間格式化為 <input type="datetime-local"> 需要的本地字串。
function nowLocalInput(): string {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

const inputClass =
  "h-12 w-full rounded-lg border border-zinc-300 dark:border-zinc-700 px-3 text-base outline-none focus:border-zinc-500";

export default function LogForm({
  foods,
  icr,
  mealRange,
  meals,
  mealFoods,
  target,
}: {
  foods: FoodOption[];
  icr: number;
  mealRange: MealRange;
  meals: Meal[];
  mealFoods: MealFood[];
  target: { low: number; high: number };
}) {
  const router = useRouter();

  const [eatenAt, setEatenAt] = useState(nowLocalInput);
  const [mealType, setMealType] = useState<MealType>(() =>
    mealTypeForHour(new Date().getHours(), mealRange),
  );
  const [glucoseBefore, setGlucoseBefore] = useState("");
  const [foodLines, setFoodLines] = useState<FoodLine[]>([emptyLine()]);
  const [insulin, setInsulin] = useState("");
  const [doseTouched, setDoseTouched] = useState(false);
  const [glucoseAfter, setGlucoseAfter] = useState("");
  const [exercise, setExercise] = useState<Exercise>("none");
  const [context, setContext] = useState<MealContext[]>([]);
  const [note, setNote] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{
    type: "ok" | "err";
    text: string;
  } | null>(null);

  const totalCarbs = useMemo(
    () => foodLines.reduce((sum, l) => sum + lineCarbs(l), 0),
    [foodLines],
  );

  const suggestedDose = icr > 0 ? totalCarbs / icr : 0;

  // 使用者尚未手動改動施打量前，顯示建議值（不存進 state，避免 effect）。
  const insulinValue = doseTouched
    ? insulin
    : totalCarbs > 0
      ? String(round1(suggestedDose))
      : "";

  function updateLine(i: number, patch: Partial<FoodLine>) {
    setFoodLines((lines) =>
      lines.map((l, idx) => (idx === i ? { ...l, ...patch } : l)),
    );
  }

  function onPickFood(i: number, name: string) {
    const match = foods.find(
      (f) => f.name.toLowerCase() === name.trim().toLowerCase(),
    );
    // 選到庫裡的食物時自動帶入（該列對應欄位未填時）：品牌與營養標示。
    const patch: Partial<FoodLine> = { name };
    if (match) {
      if (!foodLines[i].brand && match.brand) patch.brand = match.brand;
      if (!foodLines[i].carbsPerServing && match.carbs_per_serving != null)
        patch.carbsPerServing = String(match.carbs_per_serving);
      if (!foodLines[i].carbsPer100g && match.carbs_per_100g != null)
        patch.carbsPer100g = String(match.carbs_per_100g);
      // 庫裡只有克制資料時，預設切到克模式。
      if (match.carbs_per_serving == null && match.carbs_per_100g != null)
        patch.unit = "gram";
    }
    updateLine(i, patch);
  }

  function addLine() {
    setFoodLines((lines) => [...lines, emptyLine()]);
  }

  function removeLine(i: number) {
    setFoodLines((lines) =>
      lines.length === 1 ? lines : lines.filter((_, idx) => idx !== i),
    );
  }

  function toggleContext(c: MealContext) {
    setContext((prev) =>
      prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c],
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);

    const lines = foodLines
      .map((l) => ({
        brand: l.brand.trim() || null,
        name: l.name.trim(),
        unit: l.unit,
        amount: Number(l.amount),
        carbsPerUnit: Number(
          l.unit === "gram" ? l.carbsPer100g : l.carbsPerServing,
        ),
      }))
      .filter(
        (l) =>
          l.name &&
          Number.isFinite(l.amount) &&
          l.amount > 0 &&
          Number.isFinite(l.carbsPerUnit) &&
          l.carbsPerUnit > 0,
      );

    if (lines.length === 0) {
      setMessage({ type: "err", text: "請至少加入一項有碳水的食物。" });
      return;
    }

    setSubmitting(true);
    try {
      const res = await createMealAction({
        eatenAt: new Date(eatenAt).toISOString(),
        mealType,
        glucoseBefore: glucoseBefore === "" ? null : Number(glucoseBefore),
        insulinUnits: Number(insulinValue) || 0,
        glucoseAfter: glucoseAfter === "" ? null : Number(glucoseAfter),
        exercise,
        context,
        note: note.trim() || null,
        foods: lines,
      });

      if (!res.ok) {
        setMessage({ type: "err", text: res.error });
        return;
      }

      // 重設可變欄位，保留時間/餐別以利連續記錄。
      setFoodLines([emptyLine()]);
      setGlucoseBefore("");
      setGlucoseAfter("");
      setExercise("none");
      setContext([]);
      setNote("");
      setInsulin("");
      setDoseTouched(false);
      setEatenAt(nowLocalInput());
      setMessage({ type: "ok", text: "已記錄這一餐 ✓" });
      router.refresh(); // 更新食物庫（新增的食物會出現在建議清單）
    } catch (err) {
      setMessage({
        type: "err",
        text: err instanceof Error ? err.message : "記錄失敗，請再試一次。",
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      {/* 時間 */}
      <Field label="時間">
        <input
          type="datetime-local"
          value={eatenAt}
          onChange={(e) => setEatenAt(e.target.value)}
          className={inputClass}
          required
        />
      </Field>

      {/* 餐別 */}
      <Field label="餐別">
        <div className="grid grid-cols-4 gap-2">
          {MEAL_TYPES.map((t) => (
            <button
              type="button"
              key={t}
              onClick={() => setMealType(t)}
              className={`h-12 rounded-lg border text-base ${
                mealType === t
                  ? "border-black dark:border-white bg-black dark:bg-white text-white dark:text-black"
                  : "border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-200"
              }`}
            >
              {MEAL_TYPE_LABELS[t]}
            </button>
          ))}
        </div>
      </Field>

      {/* 餐前血糖 */}
      <Field label="餐前血糖（mg/dL，可留空）">
        <input
          type="number"
          inputMode="numeric"
          value={glucoseBefore}
          onChange={(e) => setGlucoseBefore(e.target.value)}
          placeholder="例：120"
          className={inputClass}
        />
      </Field>

      {/* 食物 */}
      <Field label="食物（可多筆）">
        <datalist id="food-options">
          {foods.map((f, idx) => (
            <option key={idx} value={f.name} />
          ))}
        </datalist>
        <div className="flex flex-col gap-2">
          {foodLines.map((line, i) => (
            <div
              key={i}
              className="flex flex-col gap-2 rounded-lg border border-zinc-200 dark:border-zinc-700 p-2"
            >
              <input
                value={line.brand}
                onChange={(e) => updateLine(i, { brand: e.target.value })}
                placeholder="品牌／餐廳（選填，例：星巴克）"
                className={inputClass}
              />
              <div className="flex gap-2">
                <input
                  list="food-options"
                  value={line.name}
                  onChange={(e) => onPickFood(i, e.target.value)}
                  placeholder="食物名稱（例：拿鐵）"
                  className={`${inputClass} flex-1`}
                />
                <button
                  type="button"
                  onClick={() => removeLine(i)}
                  aria-label="移除這項食物"
                  className="h-12 w-12 shrink-0 rounded-lg border border-zinc-300 dark:border-zinc-700 text-xl text-zinc-500 dark:text-zinc-400"
                >
                  ×
                </button>
              </div>
              {/* 計量方式：按份 / 按克數 */}
              <div className="grid grid-cols-2 gap-2">
                {FOOD_UNITS.map((u) => (
                  <button
                    type="button"
                    key={u}
                    onClick={() => updateLine(i, { unit: u })}
                    className={`h-10 rounded-lg border text-sm ${
                      line.unit === u
                        ? "border-black dark:border-white bg-black dark:bg-white text-white dark:text-black"
                        : "border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-200"
                    }`}
                  >
                    {u === "serving" ? "按份" : "按克數"}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                {line.unit === "serving" ? (
                  <>
                    <label className="flex flex-1 flex-col gap-1">
                      <span className="text-xs text-zinc-500 dark:text-zinc-400">每份碳水（克）</span>
                      <input
                        type="number"
                        inputMode="decimal"
                        step="any"
                        value={line.carbsPerServing}
                        onChange={(e) =>
                          updateLine(i, { carbsPerServing: e.target.value })
                        }
                        placeholder="標示每份，例：38"
                        className={inputClass}
                      />
                    </label>
                    <label className="flex flex-1 flex-col gap-1">
                      <span className="text-xs text-zinc-500 dark:text-zinc-400">份數（可填小數）</span>
                      <input
                        type="number"
                        inputMode="decimal"
                        step="any"
                        min="0"
                        value={line.amount}
                        onChange={(e) => updateLine(i, { amount: e.target.value })}
                        placeholder="例：0.5"
                        className={inputClass}
                      />
                    </label>
                  </>
                ) : (
                  <>
                    <label className="flex flex-1 flex-col gap-1">
                      <span className="text-xs text-zinc-500 dark:text-zinc-400">每 100 克碳水</span>
                      <input
                        type="number"
                        inputMode="decimal"
                        step="any"
                        value={line.carbsPer100g}
                        onChange={(e) =>
                          updateLine(i, { carbsPer100g: e.target.value })
                        }
                        placeholder="標示每100g，例：26"
                        className={inputClass}
                      />
                    </label>
                    <label className="flex flex-1 flex-col gap-1">
                      <span className="text-xs text-zinc-500 dark:text-zinc-400">吃了幾克</span>
                      <input
                        type="number"
                        inputMode="decimal"
                        step="any"
                        min="0"
                        value={line.amount}
                        onChange={(e) => updateLine(i, { amount: e.target.value })}
                        placeholder="例：150"
                        className={inputClass}
                      />
                    </label>
                  </>
                )}
              </div>
              {lineCarbs(line) > 0 && (
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  這項約 {round1(lineCarbs(line))} g 碳水
                </p>
              )}
              <FoodStats
                brand={line.brand}
                name={line.name}
                meals={meals}
                mealFoods={mealFoods}
                target={target}
              />
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={addLine}
          className="mt-2 h-11 rounded-lg border border-dashed border-zinc-400 dark:border-zinc-600 text-sm text-zinc-600 dark:text-zinc-300"
        >
          ＋ 新增食物
        </button>
        <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">
          庫裡已有的食物，選到後會自動帶入營養標示。按份或按克數可切換。
        </p>
      </Field>

      {/* 加總與建議劑量 */}
      <div className="rounded-xl bg-zinc-50 dark:bg-zinc-800 p-4">
        <div className="flex items-center justify-between text-sm">
          <span className="text-zinc-600 dark:text-zinc-300">總碳水</span>
          <span className="text-lg font-semibold">{round1(totalCarbs)} g</span>
        </div>
        <div className="mt-2 flex items-center justify-between text-sm">
          <span className="text-zinc-600 dark:text-zinc-300">建議劑量（碳水 ÷ ICR {icr}）</span>
          <span className="text-lg font-semibold">
            {round1(suggestedDose)} 單位
          </span>
        </div>
        <p className="mt-2 text-xs leading-5 text-amber-700 dark:text-amber-400">
          ⚠️ 建議劑量僅供參考、由碳水自動換算，<strong>不可取代專業醫療判斷</strong>
          。實際施打請依你的醫師／糖尿病衛教師指示。
        </p>
      </div>

      {/* 實際施打 */}
      <Field label="實際施打（單位）">
        <input
          type="number"
          inputMode="decimal"
          step="any"
          value={insulinValue}
          onChange={(e) => {
            setDoseTouched(true);
            setInsulin(e.target.value);
          }}
          placeholder="預設帶入建議值，可改"
          className={inputClass}
          required
        />
      </Field>

      {/* 餐後血糖 */}
      <Field label="餐後兩小時血糖（mg/dL，可稍後補填）">
        <input
          type="number"
          inputMode="numeric"
          value={glucoseAfter}
          onChange={(e) => setGlucoseAfter(e.target.value)}
          placeholder="例：150"
          className={inputClass}
        />
      </Field>

      {/* 運動（影響胰島素敏感度，選填） */}
      <Field label="運動（餐前後，選填）">
        <div className="grid grid-cols-3 gap-2">
          {EXERCISES.map((e) => (
            <button
              type="button"
              key={e}
              onClick={() => setExercise(e)}
              className={`h-12 rounded-lg border text-base ${
                exercise === e
                  ? "border-black dark:border-white bg-black dark:bg-white text-white dark:text-black"
                  : "border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-200"
              }`}
            >
              {EXERCISE_LABELS[e]}
            </button>
          ))}
        </div>
      </Field>

      {/* 狀態標籤（多選，選填） */}
      <Field label="狀態（可多選，選填）">
        <div className="flex flex-wrap gap-2">
          {CONTEXTS.map((c) => {
            const on = context.includes(c);
            return (
              <button
                type="button"
                key={c}
                onClick={() => toggleContext(c)}
                aria-pressed={on}
                className={`h-11 rounded-full border px-4 text-sm ${
                  on
                    ? "border-black dark:border-white bg-black dark:bg-white text-white dark:text-black"
                    : "border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-200"
                }`}
              >
                {MEAL_CONTEXT_LABELS[c]}
              </button>
            );
          })}
        </div>
        <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">
          運動／生病／壓力／喝酒會影響血糖；標記後，計算 ICR 時可排除這些餐讓估算更準。
        </p>
      </Field>

      {/* 備註 */}
      <Field label="備註（可留空）">
        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="餐廳、身體狀況等"
          className={inputClass}
        />
      </Field>

      {message && (
        <p
          className={`text-sm ${
            message.type === "ok" ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"
          }`}
        >
          {message.text}
        </p>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="h-14 rounded-xl bg-black dark:bg-white text-lg font-medium text-white dark:text-black disabled:opacity-50"
      >
        {submitting ? "記錄中…" : "記錄這一餐"}
      </button>
    </form>
  );
}

// 輸入食物名時，即時顯示過去吃這個的落點統計與常見劑量（做法 A：前端計算）。
// 名稱完全相同才命中（避免「豆腐」誤命中「板豆腐」）；有填品牌再縮到同品牌。
function FoodStats({
  brand,
  name,
  meals,
  mealFoods,
  target,
}: {
  brand: string;
  name: string;
  meals: Meal[];
  mealFoods: MealFood[];
  target: { low: number; high: number };
}) {
  const agg = useMemo(() => {
    if (name.trim().length < 1) return null;
    return aggregateFoodOutcomes({ brand, name }, meals, mealFoods, {
      target_glucose_low: target.low,
      target_glucose_high: target.high,
    });
  }, [brand, name, meals, mealFoods, target]);

  if (!agg || agg.all.n === 0) return null;

  return (
    <div className="rounded-lg bg-zinc-50 dark:bg-zinc-800 p-2.5 text-xs">
      <p className="font-medium text-zinc-700 dark:text-zinc-200">
        過去吃「{name.trim()}」共 {agg.all.n} 次
      </p>
      {agg.solo.n > 0 && (
        <StatsLine
          label="單獨吃"
          tag="此食物劑量"
          stats={agg.solo}
        />
      )}
      {agg.mixed.n > 0 && (
        <StatsLine
          label="混合餐"
          tag="整餐劑量（含其他食物）"
          stats={agg.mixed}
        />
      )}
      <p className="mt-1.5 text-[11px] leading-4 text-amber-700 dark:text-amber-400">
        ⚠️ 僅為過去紀錄的觀察統計，<strong>不可取代專業醫療判斷</strong>。
      </p>
    </div>
  );
}

function StatsLine({
  label,
  tag,
  stats,
}: {
  label: string;
  tag: string;
  stats: FoodOutcomeStats;
}) {
  return (
    <div className="mt-1.5 flex flex-col gap-0.5 text-zinc-600 dark:text-zinc-300">
      <div className="flex flex-wrap items-center gap-x-2">
        <span className="font-medium text-zinc-700 dark:text-zinc-200">
          {label} {stats.n} 次
        </span>
        <span>
          理想 {stats.ideal}・偏高 {stats.high}・偏低 {stats.low}
        </span>
      </div>
      <div className="flex flex-wrap gap-x-3 text-zinc-500 dark:text-zinc-400">
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

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-zinc-700 dark:text-zinc-200">{label}</span>
      {children}
    </label>
  );
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
