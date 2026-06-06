import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { listMeals } from "@/lib/repositories/meals";
import { getSettings } from "@/lib/repositories/settings";
import {
  classifyLanding,
  estimateActualIcr,
  rankFoodImpact,
  buildTrend,
} from "@/lib/analysis";
import { DEFAULT_MEAL_RANGE, type Settings } from "@/lib/types";
import Charts from "./Charts";
import MonthlyReport from "./MonthlyReport";

// 設定預設值（見 PROJECT_PLAN.md Section 4）。
const DEFAULT_SETTINGS: Settings = {
  user_id: "",
  icr: 5,
  target_glucose_low: 80,
  target_glucose_high: 180,
  ...DEFAULT_MEAL_RANGE,
  updated_at: "",
};

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export default async function AnalysisPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [meals, settingsRow] = await Promise.all([
    listMeals(supabase),
    getSettings(supabase),
  ]);
  const settings = settingsRow ?? DEFAULT_SETTINGS;

  const landing = classifyLanding(meals, settings);
  const icr = estimateActualIcr(meals, settings);
  const mealFoods = meals.flatMap((m) => m.meal_foods);
  const impact = rankFoodImpact(meals, mealFoods);

  // 趨勢圖資料（時間由舊到新）。
  const trend = buildTrend(meals);

  // 食物影響：只取有平均上升幅度的，取前 8 名。
  const impactData = impact
    .filter((f) => f.avgGlucoseRise != null)
    .slice(0, 8)
    .map((f) => ({
      foodName: f.foodName,
      rise: round1(f.avgGlucoseRise as number),
    }));

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-6 px-5 py-8">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">分析</h1>
        <nav className="flex gap-3 text-sm text-zinc-500 dark:text-zinc-400">
          <Link href="/log">記錄</Link>
          <Link href="/history">歷史</Link>
          <Link href="/settings">設定</Link>
          <Link href="/">首頁</Link>
        </nav>
      </div>

      {/* 醫療免責（置於頁首顯著位置）*/}
      <p className="rounded-lg bg-amber-50 dark:bg-amber-950/40 p-3 text-xs leading-5 text-amber-800 dark:text-amber-300">
        ⚠️ 本頁僅用於記錄與觀察規律，協助回顧歷史決策。任何胰島素劑量的調整，都必須由你與醫師／糖尿病衛教師確認。
        系統產生的數字與分析<strong>不得取代專業醫療判斷</strong>。
      </p>

      {meals.length === 0 ? (
        <p className="py-12 text-center text-sm text-zinc-400 dark:text-zinc-500">
          尚無紀錄，先去{" "}
          <Link href="/log" className="underline">
            記錄一餐
          </Link>{" "}
          吧。
        </p>
      ) : (
        <>
          {/* 1. 餐後落點 */}
          <section className="flex flex-col gap-3 rounded-xl border border-zinc-200 dark:border-zinc-700 p-4">
            <h2 className="text-sm font-medium text-zinc-700 dark:text-zinc-200">
              餐後落點（目標範圍 {settings.target_glucose_low}–
              {settings.target_glucose_high} mg/dL）
            </h2>
            {landing.total === 0 ? (
              <p className="text-sm text-zinc-400 dark:text-zinc-500">
                還沒有任何餐後血糖紀錄，去歷史頁補填後即可分析。
              </p>
            ) : (
              <>
                <p className="text-sm text-zinc-600 dark:text-zinc-300">
                  理想佔比{" "}
                  <span className="text-lg font-semibold text-green-700 dark:text-green-400">
                    {Math.round(landing.idealRatio * 100)}%
                  </span>{" "}
                  （{landing.idealCount}/{landing.total} 餐）
                </p>
                <div className="grid grid-cols-3 gap-2 text-center text-sm">
                  <Stat label="理想" value={landing.idealCount} color="text-green-700 dark:text-green-400" />
                  <Stat label="偏高" value={landing.highCount} color="text-amber-700 dark:text-amber-400" />
                  <Stat label="偏低" value={landing.lowCount} color="text-blue-700 dark:text-blue-400" />
                </div>
              </>
            )}
          </section>

          {/* 2. 反推實際 ICR */}
          <section className="flex flex-col gap-2 rounded-xl border border-zinc-200 dark:border-zinc-700 p-4">
            <h2 className="text-sm font-medium text-zinc-700 dark:text-zinc-200">
              反推實際 ICR（僅用餐後落在理想範圍的餐次）
            </h2>
            {icr.estimatedIcr == null ? (
              <p className="text-sm text-zinc-400 dark:text-zinc-500">
                目前還沒有「餐後落在理想範圍」的餐次，無法反推。
              </p>
            ) : (
              <>
                <div className="flex items-baseline gap-4">
                  <div>
                    <span className="text-xs text-zinc-500 dark:text-zinc-400">設定值</span>
                    <p className="text-lg font-semibold">{settings.icr}</p>
                  </div>
                  <div>
                    <span className="text-xs text-zinc-500 dark:text-zinc-400">
                      實際反推（{icr.basedOnMeals} 餐中位數）
                    </span>
                    <p className="text-lg font-semibold">
                      {round1(icr.estimatedIcr)}
                    </p>
                  </div>
                </div>
                {icr.deviates && (
                  <p className="text-xs leading-5 text-amber-700 dark:text-amber-400">
                    ⚠️ 實際數據顯示反推 ICR 與設定值差距較大，可能偏離設定。建議與你的醫師／糖尿病衛教師確認，
                    本系統不直接建議新數值。
                  </p>
                )}
              </>
            )}
          </section>

          {/* 圖表（client / Recharts）*/}
          <Charts
            trend={trend}
            landing={{
              ideal: landing.idealCount,
              high: landing.highCount,
              low: landing.lowCount,
            }}
            impact={impactData}
          />

          {/* AI 月報（client → /api/report → Gemini）*/}
          <MonthlyReport />
        </>
      )}
    </main>
  );
}

function Stat({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="rounded-lg bg-zinc-50 dark:bg-zinc-800 py-2">
      <p className={`text-lg font-semibold ${color}`}>{value}</p>
      <p className="text-xs text-zinc-500 dark:text-zinc-400">{label}</p>
    </div>
  );
}
