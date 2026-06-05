import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 px-6 text-center">
      <h1 className="text-2xl font-semibold">血糖 × 胰島素記錄</h1>

      {user ? (
        <div className="flex flex-col items-center gap-4">
          <p className="text-sm text-zinc-600 dark:text-zinc-300">
            已登入：<strong>{user.email}</strong>
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <Link
              href="/log"
              className="flex h-12 items-center rounded-lg bg-black dark:bg-white px-6 text-base font-medium text-white dark:text-black"
            >
              記錄一餐
            </Link>
            <Link
              href="/history"
              className="flex h-12 items-center rounded-lg border border-zinc-300 dark:border-zinc-700 px-6 text-base font-medium"
            >
              歷史紀錄
            </Link>
            <Link
              href="/analysis"
              className="flex h-12 items-center rounded-lg border border-zinc-300 dark:border-zinc-700 px-6 text-base font-medium"
            >
              分析
            </Link>
            <Link
              href="/a1c"
              className="flex h-12 items-center rounded-lg border border-zinc-300 dark:border-zinc-700 px-6 text-base font-medium"
            >
              A1C
            </Link>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/settings" className="text-sm text-zinc-600 dark:text-zinc-300 underline">
              設定
            </Link>
            <form action="/auth/signout" method="post">
              <button
                type="submit"
                className="h-11 rounded-lg border border-zinc-300 dark:border-zinc-700 px-5 text-sm font-medium"
              >
                登出
              </button>
            </form>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-4">
          <p className="text-sm text-zinc-600 dark:text-zinc-300">尚未登入。</p>
          <Link
            href="/login"
            className="flex h-11 items-center rounded-lg bg-black dark:bg-white px-5 text-sm font-medium text-white dark:text-black"
          >
            前往登入
          </Link>
        </div>
      )}
    </main>
  );
}
