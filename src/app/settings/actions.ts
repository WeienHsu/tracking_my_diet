"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { upsertSettings } from "@/lib/repositories/settings";
import { type ActionResult, zodError, caughtError } from "@/lib/actions";
import type { SettingsInput } from "@/lib/types";

const minOfDay = z.number().int().min(0).max(1439);

const SettingsSchema = z.object({
  icr: z.number().positive("ICR 必須大於 0"),
  target_glucose_low: z.number().positive(),
  target_glucose_high: z.number().positive(),
  breakfast_center_min: minOfDay,
  lunch_center_min: minOfDay,
  dinner_center_min: minOfDay,
  meal_window_min: z.number().int().min(15).max(240),
  isf: z.number().positive("ISF 必須大於 0").nullable(),
  correction_target: z.number().positive().nullable(),
  advanced_dose: z.boolean(),
  insulin_dia_min: z.number().int().positive(),
  insulin_peak_min: z.number().int().positive(),
  iob_auto_subtract: z.boolean(),
  postmeal_window_lo_min: z.number().int().min(0).max(600),
  postmeal_window_hi_min: z.number().int().min(0).max(600),
})
  .refine((v) => v.insulin_dia_min > v.insulin_peak_min, {
    message: "作用時間需大於高峰時間",
  })
  .refine((v) => v.postmeal_window_hi_min > v.postmeal_window_lo_min, {
    message: "量測窗的上限需大於下限",
  });

export async function saveSettingsAction(
  input: SettingsInput,
): Promise<ActionResult> {
  const parsed = SettingsSchema.safeParse(input);
  if (!parsed.success) return zodError(parsed.error);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  try {
    await upsertSettings(supabase, parsed.data);
    // 設定影響記錄頁的建議劑量與預設餐別。
    revalidatePath("/settings");
    revalidatePath("/log");
    return { ok: true };
  } catch (e) {
    return caughtError(e);
  }
}
