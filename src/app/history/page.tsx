import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { listMeals, type ListMealsFilter } from "@/lib/repositories/meals";
import { MEAL_TYPE_LABELS, type MealType } from "@/lib/types";
import MealList from "./MealList";
import FoodSearch from "./FoodSearch";

const MEAL_TYPES = Object.keys(MEAL_TYPE_LABELS) as MealType[];

type SearchParams = {
  from?: string;
  to?: string;
  mealType?: string;
};

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
  // 日期欄位為本地日期；起始含當日 00:00、結束含當日 23:59。
  if (sp.from) filter.from = new Date(`${sp.from}T00:00`).toISOString();
  if (sp.to) filter.to = new Date(`${sp.to}T23:59:59`).toISOString();

  const meals = await listMeals(supabase, filter);

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-6 px-5 py-8">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">歷史紀錄</h1>
        <nav className="flex gap-3 text-sm text-zinc-500">
          <Link href="/log">記錄</Link>
          <Link href="/">首頁</Link>
        </nav>
      </div>

      {/* 食物查詢：上次吃 X 的碳水與餐後結果 */}
      <FoodSearch />

      {/* 篩選（GET 表單，重新整理頁面）*/}
      <form className="flex flex-col gap-3 rounded-xl bg-zinc-50 p-4">
        <div className="flex gap-2">
          <label className="flex flex-1 flex-col gap-1">
            <span className="text-xs text-zinc-500">起</span>
            <input
              type="date"
              name="from"
              defaultValue={sp.from ?? ""}
              className="h-11 w-full rounded-lg border border-zinc-300 px-2 text-sm"
            />
          </label>
          <label className="flex flex-1 flex-col gap-1">
            <span className="text-xs text-zinc-500">迄</span>
            <input
              type="date"
              name="to"
              defaultValue={sp.to ?? ""}
              className="h-11 w-full rounded-lg border border-zinc-300 px-2 text-sm"
            />
          </label>
        </div>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-zinc-500">餐別</span>
          <select
            name="mealType"
            defaultValue={mealType ?? ""}
            className="h-11 w-full rounded-lg border border-zinc-300 bg-white px-2 text-sm"
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
            className="h-11 flex-1 rounded-lg bg-black text-sm font-medium text-white"
          >
            篩選
          </button>
          <Link
            href="/history"
            className="flex h-11 flex-1 items-center justify-center rounded-lg border border-zinc-300 text-sm text-zinc-600"
          >
            清除
          </Link>
        </div>
      </form>

      <p className="text-xs text-zinc-400">共 {meals.length} 筆</p>

      <MealList meals={meals} />
    </main>
  );
}
