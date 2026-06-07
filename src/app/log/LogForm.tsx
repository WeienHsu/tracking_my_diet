"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  MEAL_TYPE_LABELS,
  EXERCISE_LABELS,
  MEAL_CONTEXT_LABELS,
  FOOD_UNIT_LABELS,
  foodCarbs,
  foodLabel,
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
  recentFoodEntries,
  insulinOnBoard,
  suggestDose,
  type FoodOutcomeStats,
  type FoodRecentEntry,
} from "@/lib/analysis";
import { createMealAction, syncFoodDefaultAction } from "./actions";

type FoodOption = {
  brand: string | null;
  name: string;
  carbs_per_serving: number | null;
  carbs_per_100g: number | null;
  serving_grams: number | null;
};
type FoodLine = {
  brand: string;
  name: string;
  unit: FoodUnit; // 份 / 克
  carbsPerServing: string; // 每份碳水
  carbsPer100g: string; // 每100克碳水
  servingGrams: string; // 每份克重（選填）
  amount: string; // 份數（serving）或克數（gram）
};

// 送出後用來比對食物庫預設值（3.1）。
type SubmitLine = {
  brand: string | null;
  name: string;
  unit: FoodUnit;
  amount: number;
  carbsPerUnit: number;
};
type SyncPrompt = {
  brand: string | null;
  name: string;
  unit: FoodUnit;
  carbsPerUnit: number;
  oldValue: number;
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
    servingGrams: "",
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
  isf,
  correctionTarget,
  advancedDose,
  iobParams,
  icrEstimate,
}: {
  foods: FoodOption[];
  icr: number;
  mealRange: MealRange;
  meals: Meal[];
  mealFoods: MealFood[];
  target: { low: number; high: number };
  isf: number | null;
  correctionTarget: number | null;
  advancedDose: boolean;
  iobParams: { diaMin: number; peakMin: number; autoSubtract: boolean };
  icrEstimate: number | null;
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
  // 1.2：是否改用反推 ICR 計算建議。
  const [useEstimatedIcr, setUseEstimatedIcr] = useState(false);
  const [glucoseAfter, setGlucoseAfter] = useState("");
  const [exercise, setExercise] = useState<Exercise>("none");
  const [context, setContext] = useState<MealContext[]>([]);
  const [note, setNote] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{
    type: "ok" | "err";
    text: string;
  } | null>(null);
  // 3.1：記錄後若微調過的碳水與食物庫預設不同，提示是否同步。
  const [syncPrompts, setSyncPrompts] = useState<SyncPrompt[]>([]);

  const totalCarbs = useMemo(
    () => foodLines.reduce((sum, l) => sum + lineCarbs(l), 0),
    [foodLines],
  );

  const glucoseBeforeNum = glucoseBefore === "" ? null : Number(glucoseBefore);

  // 4.1：以「這餐時間」為基準算活性胰島素（指數曲線，依設定的 DIA/peak）。
  const iob = useMemo(
    () =>
      insulinOnBoard(meals, new Date(eatenAt), {
        diaMin: iobParams.diaMin,
        peakMin: iobParams.peakMin,
      }),
    [meals, eatenAt, iobParams.diaMin, iobParams.peakMin],
  );

  // 1.2：可選用反推 ICR。
  const effectiveIcr =
    useEstimatedIcr && icrEstimate != null && icrEstimate > 0
      ? icrEstimate
      : icr;

  // 1.1 + 4.1：建議劑量（進階關閉時只用碳水 ÷ ICR）。
  const suggestion = useMemo(
    () =>
      suggestDose({
        carbs: totalCarbs,
        icr: effectiveIcr,
        advanced: advancedDose,
        isf,
        glucoseBefore: glucoseBeforeNum,
        correctionTarget,
        iob,
        subtractIob: iobParams.autoSubtract,
      }),
    [totalCarbs, effectiveIcr, advancedDose, isf, glucoseBeforeNum, correctionTarget, iob, iobParams.autoSubtract],
  );
  const suggestedDose = suggestion.dose;

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
      if (!foodLines[i].servingGrams && match.serving_grams != null)
        patch.servingGrams = String(match.serving_grams);
      // 庫裡只有克制資料時，預設切到克模式。
      if (match.carbs_per_serving == null && match.carbs_per_100g != null)
        patch.unit = "gram";
    }
    updateLine(i, patch);
  }

  // 2.2：點擊推薦食物，整列帶入品牌／營養標示／計量方式。
  function applyFood(i: number, f: FoodOption) {
    const patch: Partial<FoodLine> = { name: f.name };
    if (f.brand) patch.brand = f.brand;
    if (f.carbs_per_serving != null)
      patch.carbsPerServing = String(f.carbs_per_serving);
    if (f.carbs_per_100g != null) patch.carbsPer100g = String(f.carbs_per_100g);
    if (f.serving_grams != null) patch.servingGrams = String(f.serving_grams);
    patch.unit =
      f.carbs_per_serving == null && f.carbs_per_100g != null
        ? "gram"
        : "serving";
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

  // 3.1：確認把微調後的碳水同步為食物庫預設值。
  async function confirmSync(p: SyncPrompt) {
    const res = await syncFoodDefaultAction({
      brand: p.brand,
      name: p.name,
      unit: p.unit,
      carbsPerUnit: p.carbsPerUnit,
    });
    setSyncPrompts((prev) => prev.filter((x) => x !== p));
    if (res.ok) router.refresh();
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
        servingGrams:
          l.unit === "serving" && l.servingGrams.trim() !== ""
            ? Number(l.servingGrams)
            : null,
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

      // 3.1：列出與食物庫預設不同、可同步的項目。
      setSyncPrompts(computeSyncPrompts(lines, foods));

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
              {/* 2.2：相近食物推薦（包含比對，點擊帶入） */}
              <FoodSuggestions
                query={line.name}
                foods={foods}
                onPick={(f) => applyFood(i, f)}
              />
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
              {/* 3.2：按份時可選填「每份克重」，新食物會記下、之後可份↔克換算 */}
              {line.unit === "serving" && (
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-zinc-500 dark:text-zinc-400">
                    每份克重（選填，例：一份 50 克）
                  </span>
                  <input
                    type="number"
                    inputMode="decimal"
                    step="any"
                    value={line.servingGrams}
                    onChange={(e) =>
                      updateLine(i, { servingGrams: e.target.value })
                    }
                    placeholder="填了可自動補每100克碳水"
                    className={inputClass}
                  />
                </label>
              )}
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
          <span className="text-zinc-600 dark:text-zinc-300">
            建議劑量{advancedDose ? "（進階）" : `（碳水 ÷ ICR ${round1(effectiveIcr)}）`}
          </span>
          <span className="text-lg font-semibold">
            {round1(suggestedDose)} 單位
          </span>
        </div>

        {/* 進階模式：拆解 碳水/校正/IOB */}
        {advancedDose && totalCarbs > 0 && (
          <div className="mt-1.5 flex flex-col gap-0.5 text-xs text-zinc-500 dark:text-zinc-400">
            <span>
              碳水 ÷ ICR {round1(effectiveIcr)}：{round1(suggestion.base)} 單位
            </span>
            {suggestion.correction !== 0 && (
              <span>
                餐前校正（目標 {correctionTarget}、ISF {isf}）：
                {suggestion.correction > 0 ? "+" : ""}
                {round1(suggestion.correction)} 單位
              </span>
            )}
            {suggestion.iob > 0 && (
              <span>活性胰島素扣除：−{round1(suggestion.iob)} 單位</span>
            )}
          </div>
        )}

        {/* 4.1：疊藥警示 */}
        {iob > 0 && (
          <p className="mt-2 rounded-lg bg-amber-100 dark:bg-amber-900/40 px-2 py-1.5 text-xs text-amber-800 dark:text-amber-300">
            ⚠️ 疊藥提醒：還有約 {round1(iob)} 單位活性胰島素未代謝完（作用時間約{" "}
            {round1(iobParams.diaMin / 60)} 小時）。
            {advancedDose && iobParams.autoSubtract
              ? "已從建議中扣除，請留意低血糖風險。"
              : "目前未自動扣除，請自行斟酌。"}
          </p>
        )}

        {/* 1.2：一鍵切換用反推 ICR */}
        {icrEstimate != null && icrEstimate > 0 && (
          <label className="mt-2 flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-300">
            <input
              type="checkbox"
              checked={useEstimatedIcr}
              onChange={(e) => setUseEstimatedIcr(e.target.checked)}
              className="h-4 w-4"
            />
            改用近期反推 ICR {round1(icrEstimate)} 計算（設定值為 {round1(icr)}）
          </label>
        )}

        <p className="mt-2 text-xs leading-5 text-amber-700 dark:text-amber-400">
          ⚠️ 建議劑量僅供參考，<strong>不可取代專業醫療判斷</strong>
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

      {/* 3.1：同步食物庫預設值的提示 */}
      {syncPrompts.length > 0 && (
        <div className="flex flex-col gap-2 rounded-xl border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30 p-3 text-xs">
          <p className="font-medium text-amber-800 dark:text-amber-300">
            這次碳水與食物庫預設不同，要更新為預設嗎？
          </p>
          {syncPrompts.map((p, i) => (
            <div
              key={i}
              className="flex flex-wrap items-center justify-between gap-2"
            >
              <span className="text-zinc-700 dark:text-zinc-200">
                {foodLabel(p.brand, p.name)}：
                {p.unit === "gram" ? "每100克" : "每份"} {round1(p.oldValue)} →{" "}
                {round1(p.carbsPerUnit)} g
              </span>
              <span className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => confirmSync(p)}
                  className="rounded-lg bg-black dark:bg-white px-3 py-1 font-medium text-white dark:text-black"
                >
                  更新
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setSyncPrompts((prev) => prev.filter((x) => x !== p))
                  }
                  className="rounded-lg border border-zinc-300 dark:border-zinc-600 px-3 py-1 text-zinc-600 dark:text-zinc-300"
                >
                  略過
                </button>
              </span>
            </div>
          ))}
        </div>
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

// 2.2：依輸入字串「包含比對」推薦庫裡相近的食物（已完全相符則不再推薦）。
function FoodSuggestions({
  query,
  foods,
  onPick,
}: {
  query: string;
  foods: FoodOption[];
  onPick: (f: FoodOption) => void;
}) {
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 1) return [];
    return foods
      .filter((f) => {
        if (f.name.trim().toLowerCase() === q) return false; // 已完全相符
        return (
          f.name.toLowerCase().includes(q) ||
          (f.brand?.toLowerCase().includes(q) ?? false)
        );
      })
      .slice(0, 5);
  }, [query, foods]);

  if (matches.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1.5">
      {matches.map((f, idx) => (
        <button
          type="button"
          key={idx}
          onClick={() => onPick(f)}
          className="rounded-full border border-zinc-300 dark:border-zinc-600 px-2.5 py-1 text-xs text-zinc-600 dark:text-zinc-300"
        >
          {foodLabel(f.brand, f.name)}
        </button>
      ))}
    </div>
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

  // 2.1：最近 3 次的吃法與結果。
  const recent = useMemo(() => {
    if (name.trim().length < 1) return [];
    return recentFoodEntries({ brand, name }, meals, mealFoods, 3);
  }, [brand, name, meals, mealFoods]);

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
          showPerUnit
        />
      )}
      {agg.mixed.n > 0 && (
        <StatsLine
          label="混合餐"
          tag="整餐劑量（含其他食物）"
          stats={agg.mixed}
        />
      )}
      {recent.length > 0 && (
        <div className="mt-1.5 border-t border-zinc-200 dark:border-zinc-700 pt-1.5">
          <p className="text-[11px] text-zinc-500 dark:text-zinc-400">最近 {recent.length} 次</p>
          <ul className="mt-0.5 flex flex-col gap-0.5">
            {recent.map((e, i) => (
              <li key={i} className="text-[11px] text-zinc-600 dark:text-zinc-300">
                {recentLine(e)}
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="mt-1.5 text-[11px] leading-4 text-amber-700 dark:text-amber-400">
        ⚠️ 僅為過去紀錄的觀察統計，<strong>不可取代專業醫療判斷</strong>。
      </p>
    </div>
  );
}

// 一行最近紀錄：「6/1 ・ 2份 ・ 打8 ・ 110→160」。
function recentLine(e: FoodRecentEntry): string {
  const date = new Date(e.eatenAt).toLocaleDateString("zh-TW", {
    month: "numeric",
    day: "numeric",
  });
  const amt = e.unit === "gram" ? `${round1(e.amount)}g` : `${round1(e.amount)}份`;
  const glucose =
    e.glucoseBefore != null && e.glucoseAfter != null
      ? `${e.glucoseBefore}→${e.glucoseAfter}`
      : e.glucoseAfter != null
        ? `餐後 ${e.glucoseAfter}`
        : "血糖未填";
  return `${date}・${amt}・打 ${round1(e.insulinUnits)}・${glucose}`;
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
        {/* 2.3：單獨吃優先顯示「每份／每100克施打」比例，避免吃少打多 */}
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

// 3.1：與食物庫預設碳水比對，找出這次微調過、值不同的食物。
function foodKeyOf(brand: string | null, name: string): string {
  return `${(brand ?? "").trim().toLowerCase()}|${name.trim().toLowerCase()}`;
}

function computeSyncPrompts(
  lines: SubmitLine[],
  foods: FoodOption[],
): SyncPrompt[] {
  return lines.flatMap((l) => {
    const f = foods.find(
      (x) => foodKeyOf(x.brand, x.name) === foodKeyOf(l.brand, l.name),
    );
    if (!f) return [];
    const stored = l.unit === "gram" ? f.carbs_per_100g : f.carbs_per_serving;
    if (stored == null || Math.abs(stored - l.carbsPerUnit) < 0.01) return [];
    return [
      {
        brand: l.brand,
        name: l.name,
        unit: l.unit,
        carbsPerUnit: l.carbsPerUnit,
        oldValue: stored,
      },
    ];
  });
}
