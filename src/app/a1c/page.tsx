import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { listA1c } from "@/lib/repositories/a1c";
import A1cManager from "./A1cManager";

export default async function A1cPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const records = await listA1c(supabase);

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-5 px-5 py-8">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">A1C 紀錄</h1>
        <nav className="flex gap-3 text-sm text-zinc-500 dark:text-zinc-400">
          <Link href="/settings">設定</Link>
          <Link href="/">首頁</Link>
        </nav>
      </div>

      <p className="text-xs leading-5 text-zinc-400 dark:text-zinc-500">
        A1C（糖化血色素）反映過去約 2–3 個月的平均血糖，通常每隔一段時間抽血一次，作為長期回顧的指標。
      </p>

      <A1cManager records={records} />
    </main>
  );
}
