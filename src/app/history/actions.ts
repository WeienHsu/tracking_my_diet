"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  updateGlucoseAfter,
  updateMeal,
  deleteMeal,
} from "@/lib/repositories/meals";
import { type ActionResult, zodError, caughtError } from "@/lib/actions";

const idSchema = z.string().uuid("紀錄 id 格式錯誤");
const glucoseSchema = z.number().positive("血糖值需大於 0");

// 餐後血糖常於兩小時後才補填。
export async function fillGlucoseAfterAction(
  mealId: string,
  value: number,
): Promise<ActionResult> {
  const id = idSchema.safeParse(mealId);
  if (!id.success) return zodError(id.error);
  const v = glucoseSchema.safeParse(value);
  if (!v.success) return zodError(v.error);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  try {
    await updateGlucoseAfter(supabase, id.data, v.data);
    revalidatePath("/history");
    return { ok: true };
  } catch (e) {
    return caughtError(e);
  }
}

// 編輯飯前血糖（記錄當下可能漏填或填錯）。
export async function updateGlucoseBeforeAction(
  mealId: string,
  value: number,
): Promise<ActionResult> {
  const id = idSchema.safeParse(mealId);
  if (!id.success) return zodError(id.error);
  const v = glucoseSchema.safeParse(value);
  if (!v.success) return zodError(v.error);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  try {
    await updateMeal(supabase, id.data, { glucose_before: v.data });
    revalidatePath("/history");
    return { ok: true };
  } catch (e) {
    return caughtError(e);
  }
}

export async function deleteMealAction(mealId: string): Promise<ActionResult> {
  const id = idSchema.safeParse(mealId);
  if (!id.success) return zodError(id.error);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  try {
    await deleteMeal(supabase, id.data);
    revalidatePath("/history");
    return { ok: true };
  } catch (e) {
    return caughtError(e);
  }
}
