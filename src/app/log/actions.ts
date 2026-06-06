"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { listFoods, createFood } from "@/lib/repositories/foods";
import { createMeal } from "@/lib/repositories/meals";
import type {
  MealType,
  MealFoodInput,
  Exercise,
  MealContext,
} from "@/lib/types";

export type LogFoodLine = {
  brand: string | null;
  name: string;
  carbs: number; // 單份碳水克數
  quantity: number;
};

export type LogMealData = {
  eatenAt: string; // ISO 時間
  mealType: MealType;
  glucoseBefore: number | null;
  insulinUnits: number;
  glucoseAfter: number | null;
  exercise: Exercise;
  context: MealContext[];
  note: string | null;
  foods: LogFoodLine[];
};

export async function createMealAction(data: LogMealData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // 解析食物：庫裡已有的沿用其 id；沒有的新增進食物庫，下次可直接查。
  // 以「品牌+食物名」當鍵，讓同名不同品牌視為不同食物。
  const existing = await listFoods(supabase);
  const byKey = new Map(existing.map((f) => [foodKey(f.brand, f.name), f]));

  const mealFoods: MealFoodInput[] = [];
  for (const line of data.foods) {
    const name = line.name.trim();
    if (!name) continue;
    const brand = line.brand?.trim() || null;
    const key = foodKey(brand, name);
    let food = byKey.get(key);
    if (!food) {
      food = await createFood(supabase, {
        brand,
        name,
        carbs_per_serving: line.carbs,
      });
      byKey.set(key, food);
    }
    mealFoods.push({
      food_id: food.id,
      food_brand: food.brand,
      food_name: food.name,
      carbs: line.carbs,
      quantity: line.quantity,
    });
  }

  const totalCarbs = mealFoods.reduce(
    (sum, f) => sum + f.carbs * (f.quantity ?? 1),
    0,
  );

  await createMeal(
    supabase,
    {
      eaten_at: data.eatenAt,
      meal_type: data.mealType,
      glucose_before: data.glucoseBefore,
      total_carbs: totalCarbs,
      insulin_units: data.insulinUnits,
      glucose_after: data.glucoseAfter,
      exercise: data.exercise,
      context: data.context,
      note: data.note,
    },
    mealFoods,
  );

  revalidatePath("/log");
}

// 食物去重鍵：品牌（可空）+ 食物名，皆 trim/lower。
function foodKey(brand: string | null, name: string): string {
  return `${(brand ?? "").trim().toLowerCase()}|${name.trim().toLowerCase()}`;
}
