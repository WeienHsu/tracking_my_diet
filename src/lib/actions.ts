// Server Actions 的標準化結果與錯誤處理（模組六 6.3）。
// 所有 action 統一回傳 ActionResult，呼叫端用 res.ok 判斷，避免直接拋 500。

import { z } from "zod";

export type ActionResult = { ok: true } | { ok: false; error: string };

// 把 zod 驗證失敗整理成一句白話錯誤。
export function zodError(error: z.ZodError): ActionResult {
  const first = error.issues[0];
  const path = first?.path.join(".");
  const msg = first?.message ?? "輸入資料有誤";
  return { ok: false, error: path ? `${path}：${msg}` : msg };
}

// 把例外整理成標準化錯誤結果。
export function caughtError(e: unknown): ActionResult {
  return {
    ok: false,
    error: e instanceof Error ? e.message : "操作失敗，請再試一次。",
  };
}
