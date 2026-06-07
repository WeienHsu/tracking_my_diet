import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { listFoods } from "@/lib/repositories/foods";
import FoodsManager from "./FoodsManager";

export default async function FoodsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const foods = await listFoods(supabase);

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-5 px-5 py-8">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">食物庫管理</h1>
        <nav className="flex gap-3 text-sm text-zinc-500 dark:text-zinc-400">
          <Link href="/log">記錄</Link>
          <Link href="/">首頁</Link>
        </nav>
      </div>
      <p className="text-xs text-zinc-400 dark:text-zinc-500">
        編輯或刪除食物庫項目（例如打錯字的紀錄）。刪除不影響既有歷史紀錄的顯示。
      </p>
      <FoodsManager foods={foods} />
    </main>
  );
}
