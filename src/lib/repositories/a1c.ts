import type { SupabaseClient } from "@supabase/supabase-js";
import type { A1cRecord, A1cInput } from "@/lib/types";

// A1C（糖化血色素）紀錄 CRUD。RLS 已限定只能讀寫自己的資料；
// user_id 由 DB 預設 auth.uid() 填入。

export async function listA1c(supabase: SupabaseClient): Promise<A1cRecord[]> {
  const { data, error } = await supabase
    .from("a1c_records")
    .select("*")
    .order("measured_at", { ascending: false });
  if (error) throw error;
  return data as A1cRecord[];
}

export async function createA1c(
  supabase: SupabaseClient,
  input: A1cInput,
): Promise<A1cRecord> {
  const { data, error } = await supabase
    .from("a1c_records")
    .insert(input)
    .select()
    .single();
  if (error) throw error;
  return data as A1cRecord;
}

export async function deleteA1c(
  supabase: SupabaseClient,
  id: string,
): Promise<void> {
  const { error } = await supabase.from("a1c_records").delete().eq("id", id);
  if (error) throw error;
}
