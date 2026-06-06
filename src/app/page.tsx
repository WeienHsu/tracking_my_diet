import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { listMeals } from "@/lib/repositories/meals";
import { listA1c } from "@/lib/repositories/a1c";
import { buildTrend } from "@/lib/analysis";
import HomeCharts from "./HomeCharts";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-6 px-6 text-center">
        <h1 className="text-2xl font-semibold">血糖 × 胰島素記錄</h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-300">尚未登入。</p>
        <Link
          href="/login"
          className="flex h-11 items-center rounded-lg bg-black dark:bg-white px-5 text-sm font-medium text-white dark:text-black"
        >
          前往登入
        </Link>
      </main>
    );
  }

  const [meals, a1cRecords] = await Promise.all([
    listMeals(supabase),
    listA1c(supabase),
  ]);

  const trend = buildTrend(meals);
  // A1C 由舊到新；measured_at 為 YYYY-MM-DD。
  const a1c = [...a1cRecords].reverse().map((r) => ({
    t: new Date(r.measured_at).toLocaleDateString("zh-TW", {
      year: "2-digit",
      month: "numeric",
    }),
    value: Number(r.value),
  }));

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-5 px-5 py-8">
      <h1 className="text-2xl font-semibold">血糖 × 胰島素記錄</h1>

      <div className="flex items-center justify-between gap-3">
        <p className="min-w-0 truncate text-sm text-zinc-600 dark:text-zinc-300">
          已登入：<strong>{user.email}</strong>
        </p>
        <form action="/auth/signout" method="post">
          <button
            type="submit"
            className="h-10 shrink-0 rounded-lg border border-zinc-300 dark:border-zinc-700 px-4 text-sm font-medium"
          >
            登出
          </button>
        </form>
      </div>

      {/* 導覽 */}
      <div className="grid grid-cols-2 gap-3">
        <Link
          href="/log"
          className="flex h-12 items-center justify-center rounded-lg bg-black dark:bg-white text-base font-medium text-white dark:text-black"
        >
          記錄一餐
        </Link>
        <Link
          href="/history"
          className="flex h-12 items-center justify-center rounded-lg border border-zinc-300 dark:border-zinc-700 text-base font-medium"
        >
          歷史紀錄
        </Link>
        <Link
          href="/analysis"
          className="flex h-12 items-center justify-center rounded-lg border border-zinc-300 dark:border-zinc-700 text-base font-medium"
        >
          分析
        </Link>
        <Link
          href="/a1c"
          className="flex h-12 items-center justify-center rounded-lg border border-zinc-300 dark:border-zinc-700 text-base font-medium"
        >
          A1C
        </Link>
      </div>

      {/* 血糖 + A1C 線圖 */}
      <HomeCharts trend={trend} a1c={a1c} />

      <Link
        href="/settings"
        className="self-center text-sm text-zinc-600 dark:text-zinc-300 underline"
      >
        設定
      </Link>
    </main>
  );
}
