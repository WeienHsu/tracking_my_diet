import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { listFoods } from "@/lib/repositories/foods";
import { listMeals } from "@/lib/repositories/meals";
import { getSettings } from "@/lib/repositories/settings";
import { estimateIcrIsf, DEFAULT_WINDOW_DAYS } from "@/lib/analysis";
import {
  DEFAULT_MEAL_RANGE,
  type Meal,
  type MealFood,
  type MealRange,
  type Settings,
} from "@/lib/types";
import LogForm from "./LogForm";

export default async function LogPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [foods, settings, mealsWithFoods] = await Promise.all([
    listFoods(supabase),
    getSettings(supabase),
    listMeals(supabase),
  ]);

  const icr = settings?.icr ?? 5; // 預設 5g 碳水 / 1 單位
  const target = {
    low: settings?.target_glucose_low ?? 80,
    high: settings?.target_glucose_high ?? 180,
  };
  const mealRange: MealRange = {
    breakfast_end_hour:
      settings?.breakfast_end_hour ?? DEFAULT_MEAL_RANGE.breakfast_end_hour,
    lunch_end_hour: settings?.lunch_end_hour ?? DEFAULT_MEAL_RANGE.lunch_end_hour,
    dinner_end_hour:
      settings?.dinner_end_hour ?? DEFAULT_MEAL_RANGE.dinner_end_hour,
  };

  // 做法 A：把歷史餐次帶進前端，輸入食物時即時算統計（單人、資料量小）。
  // MealWithFoods 繼承 Meal，可直接當 Meal[] 用；食物明細另外攤平。
  const meals: Meal[] = mealsWithFoods;
  const mealFoods: MealFood[] = mealsWithFoods.flatMap((m) => m.meal_foods);

  // 進階建議劑量設定（模組一/四）。
  const isf = settings?.isf ?? null;
  const correctionTarget = settings?.correction_target ?? null;
  const advancedDose = settings?.advanced_dose ?? false;

  // 1.2：反推 ICR（近 N 天），記錄頁可一鍵切換採用。
  const estSettings = (settings ?? {
    icr,
    target_glucose_low: target.low,
    target_glucose_high: target.high,
  }) as Settings;
  const icrEstimate = estimateIcrIsf(meals, estSettings, {
    windowDays: DEFAULT_WINDOW_DAYS,
  }).icr;

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-5 px-5 py-8">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">記錄一餐</h1>
        <nav className="flex gap-3 text-sm text-zinc-500 dark:text-zinc-400">
          <Link href="/foods">食物庫</Link>
          <Link href="/settings">設定</Link>
          <Link href="/">首頁</Link>
        </nav>
      </div>

      <LogForm
        foods={foods.map((f) => ({
          brand: f.brand,
          name: f.name,
          carbs_per_serving: f.carbs_per_serving,
          carbs_per_100g: f.carbs_per_100g,
          serving_grams: f.serving_grams,
        }))}
        icr={icr}
        mealRange={mealRange}
        meals={meals}
        mealFoods={mealFoods}
        target={target}
        isf={isf}
        correctionTarget={correctionTarget}
        advancedDose={advancedDose}
        icrEstimate={icrEstimate}
      />
    </main>
  );
}
