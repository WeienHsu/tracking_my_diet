"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { SettingsInput } from "@/lib/types";
import { saveSettingsAction } from "./actions";

const inputClass =
  "h-12 w-full rounded-lg border border-zinc-300 dark:border-zinc-700 px-3 text-base outline-none focus:border-zinc-500";

export default function SettingsForm({ initial }: { initial: SettingsInput }) {
  const router = useRouter();

  const [icr, setIcr] = useState(String(initial.icr));
  const [low, setLow] = useState(String(initial.target_glucose_low));
  const [high, setHigh] = useState(String(initial.target_glucose_high));
  const [breakfastEnd, setBreakfastEnd] = useState(
    String(initial.breakfast_end_hour),
  );
  const [lunchEnd, setLunchEnd] = useState(String(initial.lunch_end_hour));
  const [dinnerEnd, setDinnerEnd] = useState(String(initial.dinner_end_hour));
  // 進階建議劑量（模組一/四）。
  const [advancedDose, setAdvancedDose] = useState(initial.advanced_dose);
  const [isf, setIsf] = useState(initial.isf != null ? String(initial.isf) : "");
  const [correctionTarget, setCorrectionTarget] = useState(
    initial.correction_target != null ? String(initial.correction_target) : "",
  );

  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{
    type: "ok" | "err";
    text: string;
  } | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);

    const icrNum = Number(icr);
    if (!Number.isFinite(icrNum) || icrNum <= 0) {
      setMessage({ type: "err", text: "ICR 必須大於 0。" });
      return;
    }

    const isfNum = isf.trim() === "" ? null : Number(isf);
    if (advancedDose && (isfNum == null || !(isfNum > 0))) {
      setMessage({ type: "err", text: "開啟進階建議劑量時，ISF 必須大於 0。" });
      return;
    }

    setSaving(true);
    try {
      const res = await saveSettingsAction({
        icr: icrNum,
        target_glucose_low: Number(low),
        target_glucose_high: Number(high),
        breakfast_end_hour: Number(breakfastEnd),
        lunch_end_hour: Number(lunchEnd),
        dinner_end_hour: Number(dinnerEnd),
        isf: isfNum,
        correction_target:
          correctionTarget.trim() === "" ? null : Number(correctionTarget),
        advanced_dose: advancedDose,
      });
      if (!res.ok) {
        setMessage({ type: "err", text: res.error });
        return;
      }
      setMessage({ type: "ok", text: "已儲存設定 ✓" });
      router.refresh();
    } catch (err) {
      setMessage({
        type: "err",
        text: err instanceof Error ? err.message : "儲存失敗，請再試一次。",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <Field label="ICR（每幾克碳水打 1 單位）">
        <input
          type="number"
          inputMode="decimal"
          step="any"
          min="0"
          value={icr}
          onChange={(e) => setIcr(e.target.value)}
          className={inputClass}
          required
        />
      </Field>

      <div>
        <span className="text-sm font-medium text-zinc-700 dark:text-zinc-200">
          目標餐後血糖範圍（mg/dL）
        </span>
        <div className="mt-1.5 flex items-center gap-2">
          <input
            type="number"
            inputMode="numeric"
            value={low}
            onChange={(e) => setLow(e.target.value)}
            placeholder="下限"
            className={inputClass}
            required
          />
          <span className="text-zinc-400 dark:text-zinc-500">–</span>
          <input
            type="number"
            inputMode="numeric"
            value={high}
            onChange={(e) => setHigh(e.target.value)}
            placeholder="上限"
            className={inputClass}
            required
          />
        </div>
      </div>

      <div>
        <span className="text-sm font-medium text-zinc-700 dark:text-zinc-200">
          餐別自動判定時段（小時，0–23）
        </span>
        <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">
          記錄時依現在時間預設餐別：此時前算早餐／午餐／晚餐，晚餐邊界之後算點心。
        </p>
        <div className="mt-2 grid grid-cols-3 gap-2">
          <HourField label="早餐前" value={breakfastEnd} onChange={setBreakfastEnd} />
          <HourField label="午餐前" value={lunchEnd} onChange={setLunchEnd} />
          <HourField label="晚餐前" value={dinnerEnd} onChange={setDinnerEnd} />
        </div>
      </div>

      {/* 進階建議劑量（模組一/四）*/}
      <div className="flex flex-col gap-3 rounded-xl border border-zinc-200 dark:border-zinc-700 p-4">
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={advancedDose}
            onChange={(e) => setAdvancedDose(e.target.checked)}
            className="mt-1 h-5 w-5 shrink-0"
          />
          <span className="text-sm">
            <span className="font-medium text-zinc-800 dark:text-zinc-100">
              啟用進階建議劑量
            </span>
            <span className="block text-xs text-zinc-500 dark:text-zinc-400">
              在「碳水 ÷ ICR」之外，加入餐前血糖校正與活性胰島素（IOB）防疊藥。關閉則維持單純換算。
            </span>
          </span>
        </label>

        {advancedDose && (
          <div className="flex flex-col gap-3">
            <Field label="ISF 胰島素敏感因子（每 1 單位約降多少 mg/dL）">
              <input
                type="number"
                inputMode="decimal"
                step="any"
                min="0"
                value={isf}
                onChange={(e) => setIsf(e.target.value)}
                placeholder="例：40"
                className={inputClass}
              />
            </Field>
            <Field label="校正目標血糖（餐前偏離此值才校正，留空則不校正）">
              <input
                type="number"
                inputMode="numeric"
                value={correctionTarget}
                onChange={(e) => setCorrectionTarget(e.target.value)}
                placeholder="例：110"
                className={inputClass}
              />
            </Field>
            <p className="text-xs leading-5 text-amber-700 dark:text-amber-400">
              ⚠️ 進階建議會算出更接近「可直接施打」的數字，但<strong>仍僅供參考、不可取代專業醫療判斷</strong>。
              ISF／目標血糖請與你的醫師／衛教師確認；校正與疊藥估算為簡化模型。
            </p>
          </div>
        )}
      </div>

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
        disabled={saving}
        className="h-14 rounded-xl bg-black dark:bg-white text-lg font-medium text-white dark:text-black disabled:opacity-50"
      >
        {saving ? "儲存中…" : "儲存設定"}
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
      <span className="text-sm font-medium text-zinc-700 dark:text-zinc-200">{label}</span>
      {children}
    </label>
  );
}

function HourField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-zinc-500 dark:text-zinc-400">{label}</span>
      <input
        type="number"
        inputMode="numeric"
        min="0"
        max="23"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-12 w-full rounded-lg border border-zinc-300 dark:border-zinc-700 px-3 text-base outline-none focus:border-zinc-500"
        required
      />
    </label>
  );
}
