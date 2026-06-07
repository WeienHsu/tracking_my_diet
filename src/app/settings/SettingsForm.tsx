"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { SettingsInput } from "@/lib/types";
import { saveSettingsAction } from "./actions";

const inputClass =
  "h-12 w-full rounded-lg border border-zinc-300 dark:border-zinc-700 px-3 text-base outline-none focus:border-zinc-500";

// 常見胰島素的 IOB 指數曲線參數（peak 高峰、dia 作用時間，分鐘）。
// 為通用估計值，務必依實際用藥與醫師確認。
const INSULIN_PRESETS: { label: string; peak: number; dia: number }[] = [
  { label: "速效類似物（NovoRapid／Humalog／Apidra）", peak: 75, dia: 300 },
  { label: "超速效（Fiasp／Lyumjev）", peak: 55, dia: 300 },
  { label: "短效人類（Regular／R）", peak: 150, dia: 360 },
];

export default function SettingsForm({ initial }: { initial: SettingsInput }) {
  const router = useRouter();

  const [icr, setIcr] = useState(String(initial.icr));
  const [low, setLow] = useState(String(initial.target_glucose_low));
  const [high, setHigh] = useState(String(initial.target_glucose_high));
  // 餐別中心時間（HH:MM）與判定半徑（分鐘）。
  const [breakfastCenter, setBreakfastCenter] = useState(
    minToTime(initial.breakfast_center_min),
  );
  const [lunchCenter, setLunchCenter] = useState(
    minToTime(initial.lunch_center_min),
  );
  const [dinnerCenter, setDinnerCenter] = useState(
    minToTime(initial.dinner_center_min),
  );
  const [windowMin, setWindowMin] = useState(String(initial.meal_window_min));
  // 分析：餐後讀數有效窗（以小時呈現，存分鐘）。
  const [postmealLoHr, setPostmealLoHr] = useState(
    String(initial.postmeal_window_lo_min / 60),
  );
  const [postmealHiHr, setPostmealHiHr] = useState(
    String(initial.postmeal_window_hi_min / 60),
  );
  // 進階建議劑量（模組一/四）。
  const [advancedDose, setAdvancedDose] = useState(initial.advanced_dose);
  const [isf, setIsf] = useState(initial.isf != null ? String(initial.isf) : "");
  const [correctionTarget, setCorrectionTarget] = useState(
    initial.correction_target != null ? String(initial.correction_target) : "",
  );
  // IOB 參數（指數曲線，依胰島素）。
  const [diaMin, setDiaMin] = useState(String(initial.insulin_dia_min));
  const [peakMin, setPeakMin] = useState(String(initial.insulin_peak_min));
  const [iobAutoSubtract, setIobAutoSubtract] = useState(
    initial.iob_auto_subtract,
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
        breakfast_center_min: timeToMin(breakfastCenter),
        lunch_center_min: timeToMin(lunchCenter),
        dinner_center_min: timeToMin(dinnerCenter),
        meal_window_min: Number(windowMin),
        postmeal_window_lo_min: Math.round(Number(postmealLoHr) * 60),
        postmeal_window_hi_min: Math.round(Number(postmealHiHr) * 60),
        isf: isfNum,
        correction_target:
          correctionTarget.trim() === "" ? null : Number(correctionTarget),
        advanced_dose: advancedDose,
        insulin_dia_min: Number(diaMin),
        insulin_peak_min: Number(peakMin),
        iob_auto_subtract: iobAutoSubtract,
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
          餐別自動判定（三餐中心時間 ±半徑）
        </span>
        <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">
          記錄時依現在時間預設餐別：落在某一餐中心的前後半徑內就算那一餐，都不在則算點心。
        </p>
        <div className="mt-2 grid grid-cols-3 gap-2">
          <TimeField label="早餐中心" value={breakfastCenter} onChange={setBreakfastCenter} />
          <TimeField label="午餐中心" value={lunchCenter} onChange={setLunchCenter} />
          <TimeField label="晚餐中心" value={dinnerCenter} onChange={setDinnerCenter} />
        </div>
        <label className="mt-2 flex flex-col gap-1">
          <span className="text-xs text-zinc-500 dark:text-zinc-400">
            判定半徑（前後幾分鐘內算同一餐，預設 90＝1.5 小時）
          </span>
          <input
            type="number"
            inputMode="numeric"
            min="15"
            max="240"
            value={windowMin}
            onChange={(e) => setWindowMin(e.target.value)}
            className={inputClass}
            required
          />
        </label>
      </div>

      {/* 分析：餐後讀數有效窗（B′）*/}
      <div>
        <span className="text-sm font-medium text-zinc-700 dark:text-zinc-200">
          分析採用的餐後讀數時間窗（小時）
        </span>
        <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">
          只有「餐後量測時間」落在此範圍的讀數才納入 ICR/ISF 迴歸（ADA 標準約 1–2h，預設 1.5–3h）。
          其餘照存、照顯示、照算落點，只是不進迴歸；未記量測時間的舊資料照舊納入。
        </p>
        <div className="mt-2 flex items-center gap-2">
          <input
            type="number"
            inputMode="decimal"
            step="0.5"
            min="0"
            value={postmealLoHr}
            onChange={(e) => setPostmealLoHr(e.target.value)}
            className={inputClass}
            required
          />
          <span className="text-zinc-400 dark:text-zinc-500">–</span>
          <input
            type="number"
            inputMode="decimal"
            step="0.5"
            min="0"
            value={postmealHiHr}
            onChange={(e) => setPostmealHiHr(e.target.value)}
            className={inputClass}
            required
          />
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

            {/* 活性胰島素（IOB）參數：指數曲線，依胰島素 */}
            <Field label="胰島素（帶入 IOB 曲線預設，可再微調）">
              <select
                value={(() => {
                  const i = INSULIN_PRESETS.findIndex(
                    (p) => String(p.dia) === diaMin && String(p.peak) === peakMin,
                  );
                  return i >= 0 ? String(i) : "custom";
                })()}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === "custom") return;
                  const p = INSULIN_PRESETS[Number(v)];
                  setDiaMin(String(p.dia));
                  setPeakMin(String(p.peak));
                }}
                className={`${inputClass} bg-white dark:bg-zinc-900`}
              >
                {INSULIN_PRESETS.map((p, i) => (
                  <option key={i} value={i}>
                    {p.label}
                  </option>
                ))}
                <option value="custom">自訂</option>
              </select>
            </Field>

            <IobInfo />

            <div className="flex gap-2">
              <Field label="作用時間 DIA（分鐘）">
                <input
                  type="number"
                  inputMode="numeric"
                  value={diaMin}
                  onChange={(e) => setDiaMin(e.target.value)}
                  className={inputClass}
                />
              </Field>
              <Field label="高峰 peak（分鐘）">
                <input
                  type="number"
                  inputMode="numeric"
                  value={peakMin}
                  onChange={(e) => setPeakMin(e.target.value)}
                  className={inputClass}
                />
              </Field>
            </div>
            <label className="flex items-start gap-3">
              <input
                type="checkbox"
                checked={iobAutoSubtract}
                onChange={(e) => setIobAutoSubtract(e.target.checked)}
                className="mt-1 h-5 w-5 shrink-0"
              />
              <span className="text-sm">
                <span className="font-medium text-zinc-800 dark:text-zinc-100">
                  自動從建議劑量扣除活性胰島素（IOB）
                </span>
                <span className="block text-xs text-zinc-500 dark:text-zinc-400">
                  預設關閉（只顯示疊藥提醒）。開啟後建議會直接扣掉殘留胰島素，請特別留意低血糖風險。
                </span>
              </span>
            </label>

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

function TimeField({
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
        type="time"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-12 w-full rounded-lg border border-zinc-300 dark:border-zinc-700 px-2 text-base outline-none focus:border-zinc-500"
        required
      />
    </label>
  );
}

// 分鐘 of day ↔ "HH:MM"。
function minToTime(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
function timeToMin(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

// IOB 參數說明與來源：點擊展開（手機桌面皆適用）。
function IobInfo() {
  return (
    <details className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/50 text-xs">
      <summary className="cursor-pointer select-none px-3 py-2 text-zinc-600 dark:text-zinc-300">
        ⓘ IOB 參數說明與來源
      </summary>
      <div className="flex flex-col gap-2 border-t border-zinc-200 dark:border-zinc-700 px-3 py-2 text-zinc-600 dark:text-zinc-300">
        <p>
          活性胰島素（IOB）用指數衰減曲線估算，由 <strong>peak（高峰）</strong> 與{" "}
          <strong>DIA（作用時間）</strong> 兩參數決定，依你用的胰島素而不同：
        </p>
        <table className="w-full border-collapse">
          <thead>
            <tr className="text-left text-zinc-500 dark:text-zinc-400">
              <th className="py-0.5 pr-2 font-medium">胰島素</th>
              <th className="py-0.5 pr-2 font-medium">peak</th>
              <th className="py-0.5 font-medium">DIA</th>
            </tr>
          </thead>
          <tbody>
            {INSULIN_PRESETS.map((p, i) => (
              <tr key={i} className="border-t border-zinc-200 dark:border-zinc-700">
                <td className="py-0.5 pr-2">{p.label}</td>
                <td className="py-0.5 pr-2">{p.peak} 分</td>
                <td className="py-0.5">
                  {Math.round((p.dia / 60) * 10) / 10} 小時
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p>
          <strong>NovoRapid FlexPen</strong>（成分 aspart）：FlexPen 只是注射筆、不影響藥效，
          請選「速效類似物」那組（peak 75／DIA 5h）。
          <strong>注意 NovoRapid ≠ Fiasp</strong>，Fiasp 才選「超速效」。
          有人覺得 NovoRapid 尾巴較長，可把 DIA 調到 6 小時。
        </p>
        <p className="text-zinc-500 dark:text-zinc-400">
          參數為開源控糖系統（Loop／OpenAPS）通用值，<strong>非醫療指示</strong>，請與你的醫師／衛教師確認。來源：
        </p>
        <ul className="flex flex-col gap-1">
          <li>
            <a
              href="https://openaps.readthedocs.io/en/latest/docs/While%20You%20Wait%20For%20Gear/understanding-insulin-on-board-calculations.html"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 dark:text-blue-400 underline"
            >
              OpenAPS：Understanding IOB Calculations
            </a>
          </li>
          <li>
            <a
              href="https://bionicwookiee.com/2021/04/26/subtleties-of-insulin-duration/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 dark:text-blue-400 underline"
            >
              Bionic Wookiee：Subtleties of insulin duration
            </a>
          </li>
          <li>
            <a
              href="https://bionicwookiee.com/2022/12/04/insulin-timings-2022/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 dark:text-blue-400 underline"
            >
              Bionic Wookiee：Insulin timings (2022)
            </a>
          </li>
        </ul>
      </div>
    </details>
  );
}
