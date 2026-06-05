"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { MEAL_TYPE_LABELS, type MealType } from "@/lib/types";
import { createMealAction } from "./actions";

type FoodOption = { name: string; carbs_per_serving: number };
type FoodLine = { name: string; carbs: string; quantity: string };

const MEAL_TYPES = Object.keys(MEAL_TYPE_LABELS) as MealType[];

// 以目前時段預設餐別，加快記錄。
function defaultMealType(): MealType {
  const h = new Date().getHours();
  if (h < 11) return "breakfast";
  if (h < 16) return "lunch";
  if (h < 21) return "dinner";
  return "snack";
}

// 現在時間格式化為 <input type="datetime-local"> 需要的本地字串。
function nowLocalInput(): string {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

const inputClass =
  "h-12 w-full rounded-lg border border-zinc-300 px-3 text-base outline-none focus:border-zinc-500";

export default function LogForm({
  foods,
  icr,
}: {
  foods: FoodOption[];
  icr: number;
}) {
  const router = useRouter();

  const [eatenAt, setEatenAt] = useState(nowLocalInput);
  const [mealType, setMealType] = useState<MealType>(defaultMealType);
  const [glucoseBefore, setGlucoseBefore] = useState("");
  const [foodLines, setFoodLines] = useState<FoodLine[]>([
    { name: "", carbs: "", quantity: "1" },
  ]);
  const [insulin, setInsulin] = useState("");
  const [doseTouched, setDoseTouched] = useState(false);
  const [glucoseAfter, setGlucoseAfter] = useState("");
  const [note, setNote] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{
    type: "ok" | "err";
    text: string;
  } | null>(null);

  const totalCarbs = useMemo(
    () =>
      foodLines.reduce((sum, l) => {
        const c = Number(l.carbs);
        const q = Number(l.quantity) || 1;
        return sum + (Number.isFinite(c) ? c * q : 0);
      }, 0),
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
    // 選到庫裡的食物且該列碳水還沒填時，自動帶入單份碳水。
    if (match && !foodLines[i].carbs) {
      updateLine(i, { name, carbs: String(match.carbs_per_serving) });
    } else {
      updateLine(i, { name });
    }
  }

  function addLine() {
    setFoodLines((lines) => [...lines, { name: "", carbs: "", quantity: "1" }]);
  }

  function removeLine(i: number) {
    setFoodLines((lines) =>
      lines.length === 1 ? lines : lines.filter((_, idx) => idx !== i),
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);

    const lines = foodLines
      .filter((l) => l.name.trim() && Number(l.carbs) > 0)
      .map((l) => ({
        name: l.name.trim(),
        carbs: Number(l.carbs),
        quantity: Number(l.quantity) || 1,
      }));

    if (lines.length === 0) {
      setMessage({ type: "err", text: "請至少加入一項有碳水的食物。" });
      return;
    }

    setSubmitting(true);
    try {
      await createMealAction({
        eatenAt: new Date(eatenAt).toISOString(),
        mealType,
        glucoseBefore: glucoseBefore === "" ? null : Number(glucoseBefore),
        insulinUnits: Number(insulinValue) || 0,
        glucoseAfter: glucoseAfter === "" ? null : Number(glucoseAfter),
        note: note.trim() || null,
        foods: lines,
      });

      // 重設可變欄位，保留時間/餐別以利連續記錄。
      setFoodLines([{ name: "", carbs: "", quantity: "1" }]);
      setGlucoseBefore("");
      setGlucoseAfter("");
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
                  ? "border-black bg-black text-white"
                  : "border-zinc-300 bg-white text-zinc-700"
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
          {foods.map((f) => (
            <option key={f.name} value={f.name} />
          ))}
        </datalist>
        <div className="flex flex-col gap-2">
          {foodLines.map((line, i) => (
            <div
              key={i}
              className="flex flex-col gap-2 rounded-lg border border-zinc-200 p-2"
            >
              <div className="flex gap-2">
                <input
                  list="food-options"
                  value={line.name}
                  onChange={(e) => onPickFood(i, e.target.value)}
                  placeholder="輸入或選擇食物"
                  className={`${inputClass} flex-1`}
                />
                <button
                  type="button"
                  onClick={() => removeLine(i)}
                  aria-label="移除這項食物"
                  className="h-12 w-12 shrink-0 rounded-lg border border-zinc-300 text-xl text-zinc-500"
                >
                  ×
                </button>
              </div>
              <div className="flex gap-2">
                <label className="flex flex-1 flex-col gap-1">
                  <span className="text-xs text-zinc-500">碳水（克）</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    step="any"
                    value={line.carbs}
                    onChange={(e) => updateLine(i, { carbs: e.target.value })}
                    placeholder="例：60"
                    className={inputClass}
                  />
                </label>
                <label className="flex flex-1 flex-col gap-1">
                  <span className="text-xs text-zinc-500">份數</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    min="1"
                    value={line.quantity}
                    onChange={(e) => updateLine(i, { quantity: e.target.value })}
                    placeholder="1"
                    className={inputClass}
                  />
                </label>
              </div>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={addLine}
          className="mt-2 h-11 rounded-lg border border-dashed border-zinc-400 text-sm text-zinc-600"
        >
          ＋ 新增食物
        </button>
        <p className="mt-1 text-xs text-zinc-400">
          庫裡已有的食物，選到後會自動帶入碳水。
        </p>
      </Field>

      {/* 加總與建議劑量 */}
      <div className="rounded-xl bg-zinc-50 p-4">
        <div className="flex items-center justify-between text-sm">
          <span className="text-zinc-600">總碳水</span>
          <span className="text-lg font-semibold">{round1(totalCarbs)} g</span>
        </div>
        <div className="mt-2 flex items-center justify-between text-sm">
          <span className="text-zinc-600">建議劑量（碳水 ÷ ICR {icr}）</span>
          <span className="text-lg font-semibold">
            {round1(suggestedDose)} 單位
          </span>
        </div>
        <p className="mt-2 text-xs leading-5 text-amber-700">
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
            message.type === "ok" ? "text-green-600" : "text-red-600"
          }`}
        >
          {message.text}
        </p>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="h-14 rounded-xl bg-black text-lg font-medium text-white disabled:opacity-50"
      >
        {submitting ? "記錄中…" : "記錄這一餐"}
      </button>
    </form>
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
      <span className="text-sm font-medium text-zinc-700">{label}</span>
      {children}
    </label>
  );
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
