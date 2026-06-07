"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { foodLabel, type Food } from "@/lib/types";
import { updateFoodAction, deleteFoodAction } from "./actions";

const inputClass =
  "h-11 w-full rounded-lg border border-zinc-300 dark:border-zinc-700 px-3 text-sm outline-none focus:border-zinc-500";

export default function FoodsManager({ foods }: { foods: Food[] }) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return foods;
    return foods.filter(
      (f) =>
        f.name.toLowerCase().includes(q) ||
        (f.brand?.toLowerCase().includes(q) ?? false),
    );
  }, [query, foods]);

  return (
    <div className="flex flex-col gap-3">
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="搜尋品牌或食物名"
        className="h-12 w-full rounded-lg border border-zinc-300 dark:border-zinc-700 px-3 text-base outline-none focus:border-zinc-500"
      />
      <p className="text-xs text-zinc-400 dark:text-zinc-500">
        共 {filtered.length} / {foods.length} 項
      </p>
      {filtered.length === 0 ? (
        <p className="py-12 text-center text-sm text-zinc-400 dark:text-zinc-500">
          沒有符合的食物。
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {filtered.map((f) => (
            <FoodRow key={f.id} food={f} />
          ))}
        </ul>
      )}
    </div>
  );
}

function FoodRow({ food }: { food: Food }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [brand, setBrand] = useState(food.brand ?? "");
  const [name, setName] = useState(food.name);
  const [perServing, setPerServing] = useState(
    food.carbs_per_serving != null ? String(food.carbs_per_serving) : "",
  );
  const [per100g, setPer100g] = useState(
    food.carbs_per_100g != null ? String(food.carbs_per_100g) : "",
  );
  const [servingGrams, setServingGrams] = useState(
    food.serving_grams != null ? String(food.serving_grams) : "",
  );
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setBrand(food.brand ?? "");
    setName(food.name);
    setPerServing(food.carbs_per_serving != null ? String(food.carbs_per_serving) : "");
    setPer100g(food.carbs_per_100g != null ? String(food.carbs_per_100g) : "");
    setServingGrams(food.serving_grams != null ? String(food.serving_grams) : "");
    setError(null);
  }

  function save() {
    setError(null);
    const ps = perServing.trim() === "" ? null : Number(perServing);
    const pg = per100g.trim() === "" ? null : Number(per100g);
    const sg = servingGrams.trim() === "" ? null : Number(servingGrams);
    startTransition(async () => {
      const res = await updateFoodAction(food.id, {
        brand: brand.trim() || null,
        name: name.trim(),
        carbs_per_serving: ps,
        carbs_per_100g: pg,
        serving_grams: sg,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setEditing(false);
      router.refresh();
    });
  }

  function onDelete() {
    if (!confirm(`確定刪除「${foodLabel(food.brand, food.name)}」？歷史紀錄不受影響。`))
      return;
    startTransition(async () => {
      const res = await deleteFoodAction(food.id);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  }

  if (!editing) {
    return (
      <li className="flex items-center justify-between gap-2 rounded-xl border border-zinc-200 dark:border-zinc-700 p-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-zinc-800 dark:text-zinc-100">
            {foodLabel(food.brand, food.name)}
          </p>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            {carbsLabel(food)}
          </p>
          {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
        </div>
        <div className="flex shrink-0 gap-1.5">
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="rounded-lg border border-zinc-300 dark:border-zinc-600 px-3 py-1.5 text-sm text-zinc-700 dark:text-zinc-200"
          >
            編輯
          </button>
          <button
            type="button"
            onClick={onDelete}
            disabled={pending}
            className="rounded-lg border border-zinc-300 dark:border-zinc-600 px-3 py-1.5 text-sm text-zinc-500 dark:text-zinc-400 disabled:opacity-50"
          >
            刪除
          </button>
        </div>
      </li>
    );
  }

  return (
    <li className="flex flex-col gap-2 rounded-xl border border-zinc-300 dark:border-zinc-600 p-3">
      <input
        value={brand}
        onChange={(e) => setBrand(e.target.value)}
        placeholder="品牌／餐廳（選填）"
        className={inputClass}
      />
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="食物名稱"
        className={inputClass}
      />
      <div className="flex gap-2">
        <label className="flex flex-1 flex-col gap-1">
          <span className="text-xs text-zinc-500 dark:text-zinc-400">每份碳水</span>
          <input
            type="number"
            inputMode="decimal"
            step="any"
            value={perServing}
            onChange={(e) => setPerServing(e.target.value)}
            placeholder="可空"
            className={inputClass}
          />
        </label>
        <label className="flex flex-1 flex-col gap-1">
          <span className="text-xs text-zinc-500 dark:text-zinc-400">每100克碳水</span>
          <input
            type="number"
            inputMode="decimal"
            step="any"
            value={per100g}
            onChange={(e) => setPer100g(e.target.value)}
            placeholder="可空"
            className={inputClass}
          />
        </label>
      </div>
      <label className="flex flex-col gap-1">
        <span className="text-xs text-zinc-500 dark:text-zinc-400">
          每份克重（選填，填了可自動補另一種碳水）
        </span>
        <input
          type="number"
          inputMode="decimal"
          step="any"
          value={servingGrams}
          onChange={(e) => setServingGrams(e.target.value)}
          placeholder="例：一份 50 克"
          className={inputClass}
        />
      </label>
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className="h-11 flex-1 rounded-lg bg-black dark:bg-white text-sm font-medium text-white dark:text-black disabled:opacity-50"
        >
          {pending ? "儲存中…" : "儲存"}
        </button>
        <button
          type="button"
          onClick={() => {
            reset();
            setEditing(false);
          }}
          disabled={pending}
          className="h-11 flex-1 rounded-lg border border-zinc-300 dark:border-zinc-600 text-sm text-zinc-600 dark:text-zinc-300 disabled:opacity-50"
        >
          取消
        </button>
      </div>
    </li>
  );
}

function carbsLabel(food: Food): string {
  const parts: string[] = [];
  if (food.carbs_per_serving != null) parts.push(`每份 ${food.carbs_per_serving}g`);
  if (food.carbs_per_100g != null) parts.push(`每100克 ${food.carbs_per_100g}g`);
  if (food.serving_grams != null) parts.push(`一份 ${food.serving_grams}g`);
  return parts.length > 0 ? parts.join("・") : "未設定碳水";
}
