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
          <p className="text-sm text-zinc-600">
            已登入：<strong>{user.email}</strong>
          </p>
          <div className="flex gap-3">
            <Link
              href="/log"
              className="flex h-12 items-center rounded-lg bg-black px-6 text-base font-medium text-white"
            >
              記錄一餐
            </Link>
            <Link
              href="/history"
              className="flex h-12 items-center rounded-lg border border-zinc-300 px-6 text-base font-medium"
            >
              歷史紀錄
            </Link>
            <Link
              href="/analysis"
              className="flex h-12 items-center rounded-lg border border-zinc-300 px-6 text-base font-medium"
            >
              分析
            </Link>
          </div>
          <form action="/auth/signout" method="post">
            <button
              type="submit"
              className="h-11 rounded-lg border border-zinc-300 px-5 text-sm font-medium"
            >
              登出
            </button>
          </form>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-4">
          <p className="text-sm text-zinc-600">尚未登入。</p>
          <Link
            href="/login"
            className="flex h-11 items-center rounded-lg bg-black px-5 text-sm font-medium text-white"
          >
            前往登入
          </Link>
        </div>
      )}
    </main>
  );
}
