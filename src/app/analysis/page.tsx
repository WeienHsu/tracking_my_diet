import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { listMeals } from "@/lib/repositories/meals";
import { getSettings } from "@/lib/repositories/settings";
import {
  classifyLanding,
  estimateIcrIsf,
  mealTypeIcrHints,
  icrConfidenceTrend,
  rankFoodImpact,
  buildTrend,
  type IcrIsfEstimate,
} from "@/lib/analysis";
import {
  DEFAULT_MEAL_RANGE,
  MEAL_TYPE_LABELS,
  type Settings,
} from "@/lib/types";
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
  const icr = estimateIcrIsf(meals, settings);
  const hints = mealTypeIcrHints(meals, settings, icr.icr);
  const icrTrend = icrConfidenceTrend(meals, settings);
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

          {/* 2. 反推實際 ICR / ISF（自適應引擎）*/}
          <IcrIsfPanel est={icr} configuredIcr={settings.icr} />

          {/* 2b. 餐別時段提示（全域為主，某時段明顯偏離才提示）*/}
          {hints.length > 0 && (
            <section className="flex flex-col gap-2 rounded-xl border border-zinc-200 dark:border-zinc-700 p-4">
              <h2 className="text-sm font-medium text-zinc-700 dark:text-zinc-200">
                餐別時段提示
              </h2>
              <ul className="flex flex-col gap-1 text-sm text-zinc-600 dark:text-zinc-300">
                {hints.map((h) => (
                  <li key={h.mealType}>
                    <span className="font-medium text-zinc-800 dark:text-zinc-100">
                      {MEAL_TYPE_LABELS[h.mealType]}
                    </span>{" "}
                    時段（{h.n} 餐）反推 ICR 約{" "}
                    <span className="font-semibold">{round1(h.estimatedIcr)}</span>
                    ，與全域明顯不同。
                  </li>
                ))}
              </ul>
              <p className="text-xs leading-5 text-amber-700 dark:text-amber-400">
                ⚠️ 這只是觀察到的時段差異（例如黎明現象），<strong>不是建議數值</strong>，
                請與你的醫師／糖尿病衛教師確認。
              </p>
            </section>
          )}

          {/* 圖表（client / Recharts）*/}
          <Charts
            trend={trend}
            landing={{
              ideal: landing.idealCount,
              high: landing.highCount,
              low: landing.lowCount,
            }}
            impact={impactData}
            icrTrend={icrTrend}
          />

          {/* AI 月報（client → /api/report → Gemini）*/}
          <MonthlyReport />
        </>
      )}
    </main>
  );
}

const METHOD_LABEL: Record<IcrIsfEstimate["method"], string> = {
  regression: "迴歸模型（用上所有正常餐）",
  median: "偏差校正中位數",
  insufficient: "樣本不足",
};

const CONFIDENCE_LABEL: Record<IcrIsfEstimate["confidence"], string> = {
  low: "低",
  mid: "中",
  high: "高",
};

function IcrIsfPanel({
  est,
  configuredIcr,
}: {
  est: IcrIsfEstimate;
  configuredIcr: number;
}) {
  return (
    <section className="flex flex-col gap-2 rounded-xl border border-zinc-200 dark:border-zinc-700 p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-zinc-700 dark:text-zinc-200">
          反推實際 ICR / ISF
        </h2>
        <span className="rounded bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 text-xs text-zinc-500 dark:text-zinc-400">
          {METHOD_LABEL[est.method]}
        </span>
      </div>

      {est.icr == null ? (
        <p className="text-sm text-zinc-400 dark:text-zinc-500">
          {est.note}
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
            <div>
              <span className="text-xs text-zinc-500 dark:text-zinc-400">設定值 ICR</span>
              <p className="text-lg font-semibold">{configuredIcr}</p>
            </div>
            <div>
              <span className="text-xs text-zinc-500 dark:text-zinc-400">
                實際反推 ICR（{est.n} 餐）
              </span>
              <p className="text-lg font-semibold">
                {round1(est.icr)}
                {est.icrCi && (
                  <span className="ml-1 text-xs font-normal text-zinc-400 dark:text-zinc-500">
                    95% 區間 {round1(est.icrCi[0])}–{round1(est.icrCi[1])}
                  </span>
                )}
              </p>
            </div>
            {est.isf != null && (
              <div>
                <span className="text-xs text-zinc-500 dark:text-zinc-400">
                  ISF（每單位降血糖）
                </span>
                <p className="text-lg font-semibold">
                  {round1(est.isf)}
                  {est.isfCi && (
                    <span className="ml-1 text-xs font-normal text-zinc-400 dark:text-zinc-500">
                      區間 {round1(est.isfCi[0])}–{round1(est.isfCi[1])}
                    </span>
                  )}
                </p>
              </div>
            )}
          </div>

          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            估計信心：{CONFIDENCE_LABEL[est.confidence]}・{est.note}
          </p>

          {est.deviates && (
            <p className="text-xs leading-5 text-amber-700 dark:text-amber-400">
              ⚠️ 實際數據反推的 ICR 與設定值差距較大，可能偏離設定。建議與你的醫師／糖尿病衛教師確認，
              本系統不直接建議新數值。
            </p>
          )}
        </>
      )}
    </section>
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
