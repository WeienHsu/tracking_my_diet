import type { SupabaseClient } from "@supabase/supabase-js";
import type { Food, FoodInput } from "@/lib/types";

// 食物庫 CRUD。RLS 已限定只能讀寫自己的資料；user_id 由 DB 預設 auth.uid() 填入。

export async function listFoods(supabase: SupabaseClient): Promise<Food[]> {
  const { data, error } = await supabase
    .from("foods")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data as Food[];
}

// 依品牌或名稱模糊搜尋（食物查詢用，兩欄同時比對）。
export async function searchFoodsByName(
  supabase: SupabaseClient,
  query: string,
): Promise<Food[]> {
  const { data, error } = await supabase
    .from("foods")
    .select("*")
    .or(`name.ilike.%${query}%,brand.ilike.%${query}%`)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data as Food[];
}

export async function createFood(
  supabase: SupabaseClient,
  input: FoodInput,
): Promise<Food> {
  const { data, error } = await supabase
    .from("foods")
    .insert(input)
    .select()
    .single();
  if (error) throw error;
  return data as Food;
}

export async function updateFood(
  supabase: SupabaseClient,
  id: string,
  input: Partial<FoodInput>,
): Promise<Food> {
  const { data, error } = await supabase
    .from("foods")
    .update(input)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data as Food;
}

export async function deleteFood(
  supabase: SupabaseClient,
  id: string,
): Promise<void> {
  const { error } = await supabase.from("foods").delete().eq("id", id);
  if (error) throw error;
}
