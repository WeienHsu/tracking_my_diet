"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { upsertSettings } from "@/lib/repositories/settings";
import { type ActionResult, zodError, caughtError } from "@/lib/actions";
import type { SettingsInput } from "@/lib/types";

const hour = z.number().int().min(0).max(23);

const SettingsSchema = z.object({
  icr: z.number().positive("ICR 必須大於 0"),
  target_glucose_low: z.number().positive(),
  target_glucose_high: z.number().positive(),
  breakfast_end_hour: hour,
  lunch_end_hour: hour,
  dinner_end_hour: hour,
  isf: z.number().positive("ISF 必須大於 0").nullable(),
  correction_target: z.number().positive().nullable(),
  advanced_dose: z.boolean(),
  insulin_dia_min: z.number().int().positive(),
  insulin_peak_min: z.number().int().positive(),
  iob_auto_subtract: z.boolean(),
}).refine((v) => v.insulin_dia_min > v.insulin_peak_min, {
  message: "作用時間需大於高峰時間",
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
