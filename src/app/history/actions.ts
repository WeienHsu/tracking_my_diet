"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  updateGlucoseAfter,
  updateMeal,
  deleteMeal,
  searchMealFoodHistory,
} from "@/lib/repositories/meals";
import type { FoodHistoryEntry } from "@/lib/analysis";
import type { MealType } from "@/lib/types";

// 餐後血糖常於兩小時後才補填。
export async function fillGlucoseAfterAction(mealId: string, value: number) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  await updateGlucoseAfter(supabase, mealId, value);
  revalidatePath("/history");
}

// 編輯飯前血糖（記錄當下可能漏填或填錯）。
export async function updateGlucoseBeforeAction(mealId: string, value: number) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  await updateMeal(supabase, mealId, { glucose_before: value });
  revalidatePath("/history");
}

export async function deleteMealAction(mealId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  await deleteMeal(supabase, mealId);
  revalidatePath("/history");
}

export type FoodHistoryResult = FoodHistoryEntry & {
  brand: string | null;
  foodName: string;
  mealType: MealType;
};

// 食物查詢：輸入食物名，回傳歷史紀錄作為這次的參考。
export async function searchFoodHistoryAction(
  query: string,
): Promise<FoodHistoryResult[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const q = query.trim();
  if (!q) return [];

  const rows = await searchMealFoodHistory(supabase, q);
  return rows
    .filter((r) => r.meals)
    .map((r) => ({
      brand: r.food_brand,
      foodName: r.food_name,
      mealType: r.meals!.meal_type,
      eatenAt: r.meals!.eaten_at,
      carbs: r.carbs * (r.quantity ?? 1), // 此餐此食物的碳水量
      insulinUnits: r.meals!.insulin_units,
      glucoseBefore: r.meals!.glucose_before,
      glucoseAfter: r.meals!.glucose_after,
    }));
}
