"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { upsertSettings } from "@/lib/repositories/settings";
import type { SettingsInput } from "@/lib/types";

export async function saveSettingsAction(input: SettingsInput) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  await upsertSettings(supabase, input);
  // 設定影響記錄頁的建議劑量與預設餐別。
  revalidatePath("/settings");
  revalidatePath("/log");
}
