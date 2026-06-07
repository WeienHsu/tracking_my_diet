import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  Meal,
  MealFood,
  MealInput,
  MealFoodInput,
  MealType,
} from "@/lib/types";

// 餐食 CRUD。一餐可含多筆 meal_foods。

export type MealWithFoods = Meal & { meal_foods: MealFood[] };

export type ListMealsFilter = {
  from?: string; // ISO 起始時間
  to?: string; // ISO 結束時間
  mealType?: MealType;
};

export async function listMeals(
  supabase: SupabaseClient,
  filter: ListMealsFilter = {},
): Promise<MealWithFoods[]> {
  let q = supabase
    .from("meals")
    .select("*, meal_foods(*)")
    .order("eaten_at", { ascending: false });

  if (filter.from) q = q.gte("eaten_at", filter.from);
  if (filter.to) q = q.lte("eaten_at", filter.to);
  if (filter.mealType) q = q.eq("meal_type", filter.mealType);

  const { data, error } = await q;
  if (error) throw error;
  return data as MealWithFoods[];
}

export async function getMeal(
  supabase: SupabaseClient,
  id: string,
): Promise<MealWithFoods | null> {
  const { data, error } = await supabase
    .from("meals")
    .select("*, meal_foods(*)")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data as MealWithFoods | null;
}

// 建立一餐，並一併寫入其食物明細。
// 透過 create_meal_with_foods RPC（migration 0007）做原子寫入，避免第二段失敗留下孤兒 meal。
// 回傳新建 meal 的 id。
export async function createMeal(
  supabase: SupabaseClient,
  meal: MealInput,
  foods: MealFoodInput[] = [],
): Promise<string> {
  const { data, error } = await supabase.rpc("create_meal_with_foods", {
    p_meal: meal,
    p_foods: foods,
  });
  if (error) throw error;
  return data as string;
}

export async function updateMeal(
  supabase: SupabaseClient,
  id: string,
  input: Partial<MealInput>,
): Promise<Meal> {
  const { data, error } = await supabase
    .from("meals")
    .update(input)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data as Meal;
}

// 餐後血糖常於兩小時後才補填。
export async function updateGlucoseAfter(
  supabase: SupabaseClient,
  id: string,
  glucoseAfter: number,
): Promise<Meal> {
  return updateMeal(supabase, id, { glucose_after: glucoseAfter });
}

export async function deleteMeal(
  supabase: SupabaseClient,
  id: string,
): Promise<void> {
  // meal_foods 透過 on delete cascade 自動清除。
  const { error } = await supabase.from("meals").delete().eq("id", id);
  if (error) throw error;
}
