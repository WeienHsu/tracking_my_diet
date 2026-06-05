"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createA1c, deleteA1c } from "@/lib/repositories/a1c";
import type { A1cInput } from "@/lib/types";

export async function createA1cAction(input: A1cInput) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  await createA1c(supabase, input);
  revalidatePath("/a1c");
}

export async function deleteA1cAction(id: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  await deleteA1c(supabase, id);
  revalidatePath("/a1c");
}
