import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { listFoods } from "@/lib/repositories/foods";
import { getSettings } from "@/lib/repositories/settings";
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

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-5 px-5 py-8">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">記錄一餐</h1>
        <Link href="/" className="text-sm text-zinc-500">
          首頁
        </Link>
      </div>

      <LogForm
        foods={foods.map((f) => ({
          name: f.name,
          carbs_per_serving: f.carbs_per_serving,
        }))}
        icr={icr}
      />
    </main>
  );
}
