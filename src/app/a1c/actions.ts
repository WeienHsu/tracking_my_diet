"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createA1c, deleteA1c } from "@/lib/repositories/a1c";
import { type ActionResult, zodError, caughtError } from "@/lib/actions";
import type { A1cInput } from "@/lib/types";

const A1cSchema = z.object({
  measured_at: z.string().min(1, "請選擇量測日期"),
  value: z.number().positive("A1C 需大於 0"),
  note: z.string().nullable().optional(),
});

export async function createA1cAction(input: A1cInput): Promise<ActionResult> {
  const parsed = A1cSchema.safeParse(input);
  if (!parsed.success) return zodError(parsed.error);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  try {
    await createA1c(supabase, parsed.data);
    revalidatePath("/a1c");
    return { ok: true };
  } catch (e) {
    return caughtError(e);
  }
}

export async function deleteA1cAction(id: string): Promise<ActionResult> {
  const parsed = z.string().uuid("紀錄 id 格式錯誤").safeParse(id);
  if (!parsed.success) return zodError(parsed.error);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  try {
    await deleteA1c(supabase, parsed.data);
    revalidatePath("/a1c");
    return { ok: true };
  } catch (e) {
    return caughtError(e);
  }
}
