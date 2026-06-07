"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { listFoods, createFood, updateFood } from "@/lib/repositories/foods";
import { createMeal } from "@/lib/repositories/meals";
import { foodCarbs, deriveCarbs } from "@/lib/types";
import {
  type ActionResult,
  zodError,
  caughtError,
} from "@/lib/actions";
import type { MealFoodInput, FoodUnit } from "@/lib/types";

const FoodLineSchema = z.object({
  brand: z.string().nullable(),
  name: z.string().trim().min(1, "食物名稱不可空白"),
  unit: z.enum(["serving", "gram"]),
  amount: z.number().positive("份量／克數需大於 0"),
  carbsPerUnit: z.number().nonnegative(),
  servingGrams: z.number().positive().nullable(),
});

const LogMealSchema = z.object({
  eatenAt: z.string().min(1),
  mealType: z.enum(["breakfast", "lunch", "dinner", "snack"]),
  glucoseBefore: z.number().positive().nullable(),
  insulinUnits: z.number().nonnegative(),
  glucoseAfter: z.number().positive().nullable(),
  exercise: z.enum(["none", "light", "intense"]),
  context: z.array(z.enum(["illness", "stress", "alcohol"])),
  note: z.string().nullable(),
  foods: z.array(FoodLineSchema).min(1, "請至少加入一項食物"),
});

export type LogFoodLine = {
  brand: string | null;
  name: string;
  unit: FoodUnit; // 份 / 克
  amount: number; // 份數（serving）或克數（gram）
  carbsPerUnit: number; // serving: 每份碳水；gram: 每100克碳水
  servingGrams: number | null; // 每份克重（選填）
};

export type LogMealData = z.infer<typeof LogMealSchema>;

export async function createMealAction(data: LogMealData): Promise<ActionResult> {
  const parsed = LogMealSchema.safeParse(data);
  if (!parsed.success) return zodError(parsed.error);
  const input = parsed.data;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  try {
    // 解析食物：庫裡已有的沿用其 id；沒有的新增進食物庫，下次可直接查。
    // 以「品牌+食物名」當鍵，讓同名不同品牌視為不同食物。
    const existing = await listFoods(supabase);
    const byKey = new Map(existing.map((f) => [foodKey(f.brand, f.name), f]));

    const mealFoods: MealFoodInput[] = [];
    for (const line of input.foods) {
      const name = line.name.trim();
      if (!name) continue;
      const brand = line.brand?.trim() || null;
      const key = foodKey(brand, name);
      let food = byKey.get(key);
      if (!food) {
        // 3.2：按份且有填每份克重時，順便補出每100克碳水。
        const servingGrams = line.unit === "serving" ? line.servingGrams : null;
        const derived = deriveCarbs(
          servingGrams,
          line.unit === "serving" ? line.carbsPerUnit : null,
          line.unit === "gram" ? line.carbsPerUnit : null,
        );
        food = await createFood(supabase, {
          brand,
          name,
          carbs_per_serving: derived.carbs_per_serving,
          carbs_per_100g: derived.carbs_per_100g,
          serving_grams: servingGrams,
        });
        byKey.set(key, food);
      }
      const carbs = foodCarbs(line.unit, line.carbsPerUnit, line.amount);
      mealFoods.push({
        food_id: food.id,
        food_brand: food.brand,
        food_name: food.name,
        carbs,
        unit: line.unit,
        amount: line.amount,
      });
    }

    const totalCarbs = mealFoods.reduce((sum, f) => sum + f.carbs, 0);

    await createMeal(
      supabase,
      {
        eaten_at: input.eatenAt,
        meal_type: input.mealType,
        glucose_before: input.glucoseBefore,
        total_carbs: totalCarbs,
        insulin_units: input.insulinUnits,
        glucose_after: input.glucoseAfter,
        exercise: input.exercise,
        context: input.context,
        note: input.note,
      },
      mealFoods,
    );

    revalidatePath("/log");
    return { ok: true };
  } catch (e) {
    return caughtError(e);
  }
}

// 食物去重鍵：品牌（可空）+ 食物名，皆 trim/lower。
function foodKey(brand: string | null, name: string): string {
  return `${(brand ?? "").trim().toLowerCase()}|${name.trim().toLowerCase()}`;
}

// 3.1：把這次記錄微調過的碳水，同步成食物庫的預設值（使用者按下確認才呼叫）。
const SyncFoodSchema = z.object({
  brand: z.string().nullable(),
  name: z.string().trim().min(1),
  unit: z.enum(["serving", "gram"]),
  carbsPerUnit: z.number().positive(),
});

export async function syncFoodDefaultAction(
  input: z.infer<typeof SyncFoodSchema>,
): Promise<ActionResult> {
  const parsed = SyncFoodSchema.safeParse(input);
  if (!parsed.success) return zodError(parsed.error);
  const { brand, name, unit, carbsPerUnit } = parsed.data;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  try {
    const foods = await listFoods(supabase);
    const key = foodKey(brand?.trim() || null, name);
    const food = foods.find((f) => foodKey(f.brand, f.name) === key);
    if (!food) return { ok: false, error: "找不到對應的食物。" };
    await updateFood(
      supabase,
      food.id,
      unit === "serving"
        ? { carbs_per_serving: carbsPerUnit }
        : { carbs_per_100g: carbsPerUnit },
    );
    revalidatePath("/log");
    return { ok: true };
  } catch (e) {
    return caughtError(e);
  }
}
