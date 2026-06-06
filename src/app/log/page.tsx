import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { listFoods } from "@/lib/repositories/foods";
import { getSettings } from "@/lib/repositories/settings";
import { DEFAULT_MEAL_RANGE, type MealRange } from "@/lib/types";
import LogForm from "./LogForm";

export default async function LogPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [foods, settings] = await Promise.all([
    listFoods(supabase),
    getSettings(supabase),
  ]);

  const icr = settings?.icr ?? 5; // 預設 5g 碳水 / 1 單位
  const mealRange: MealRange = {
    breakfast_end_hour:
      settings?.breakfast_end_hour ?? DEFAULT_MEAL_RANGE.breakfast_end_hour,
    lunch_end_hour: settings?.lunch_end_hour ?? DEFAULT_MEAL_RANGE.lunch_end_hour,
    dinner_end_hour:
      settings?.dinner_end_hour ?? DEFAULT_MEAL_RANGE.dinner_end_hour,
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-5 px-5 py-8">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">記錄一餐</h1>
        <nav className="flex gap-3 text-sm text-zinc-500 dark:text-zinc-400">
          <Link href="/settings">設定</Link>
          <Link href="/">首頁</Link>
        </nav>
      </div>

      <LogForm
        foods={foods.map((f) => ({
          brand: f.brand,
          name: f.name,
          carbs_per_serving: f.carbs_per_serving,
        }))}
        icr={icr}
        mealRange={mealRange}
      />
    </main>
  );
}
