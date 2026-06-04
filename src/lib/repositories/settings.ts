import type { SupabaseClient } from "@supabase/supabase-js";
import type { Settings, SettingsInput } from "@/lib/types";

// 使用者設定（ICR、目標血糖範圍）。每位使用者一列（user_id 為主鍵）。

// 取得設定；若尚未建立則回傳 null（呼叫端可套用預設值）。
export async function getSettings(
  supabase: SupabaseClient,
): Promise<Settings | null> {
  const { data, error } = await supabase
    .from("settings")
    .select("*")
    .maybeSingle();
  if (error) throw error;
  return data as Settings | null;
}

// 新增或更新設定。user_id 由 DB 預設 auth.uid() 填入。
export async function upsertSettings(
  supabase: SupabaseClient,
  input: SettingsInput,
): Promise<Settings> {
  const { data, error } = await supabase
    .from("settings")
    .upsert({ ...input, updated_at: new Date().toISOString() })
    .select()
    .single();
  if (error) throw error;
  return data as Settings;
}
