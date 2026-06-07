"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { updateFood, deleteFood } from "@/lib/repositories/foods";
import { type ActionResult, zodError, caughtError } from "@/lib/actions";
import { deriveCarbs } from "@/lib/types";

const idSchema = z.string().uuid("食物 id 格式錯誤");

const FoodEditSchema = z
  .object({
    brand: z.string().trim().nullable(),
    name: z.string().trim().min(1, "食物名稱不可空白"),
    carbs_per_serving: z.number().nonnegative().nullable(),
    carbs_per_100g: z.number().nonnegative().nullable(),
    serving_grams: z.number().positive().nullable(),
  })
  .refine(
    (v) => v.carbs_per_serving != null || v.carbs_per_100g != null,
    { message: "每份或每100克碳水至少填一個" },
  );

export async function updateFoodAction(
  id: string,
  input: z.infer<typeof FoodEditSchema>,
): Promise<ActionResult> {
  const pid = idSchema.safeParse(id);
  if (!pid.success) return zodError(pid.error);
  const parsed = FoodEditSchema.safeParse(input);
  if (!parsed.success) return zodError(parsed.error);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // 3.2：有每份克重時，自動補齊缺的那個碳水欄位。
  const carbs = deriveCarbs(
    parsed.data.serving_grams,
    parsed.data.carbs_per_serving,
    parsed.data.carbs_per_100g,
  );

  try {
    await updateFood(supabase, pid.data, {
      brand: parsed.data.brand?.trim() || null,
      name: parsed.data.name,
      carbs_per_serving: carbs.carbs_per_serving,
      carbs_per_100g: carbs.carbs_per_100g,
      serving_grams: parsed.data.serving_grams,
    });
    revalidatePath("/foods");
    revalidatePath("/log");
    return { ok: true };
  } catch (e) {
    return caughtError(e);
  }
}

export async function deleteFoodAction(id: string): Promise<ActionResult> {
  const pid = idSchema.safeParse(id);
  if (!pid.success) return zodError(pid.error);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  try {
    // 歷史明細靠 meal_foods 的冗餘 food_brand/food_name 保留；food_id 由 FK on delete set null。
    await deleteFood(supabase, pid.data);
    revalidatePath("/foods");
    return { ok: true };
  } catch (e) {
    return caughtError(e);
  }
}
