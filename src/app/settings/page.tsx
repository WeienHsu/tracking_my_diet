import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getSettings } from "@/lib/repositories/settings";
import { DEFAULT_MEAL_CENTERS, type SettingsInput } from "@/lib/types";
import SettingsForm from "./SettingsForm";
import ThemeToggle from "./ThemeToggle";

// 設定未建立時的預設值（與 DB 欄位預設一致）。
const DEFAULTS: SettingsInput = {
  icr: 5,
  target_glucose_low: 80,
  target_glucose_high: 180,
  breakfast_center_min: DEFAULT_MEAL_CENTERS.breakfast_min,
  lunch_center_min: DEFAULT_MEAL_CENTERS.lunch_min,
  dinner_center_min: DEFAULT_MEAL_CENTERS.dinner_min,
  meal_window_min: DEFAULT_MEAL_CENTERS.window_min,
  isf: null,
  correction_target: null,
  advanced_dose: false,
  insulin_dia_min: 300,
  insulin_peak_min: 75,
  iob_auto_subtract: false,
};

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const settings = await getSettings(supabase);

  const initial: SettingsInput = settings
    ? {
        icr: settings.icr,
        target_glucose_low: settings.target_glucose_low,
        target_glucose_high: settings.target_glucose_high,
        breakfast_center_min:
          settings.breakfast_center_min ?? DEFAULTS.breakfast_center_min,
        lunch_center_min:
          settings.lunch_center_min ?? DEFAULTS.lunch_center_min,
        dinner_center_min:
          settings.dinner_center_min ?? DEFAULTS.dinner_center_min,
        meal_window_min: settings.meal_window_min ?? DEFAULTS.meal_window_min,
        isf: settings.isf ?? null,
        correction_target: settings.correction_target ?? null,
        advanced_dose: settings.advanced_dose ?? false,
        insulin_dia_min: settings.insulin_dia_min ?? DEFAULTS.insulin_dia_min,
        insulin_peak_min: settings.insulin_peak_min ?? DEFAULTS.insulin_peak_min,
        iob_auto_subtract: settings.iob_auto_subtract ?? false,
      }
    : DEFAULTS;

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-5 px-5 py-8">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">設定</h1>
        <nav className="flex gap-3 text-sm text-zinc-500 dark:text-zinc-400">
          <Link href="/a1c">A1C</Link>
          <Link href="/">首頁</Link>
        </nav>
      </div>

      <ThemeToggle />

      <SettingsForm initial={initial} />
    </main>
  );
}
