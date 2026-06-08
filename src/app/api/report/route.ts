import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { listMeals } from "@/lib/repositories/meals";
import { getSettings } from "@/lib/repositories/settings";
import {
  classifyLanding,
  estimateActualIcr,
  rankFoodImpact,
} from "@/lib/analysis";
import type { Settings } from "@/lib/types";

const DEFAULT_SETTINGS: Settings = {
  user_id: "",
  icr: 5,
  target_glucose_low: 80,
  target_glucose_high: 180,
  breakfast_center_min: 480,
  lunch_center_min: 750,
  dinner_center_min: 1110,
  meal_window_min: 90,
  isf: null,
  correction_target: null,
  advanced_dose: false,
  insulin_dia_min: 300,
  insulin_peak_min: 75,
  iob_auto_subtract: false,
  postmeal_window_lo_min: 90,
  postmeal_window_hi_min: 180,
  updated_at: "",
};

// 可用 GEMINI_MODEL 覆寫（模型名稱會隨時間更新）；預設用免費額度的 flash。
const MODEL = process.env.GEMINI_MODEL ?? "gemini-2.5-flash";

type GeminiResponse = {
  candidates?: { content?: { parts?: { text?: string }[] } }[];
};

function buildPrompt(stats: unknown): string {
  return `你是一位協助糖尿病患者「回顧」血糖與胰島素記錄的助手。以下是某使用者一段期間的去識別化統計資料（JSON）。

請用繁體中文、白話、以短段落加條列，寫一段月報，內容只做以下事：
1. 描述你「觀察到的規律」（例如理想佔比、哪些餐別或食物常讓血糖偏高、反推 ICR 與設定值的關係）。
2. 以中性、鼓勵的語氣指出可以留意的地方。

嚴格禁止：
- 不要下任何醫療指令，不要叫使用者調整胰島素劑量、ICR 或飲食。
- 不要提供任何具體的新劑量或新 ICR 數值。
- 若反推 ICR 與設定值差距大，只說「數據顯示兩者有差距，建議與醫師或衛教師討論」。

結尾務必原文附上這段免責：
「本月報僅為數據觀察，不構成醫療建議。任何劑量或治療調整請與你的醫師／糖尿病衛教師確認。」

統計資料：
${JSON.stringify(stats, null, 2)}`;
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "未登入" }, { status: 401 });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "伺服器未設定 GEMINI_API_KEY" },
      { status: 500 },
    );
  }

  const body = (await req
    .json()
    .catch(() => ({}))) as { from?: string; to?: string };

  const [meals, settingsRow] = await Promise.all([
    listMeals(supabase, { from: body.from, to: body.to }),
    getSettings(supabase),
  ]);
  const settings = settingsRow ?? DEFAULT_SETTINGS;

  if (meals.length === 0) {
    return NextResponse.json({ error: "此區間沒有紀錄。" }, { status: 400 });
  }

  const landing = classifyLanding(meals, settings);
  const icr = estimateActualIcr(meals, settings);
  const mealFoods = meals.flatMap((m) => m.meal_foods);
  const impact = rankFoodImpact(meals, mealFoods)
    .filter((f) => f.avgGlucoseRise != null)
    .slice(0, 5);

  // 去識別化：只送統計值，不送 user_id、原始用餐時間、備註。
  const stats = {
    期間: { 起: body.from ?? "全部", 迄: body.to ?? "全部" },
    餐次數: meals.length,
    有餐後血糖的餐次: landing.total,
    餐後落點: {
      理想: landing.idealCount,
      偏高: landing.highCount,
      偏低: landing.lowCount,
      理想佔比: `${Math.round(landing.idealRatio * 100)}%`,
    },
    目標血糖範圍: `${settings.target_glucose_low}-${settings.target_glucose_high} mg/dL`,
    設定ICR: settings.icr,
    反推ICR:
      icr.estimatedIcr != null ? Number(icr.estimatedIcr.toFixed(1)) : null,
    反推所用餐次: icr.basedOnMeals,
    反推與設定差距過大: icr.deviates,
    最易升糖食物: impact.map((f) => ({
      食物: f.foodName,
      平均餐後上升: Math.round(f.avgGlucoseRise as number),
      餐次: f.mealCount,
    })),
  };

  // 快取＋資料變動偵測：以送進 Gemini 的 stats 內容算雜湊（meals 無 updated_at，故用內容比對）。
  // 同期間若 hash 未變 → 直接回快取，不打 Gemini，避免重複點擊刷爆額度。
  const periodFrom = body.from ?? "";
  const periodTo = body.to ?? "";
  const contentHash = createHash("sha256")
    .update(JSON.stringify(stats))
    .digest("hex");

  const { data: cached } = await supabase
    .from("ai_reports")
    .select("report, stats, content_hash")
    .eq("period_from", periodFrom)
    .eq("period_to", periodTo)
    .maybeSingle();

  if (cached && cached.content_hash === contentHash) {
    return NextResponse.json({
      report: cached.report,
      stats: cached.stats ?? stats,
      cached: true,
    });
  }

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: buildPrompt(stats) }] }],
      }),
    },
  );

  if (!res.ok) {
    const detail = await res.text();
    return NextResponse.json(
      { error: "Gemini 呼叫失敗", detail },
      { status: 502 },
    );
  }

  const data = (await res.json()) as GeminiResponse;
  const report =
    data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ??
    "";

  if (!report.trim()) {
    return NextResponse.json(
      { error: "Gemini 未回傳內容，請稍後再試。" },
      { status: 502 },
    );
  }

  // 寫入/覆寫該期間快取，供下次相同資料直接回傳。
  await supabase.from("ai_reports").upsert(
    {
      user_id: user.id,
      period_from: periodFrom,
      period_to: periodTo,
      content_hash: contentHash,
      report,
      stats,
    },
    { onConflict: "user_id,period_from,period_to" },
  );

  return NextResponse.json({ report, stats });
}
