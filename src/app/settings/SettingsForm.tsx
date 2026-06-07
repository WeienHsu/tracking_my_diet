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

    setSaving(true);
    try {
      const res = await saveSettingsAction({
        icr: icrNum,
        target_glucose_low: Number(low),
        target_glucose_high: Number(high),
        breakfast_end_hour: Number(breakfastEnd),
        lunch_end_hour: Number(lunchEnd),
        dinner_end_hour: Number(dinnerEnd),
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
