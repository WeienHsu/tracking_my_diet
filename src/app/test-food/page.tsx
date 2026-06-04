import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { listFoods, createFood } from "@/lib/repositories/foods";

// Phase 2 測試頁：驗證資料存取層能新增/讀取一筆 food。
// （Phase 3 之後會有正式的記錄頁，此頁可移除。）

async function addFood(formData: FormData) {
  "use server";
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const name = String(formData.get("name") ?? "").trim();
  const carbs = Number(formData.get("carbs"));
  if (!name || Number.isNaN(carbs)) return;

  await createFood(supabase, {
    name,
    carbs_per_serving: carbs,
    serving_desc: String(formData.get("serving_desc") ?? "").trim() || null,
  });
  revalidatePath("/test-food");
}

export default async function TestFoodPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const foods = await listFoods(supabase);

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-6 px-6 py-10">
      <h1 className="text-xl font-semibold">食物庫測試（Phase 2）</h1>

      <form action={addFood} className="flex flex-col gap-3">
        <input
          name="name"
          required
          placeholder="食物名稱（例：白飯）"
          className="h-11 rounded-lg border border-zinc-300 px-3"
        />
        <input
          name="carbs"
          type="number"
          inputMode="decimal"
          step="any"
          required
          placeholder="每份碳水克數"
          className="h-11 rounded-lg border border-zinc-300 px-3"
        />
        <input
          name="serving_desc"
          placeholder="份量描述（選填，例：半碗）"
          className="h-11 rounded-lg border border-zinc-300 px-3"
        />
        <button
          type="submit"
          className="h-11 rounded-lg bg-black text-sm font-medium text-white"
        >
          新增食物
        </button>
      </form>

      <section>
        <h2 className="mb-2 text-sm font-medium text-zinc-500">
          已記錄 {foods.length} 筆
        </h2>
        <ul className="flex flex-col gap-2">
          {foods.map((f) => (
            <li
              key={f.id}
              className="rounded-lg border border-zinc-200 px-3 py-2 text-sm"
            >
              <span className="font-medium">{f.name}</span> — 碳水{" "}
              {f.carbs_per_serving}g
              {f.serving_desc ? (
                <span className="text-zinc-500">（{f.serving_desc}）</span>
              ) : null}
            </li>
          ))}
          {foods.length === 0 && (
            <li className="text-sm text-zinc-400">尚無資料,新增一筆試試。</li>
          )}
        </ul>
      </section>
    </main>
  );
}
