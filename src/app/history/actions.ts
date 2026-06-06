"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  updateGlucoseAfter,
  updateMeal,
  deleteMeal,
} from "@/lib/repositories/meals";

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
