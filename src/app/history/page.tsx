import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { listMeals, type ListMealsFilter } from "@/lib/repositories/meals";
import { getSettings } from "@/lib/repositories/settings";
import { estimateIcrIsf, DEFAULT_WINDOW_DAYS } from "@/lib/analysis";
import {
  MEAL_TYPE_LABELS,
  type MealType,
  type Meal,
  type MealFood,
  type Settings,
} from "@/lib/types";
import MealList from "./MealList";
import FoodSearch from "./FoodSearch";
import TimezoneField from "./TimezoneField";

const MEAL_TYPES = Object.keys(MEAL_TYPE_LABELS) as MealType[];

type SearchParams = {
  from?: string;
  to?: string;
  mealType?: string;
  tzOffset?: string;
};

// 將「本地日期 + 時區 offset」換成正確的 UTC 瞬間。
// offsetMin 為分鐘、東為正（台灣 +480）；無 offset（首次未帶）時後備用伺服器本地解讀。
function localDayBoundaryIso(
  date: string,
  endOfDay: boolean,
  offsetMin: number | null,
): string {
  const time = endOfDay ? "23:59:59.999" : "00:00:00.000";
  if (offsetMin == null) return new Date(`${date}T${time}`).toISOString();
  const sign = offsetMin >= 0 ? "+" : "-";
  const abs = Math.abs(offsetMin);
  const hh = String(Math.floor(abs / 60)).padStart(2, "0");
  const mm = String(abs % 60).padStart(2, "0");
  return new Date(`${date}T${time}${sign}${hh}:${mm}`).toISOString();
}

export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const sp = await searchParams;
  const mealType =
    sp.mealType && MEAL_TYPES.includes(sp.mealType as MealType)
      ? (sp.mealType as MealType)
      : undefined;

  const filter: ListMealsFilter = { mealType };
  // 日期欄位為使用者本地日期；用瀏覽器傳來的時區 offset 換算成正確 UTC 日界（6.2）。
  const tzOffset =
    sp.tzOffset && Number.isFinite(Number(sp.tzOffset))
      ? Number(sp.tzOffset)
      : null;
  if (sp.from) filter.from = localDayBoundaryIso(sp.from, false, tzOffset);
  if (sp.to) filter.to = localDayBoundaryIso(sp.to, true, tzOffset);

  // 列表用「依篩選」的餐次；食物統計用「全部」歷史（不受日期篩選影響）。
  const [meals, allMealsWithFoods, settings] = await Promise.all([
    listMeals(supabase, filter),
    listMeals(supabase),
    getSettings(supabase),
  ]);

  const target = {
    low: settings?.target_glucose_low ?? 80,
    high: settings?.target_glucose_high ?? 180,
  };
  const allMeals: Meal[] = allMealsWithFoods;
  const allMealFoods: MealFood[] = allMealsWithFoods.flatMap(
    (m) => m.meal_foods,
  );
  // 迴歸模型（資料夠多才有）供食物殘差「比預期更易升糖」標記。
  const estSettings = (settings ?? {
    target_glucose_low: target.low,
    target_glucose_high: target.high,
    icr: 5,
  }) as Settings;
  const model = estimateIcrIsf(allMeals, estSettings, {
    windowDays: DEFAULT_WINDOW_DAYS,
  }).model;

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-6 px-5 py-8">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">歷史紀錄</h1>
        <nav className="flex gap-3 text-sm text-zinc-500 dark:text-zinc-400">
          <Link href="/log">記錄</Link>
          <Link href="/settings">設定</Link>
          <Link href="/">首頁</Link>
        </nav>
      </div>

      {/* 食物查詢：上次吃 X 的落點統計（分單獨吃/混合餐） */}
      <FoodSearch
        meals={allMeals}
        mealFoods={allMealFoods}
        target={target}
        model={model}
      />

      {/* 篩選（GET 表單，重新整理頁面）*/}
      <form className="flex flex-col gap-3 rounded-xl bg-zinc-50 dark:bg-zinc-800 p-4">
        <TimezoneField />
        <div className="flex gap-2">
          <label className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="text-xs text-zinc-500 dark:text-zinc-400">起</span>
            <input
              type="date"
              name="from"
              defaultValue={sp.from ?? ""}
              className="h-11 w-full rounded-lg border border-zinc-300 dark:border-zinc-700 px-2 text-sm"
            />
          </label>
          <label className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="text-xs text-zinc-500 dark:text-zinc-400">迄</span>
            <input
              type="date"
              name="to"
              defaultValue={sp.to ?? ""}
              className="h-11 w-full rounded-lg border border-zinc-300 dark:border-zinc-700 px-2 text-sm"
            />
          </label>
        </div>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-zinc-500 dark:text-zinc-400">餐別</span>
          <select
            name="mealType"
            defaultValue={mealType ?? ""}
            className="h-11 w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2 text-sm"
          >
            <option value="">全部</option>
            {MEAL_TYPES.map((t) => (
              <option key={t} value={t}>
                {MEAL_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </label>
        <div className="flex gap-2">
          <button
            type="submit"
            className="h-11 flex-1 rounded-lg bg-black dark:bg-white text-sm font-medium text-white dark:text-black"
          >
            篩選
          </button>
          <Link
            href="/history"
            className="flex h-11 flex-1 items-center justify-center rounded-lg border border-zinc-300 dark:border-zinc-700 text-sm text-zinc-600 dark:text-zinc-300"
          >
            清除
          </Link>
        </div>
      </form>

      <p className="text-xs text-zinc-400 dark:text-zinc-500">共 {meals.length} 筆</p>

      <MealList meals={meals} />
    </main>
  );
}
