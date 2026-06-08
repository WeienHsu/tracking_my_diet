import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// 在每個 request 早期呼叫，負責刷新並持久化 Supabase session。
// 不在此做任何 getUser() 與 redirect 之間的邏輯，避免 session 不同步。
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // 觸發 session 刷新（必要：會把更新後的 token 寫回 cookie）。
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // 安全防禦：Email 白名單。設定 ALLOWED_EMAILS（逗號分隔）後，
  // 非名單內的已登入帳號一律登出並導向 /unauthorized。
  // 未設定 ALLOWED_EMAILS 時視為不限制（本機/未設定環境不致全鎖）。
  const allowed = (process.env.ALLOWED_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  if (allowed.length > 0 && user?.email) {
    const path = request.nextUrl.pathname;
    // 豁免：未授權頁與 auth 路由（callback/signout）需可正常運作，避免無限轉址。
    const exempt = path === "/unauthorized" || path.startsWith("/auth/");
    if (!exempt && !allowed.includes(user.email.toLowerCase())) {
      await supabase.auth.signOut();
      const url = request.nextUrl.clone();
      url.pathname = "/unauthorized";
      url.search = "";
      const redirect = NextResponse.redirect(url);
      // 把 signOut 清除 session 的 cookie 帶到轉址回應上。
      supabaseResponse.cookies.getAll().forEach((c) => redirect.cookies.set(c));
      return redirect;
    }
  }

  return supabaseResponse;
}
