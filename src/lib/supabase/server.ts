import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// 伺服器端（Server Component / Route Handler / Server Action）使用的 Supabase client。
// Next 16 的 cookies() 為 async，需 await。
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          // 在 Server Component 內呼叫 set 會丟錯（無法寫 response），
          // 但 middleware 已負責持久化 session，這裡安全忽略即可。
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // 由 middleware 處理 cookie 寫入
          }
        },
      },
    },
  );
}
