// 分析邏輯（純函式、可測試）。見 PROJECT_PLAN.md Section 5。

import {
  foodLabel,
  type Meal,
  type MealFood,
  type MealType,
  type FoodUnit,
  type Settings,
} from "@/lib/types";

// ---- 型別定義 ----

export type Landing = "low" | "ideal" | "high";

// 1. 餐後落點分類
export type LandingSummary = {
  total: number;
  idealCount: number;
  highCount: number;
  lowCount: number;
  idealRatio: number; // 0~1
};

// 2. 反推實際 ICR
export type IcrEstimate = {
  basedOnMeals: number; // 用於估算的成功餐次數
  estimatedIcr: number | null; // 反推中位數（成功餐次的 total_carbs / insulin_units）
  configuredIcr: number; // 設定值
  deviates: boolean; // 與設定差距是否過大（提示與醫師確認，不直接給新數字）
};

// 3. 食物影響排名
export type FoodImpact = {
  foodName: string;
  mealCount: number;
  avgGlucoseAfter: number | null;
  avgGlucoseRise: number | null; // 平均（餐後 − 餐前）
};

// 血糖趨勢圖的單點（餐前／餐後）。
export type TrendPoint = {
  t: string; // 日期標籤（M/D）
  before: number | null;
  after: number | null;
};

// 4. 食物查詢的歷史紀錄
export type FoodHistoryEntry = {
  eatenAt: string;
  carbs: number;
  insulinUnits: number;
  glucoseBefore: number | null;
  glucoseAfter: number | null;
};

// 反推 ICR 與設定值差距超過此比例（20%）時提示使用者與醫師確認。
const ICR_DEVIATION_THRESHOLD = 0.2;

// ---- 階段 1：自適應 ICR/ISF 引擎用的常數 ----

// 達此餐數（且迴歸可解）才切換到迴歸法；可日後改此常數微調（不做成設定頁旋鈕）。
export const MIN_MEALS_FOR_REGRESSION = 30;
// 低於此餐數連中位數法都不估，回報「樣本不足」。
export const MIN_MEALS_FOR_ESTIMATE = 3;
// 低資料中位數法的假設 ISF：依 500/1800 臨床通則，ISF/ICR ≈ 1800/500 = 3.6。
// 僅當作先驗，迴歸法可用後即由實際估計取代。
export const ASSUMED_ISF_PER_ICR = 3.6;

// 階段 5.3：餐次間隔須大於此小時數才算「獨立乾淨餐」，排除連續進食的雜訊。
export const MIN_MEAL_GAP_HOURS = 4;
// 階段 5.2：每多一個時段啞變數，迴歸門檻就多要求這麼多筆，避免參數過多過擬合。
export const DUMMY_MEALS_PER_PARAM = 5;
// 階段 5.1：嶺迴歸（L2）的正則化強度係數（相對於特徵尺度）。
// 只在 OLS 因共線性奇異「當機」時才啟用，故值小、不影響可正常識別的資料。
const RIDGE_ALPHA = 1e-3;
// 階段 D：滾動窗口的預設天數（呼叫端可覆寫；引擎本身預設 null＝用全歷史）。
export const DEFAULT_WINDOW_DAYS = 90;

// ---- 血糖趨勢（時間由舊到新）----

export function buildTrend(meals: Meal[]): TrendPoint[] {
  return [...meals].reverse().map((m) => ({
    t: new Date(m.eaten_at).toLocaleDateString("zh-TW", {
      month: "numeric",
      day: "numeric",
    }),
    before: m.glucose_before,
    after: m.glucose_after,
  }));
}

// ---- 1. 餐後落點分類 ----

export function landingOf(
  glucoseAfter: number,
  low: number,
  high: number,
): Landing {
  if (glucoseAfter < low) return "low";
  if (glucoseAfter > high) return "high";
  return "ideal";
}

export function classifyLanding(
  meals: Meal[],
  settings: Pick<Settings, "target_glucose_low" | "target_glucose_high">,
): LandingSummary {
  const { target_glucose_low: low, target_glucose_high: high } = settings;
  // 只計入有餐後血糖的餐次。
  const withAfter = meals.filter((m) => m.glucose_after != null);

  let idealCount = 0;
  let highCount = 0;
  let lowCount = 0;
  for (const m of withAfter) {
    const landing = landingOf(m.glucose_after as number, low, high);
    if (landing === "ideal") idealCount++;
    else if (landing === "high") highCount++;
    else lowCount++;
  }

  const total = withAfter.length;
  return {
    total,
    idealCount,
    highCount,
    lowCount,
    idealRatio: total === 0 ? 0 : idealCount / total,
  };
}

// ---- 2. 反推實際 ICR（僅用「成功」的餐次）----

export function estimateActualIcr(
  meals: Meal[],
  settings: Settings,
): IcrEstimate {
  const { target_glucose_low: low, target_glucose_high: high } = settings;

  // 成功餐次：餐後落在理想範圍，且碳水與施打量為正（可反推）。
  const ratios = meals
    .filter(
      (m) =>
        m.glucose_after != null &&
        landingOf(m.glucose_after, low, high) === "ideal" &&
        m.total_carbs > 0 &&
        m.insulin_units > 0,
    )
    .map((m) => m.total_carbs / m.insulin_units);

  const estimatedIcr = ratios.length > 0 ? median(ratios) : null;
  const configuredIcr = settings.icr;

  const deviates =
    estimatedIcr != null &&
    configuredIcr > 0 &&
    Math.abs(estimatedIcr - configuredIcr) / configuredIcr >
      ICR_DEVIATION_THRESHOLD;

  return {
    basedOnMeals: ratios.length,
    estimatedIcr,
    configuredIcr,
    deviates,
  };
}

// ---- 3. 食物影響排名 ----

export function rankFoodImpact(
  meals: Meal[],
  mealFoods: MealFood[],
): FoodImpact[] {
  const mealById = new Map(meals.map((m) => [m.id, m]));

  // 依「品牌 食物名」分組（冗餘存欄位為準，食物被刪也保留；同名不同品牌可區分）。
  const groups = new Map<string, MealFood[]>();
  for (const mf of mealFoods) {
    const key = foodLabel(mf.food_brand, mf.food_name);
    const arr = groups.get(key);
    if (arr) arr.push(mf);
    else groups.set(key, [mf]);
  }

  const impacts: FoodImpact[] = [];
  for (const [foodName, items] of groups) {
    // 同一餐可能重複列同一食物，以餐次去重計算平均。
    const mealsForFood = new Map<string, Meal>();
    for (const mf of items) {
      const meal = mealById.get(mf.meal_id);
      if (meal) mealsForFood.set(meal.id, meal);
    }
    const relatedMeals = [...mealsForFood.values()];

    const afters = relatedMeals
      .filter((m) => m.glucose_after != null)
      .map((m) => m.glucose_after as number);
    const rises = relatedMeals
      .filter((m) => m.glucose_after != null && m.glucose_before != null)
      .map((m) => (m.glucose_after as number) - (m.glucose_before as number));

    impacts.push({
      foodName,
      mealCount: relatedMeals.length,
      avgGlucoseAfter: afters.length > 0 ? mean(afters) : null,
      avgGlucoseRise: rises.length > 0 ? mean(rises) : null,
    });
  }

  // 依平均血糖上升幅度由高到低（最易讓血糖偏高的食物在前）；無資料者排最後。
  return impacts.sort((a, b) => {
    if (a.avgGlucoseRise == null) return 1;
    if (b.avgGlucoseRise == null) return -1;
    return b.avgGlucoseRise - a.avgGlucoseRise;
  });
}

// ---- 4. 食物查詢 ----

export function foodHistory(
  foodName: string,
  meals: Meal[],
  mealFoods: MealFood[],
): FoodHistoryEntry[] {
  const mealById = new Map(meals.map((m) => [m.id, m]));
  const target = foodName.trim().toLowerCase();

  return mealFoods
    .filter((mf) => mf.food_name.toLowerCase().includes(target))
    .map((mf) => ({ mf, meal: mealById.get(mf.meal_id) }))
    .filter((x): x is { mf: MealFood; meal: Meal } => x.meal != null)
    .map(({ mf, meal }) => ({
      eatenAt: meal.eaten_at,
      carbs: mf.carbs,
      insulinUnits: meal.insulin_units,
      glucoseBefore: meal.glucose_before,
      glucoseAfter: meal.glucose_after,
    }))
    .sort(
      (a, b) => new Date(b.eatenAt).getTime() - new Date(a.eatenAt).getTime(),
    );
}

// ---- 階段 2.1：某食物最近 N 次的吃法與結果（記錄頁即時顯示）----

export type FoodRecentEntry = {
  eatenAt: string;
  unit: FoodUnit;
  amount: number; // 份數或克數
  carbs: number; // 此食物總碳水
  insulinUnits: number; // 整餐施打（混合餐含其他食物）
  glucoseBefore: number | null;
  glucoseAfter: number | null;
};

// 用嚴格比對（名稱完全相同、有品牌再縮品牌，同 foodMatches）取最近 limit 次。
export function recentFoodEntries(
  food: { brand?: string | null; name: string },
  meals: Meal[],
  mealFoods: MealFood[],
  limit = 3,
): FoodRecentEntry[] {
  const mealById = new Map(meals.map((m) => [m.id, m]));
  return mealFoods
    .filter((mf) => foodMatches(mf, food))
    .map((mf) => ({ mf, meal: mealById.get(mf.meal_id) }))
    .filter((x): x is { mf: MealFood; meal: Meal } => x.meal != null)
    .map(({ mf, meal }) => ({
      eatenAt: meal.eaten_at,
      unit: mf.unit ?? "serving",
      amount: mf.amount ?? mf.quantity ?? 1,
      carbs: mf.carbs,
      insulinUnits: meal.insulin_units,
      glucoseBefore: meal.glucose_before,
      glucoseAfter: meal.glucose_after,
    }))
    .sort(
      (a, b) => new Date(b.eatenAt).getTime() - new Date(a.eatenAt).getTime(),
    )
    .slice(0, limit);
}

// ---- 階段 1-A：clean-meal 過濾（排除「不正常的餐」）----

// 有運動或任何狀態標籤（生病/壓力/喝酒）的餐視為「不正常」，不納入 ICR/ISF 估算。
export function isCleanMeal(m: Meal): boolean {
  return m.exercise === "none" && (m.context?.length ?? 0) === 0;
}

export function cleanMeals(meals: Meal[]): Meal[] {
  return meals.filter(isCleanMeal);
}

// 迴歸法可用的餐：餐前、餐後、碳水有效即可，胰島素可為 0。
// 沒打針的純碳水餐是有效觀測，正好幫迴歸釘住「碳水本身升多少」與基線。
// （中位數法要算「碳水 ÷ 劑量」會除以零，故另在呼叫端再濾掉劑量為 0 的餐。）
function usableForRegression(m: Meal): boolean {
  return (
    m.glucose_before != null &&
    m.glucose_after != null &&
    m.total_carbs > 0 &&
    m.insulin_units >= 0
  );
}

// ---- 階段 5.3：獨立乾淨餐（與「前一次任何進食」間隔 > minGapHours）----
// 以全部餐次（含不正常餐）為進食事件來判定間隔；連續進食的後一餐視為受干擾，排除。
export function wellSpacedMeals(
  meals: Meal[],
  minGapHours: number = MIN_MEAL_GAP_HOURS,
): Meal[] {
  const sorted = [...meals].sort(
    (a, b) => new Date(a.eaten_at).getTime() - new Date(b.eaten_at).getTime(),
  );
  const out: Meal[] = [];
  let prev: number | null = null;
  for (const m of sorted) {
    const t = new Date(m.eaten_at).getTime();
    if (prev == null || (t - prev) / 3_600_000 > minGapHours) out.push(m);
    prev = t; // 每一餐都是進食事件，無論是否納入。
  }
  return out;
}

// ---- 餐後讀數「有效量測窗」（方案 B′）----
// 餐後血糖意圖為「餐後約 2 小時」（ADA：用餐開始後 1–2h）。量太晚/太早的讀數時點不一致，
// 會汙染迴歸；故迴歸只採用落在窗內的讀數。未記量測時間的舊資料視為照舊納入（不破壞既有統計）。
export const DEFAULT_POSTMEAL_LO_MIN = 90;
export const DEFAULT_POSTMEAL_HI_MIN = 180;

// 餐後讀數距用餐的分鐘數；未記量測時間回 null。
export function postMealElapsedMin(m: Meal): number | null {
  if (m.glucose_after_at == null) return null;
  return (
    (new Date(m.glucose_after_at).getTime() - new Date(m.eaten_at).getTime()) /
    60_000
  );
}

// 是否落在有效量測窗（未記時間 → 視為納入）。
export function withinPostMealWindow(
  m: Meal,
  loMin: number = DEFAULT_POSTMEAL_LO_MIN,
  hiMin: number = DEFAULT_POSTMEAL_HI_MIN,
): boolean {
  const elapsed = postMealElapsedMin(m);
  if (elapsed == null) return true;
  return elapsed >= loMin && elapsed <= hiMin;
}

// ---- 階段 D：滾動窗口（只取最近 windowDays 天的餐，貼合當下體質）----
// 泛型保留輸入型別（如 MealWithFoods 仍帶 meal_foods）。
export function recentMeals<T extends Meal>(
  meals: T[],
  windowDays: number,
  now: Date = new Date(),
): T[] {
  const cutoff = now.getTime() - windowDays * 86_400_000;
  return meals.filter((m) => new Date(m.eaten_at).getTime() >= cutoff);
}

// ---- 階段 1-B：自適應 ICR/ISF 估算 ----

// 餐的物理模型：Δ血糖 ≈ a·碳水 − b·胰島素 + c，其中 a=ISF/ICR、b=ISF。
export type IcrModel = { a: number; b: number; c: number };

export type IcrIsfEstimate = {
  method: "regression" | "median" | "insufficient";
  icr: number | null;
  isf: number | null; // 僅迴歸法有
  icrCi: [number, number] | null; // 95% 信心區間
  isfCi: [number, number] | null;
  n: number; // 實際用於估算的餐數
  confidence: "low" | "mid" | "high";
  configuredIcr: number;
  deviates: boolean; // 與設定差距是否過大（提示與醫師確認）
  model: IcrModel | null; // 迴歸係數，供殘差分析；非迴歸時為 null
  note: string; // 白話說明（含假設與樣本狀況）
};

export function estimateIcrIsf(
  meals: Meal[],
  settings: Settings,
  opts: {
    minMealsForRegression?: number;
    minGapHours?: number; // 階段 5.3：獨立乾淨餐的最小間隔（小時）
    windowDays?: number | null; // 階段 D：只取最近 N 天；null＝全歷史
    now?: Date;
  } = {},
): IcrIsfEstimate {
  const minForReg = opts.minMealsForRegression ?? MIN_MEALS_FOR_REGRESSION;
  const minGapHours = opts.minGapHours ?? MIN_MEAL_GAP_HOURS;
  const windowDays = opts.windowDays ?? null;
  const configuredIcr = settings.icr;

  // 階段 D：先套滾動窗口（若有指定）。
  const pool = windowDays != null ? recentMeals(meals, windowDays, opts.now) : meals;
  // 階段 5.3：以全部進食事件判定「獨立乾淨餐」，再與正常餐取交集。
  const spacedIds = new Set(wellSpacedMeals(pool, minGapHours).map((m) => m.id));
  const clean = cleanMeals(pool).filter((m) => spacedIds.has(m.id));
  // B′：只採用餐後讀數落在「有效量測窗」內的餐（未記量測時間的舊資料照舊納入）。
  const loMin = settings.postmeal_window_lo_min ?? DEFAULT_POSTMEAL_LO_MIN;
  const hiMin = settings.postmeal_window_hi_min ?? DEFAULT_POSTMEAL_HI_MIN;
  const windowed = clean.filter((m) => withinPostMealWindow(m, loMin, hiMin));
  // 迴歸法用：含沒打針（胰島素=0）的純碳水餐。
  const regUsable = windowed.filter(usableForRegression);
  // 中位數法用：須劑量>0（要算 碳水/劑量）。
  const medianUsable = regUsable.filter((m) => m.insulin_units > 0);

  const base = {
    isf: null,
    isfCi: null,
    icrCi: null,
    n: regUsable.length,
    configuredIcr,
    model: null,
  } as const;

  if (regUsable.length < MIN_MEALS_FOR_ESTIMATE) {
    return {
      ...base,
      method: "insufficient",
      icr: null,
      confidence: "low",
      deviates: false,
      note: `可用餐次僅 ${regUsable.length} 筆（已排除運動/狀態標記與間隔過近的餐），樣本不足，暫不估算。`,
    };
  }

  // 階段 5.2：迴歸門檻隨「實際出現的時段啞變數數量」自適應提高。
  const dummyCount = Math.max(0, presentMealTypes(regUsable).length - 1);
  const required = minForReg + DUMMY_MEALS_PER_PARAM * dummyCount;

  // 資料夠多且迴歸可解 → 迴歸法（含沒打針的純碳水餐，同時得 ICR、ISF、信心區間）。
  if (regUsable.length >= required) {
    const reg = regressionIcrIsf(regUsable);
    if (reg) return { ...reg, configuredIcr, deviates: deviates(reg.icr, configuredIcr) };
  }

  // 否則 → 偏差校正中位數法（須劑量>0，修正循環論證；ISF 用先驗）。
  return medianIcr(medianUsable, settings);
}

// 依固定順序回傳資料中實際出現的餐別（迴歸啞變數以此為準）。
const MEAL_TYPE_ORDER: MealType[] = ["breakfast", "lunch", "dinner", "snack"];
function presentMealTypes(meals: Meal[]): MealType[] {
  return MEAL_TYPE_ORDER.filter((t) => meals.some((m) => m.meal_type === t));
}

// 迴歸法：Δ = β0 + β1·碳水 + β2·胰島素 (+ 各時段啞變數)，得 a=β1、b=−β2、ISF=b、ICR=b/a。
// 階段 5.2：資料含多種餐別時，為基準外的各時段加一個啞變數，吸收各時段的基礎血糖漂移，
//   排除生理時鐘對 a/b 的干擾（只有單一餐別時不加，行為與舊版一致）。
// 階段 5.1：先用 OLS；若因共線性（如總是照碳水÷ICR 打針）導致 XᵀX 奇異「當機」，
//   退用嶺迴歸（L2）保證可解、極度穩定。
function regressionIcrIsf(meals: Meal[]): IcrIsfEstimate | null {
  const present = presentMealTypes(meals);
  const dummyTypes = present.slice(1); // 第一個出現的時段當基準。

  const X: number[][] = [];
  const y: number[] = [];
  for (const m of meals) {
    const row = [1, m.total_carbs, m.insulin_units];
    for (const t of dummyTypes) row.push(m.meal_type === t ? 1 : 0);
    X.push(row);
    y.push((m.glucose_after as number) - (m.glucose_before as number));
  }

  let fit = ols(X, y, 0);
  let ridged = false;
  if (!fit) {
    fit = ols(X, y, ridgeLambda(X));
    ridged = true;
  }
  if (!fit) return null;

  const c = fit.beta[0];
  const a = fit.beta[1];
  const b = -fit.beta[2];
  // 物理上必須 a>0（碳水升糖）、b>0（胰島素降糖），否則資料被混淆、迴歸不可信。
  if (!(a > 0) || !(b > 0)) return null;

  const icr = b / a;
  const isf = b;

  // 變異數：cov 為 σ²·夾心矩陣（嶺迴歸時亦適用，λ=0 即退化為 (XᵀX)⁻¹）。
  const varA = fit.cov[1][1];
  const varB = fit.cov[2][2];
  const covAB = -fit.cov[1][2]; // Cov(a,b)=Cov(β1,−β2)=−Cov(β1,β2)
  const seB = Math.sqrt(Math.max(varB, 0));

  // ICR=b/a 的變異數用 delta method 近似。
  const varIcr =
    varB / (a * a) +
    (b * b * varA) / (a * a * a * a) -
    (2 * b * covAB) / (a * a * a);
  const seIcr = Math.sqrt(Math.max(varIcr, 0));

  const icrCi: [number, number] = [icr - 1.96 * seIcr, icr + 1.96 * seIcr];
  const isfCi: [number, number] = [isf - 1.96 * seB, isf + 1.96 * seB];

  // 信心依 ICR 信心區間相對寬度判定。
  const relHalfWidth = icr > 0 ? (1.96 * seIcr) / icr : Infinity;
  const confidence: IcrIsfEstimate["confidence"] =
    relHalfWidth < 0.15 ? "high" : relHalfWidth < 0.35 ? "mid" : "low";

  const segNote = dummyTypes.length > 0 ? "，並控制各餐別的基礎血糖差異" : "";
  const note = ridged
    ? `以嶺迴歸（L2 正則化）估算（資料偏共線，已穩定化）${segNote}，同時得 ICR 與 ISF。`
    : `以迴歸模型估算（用上所有正常餐次，含偏高/偏低）${segNote}，同時得 ICR 與 ISF。`;

  return {
    method: "regression",
    icr,
    isf,
    icrCi,
    isfCi,
    n: meals.length,
    confidence,
    configuredIcr: 0, // 由呼叫端填入
    deviates: false, // 由呼叫端填入
    model: { a, b, c },
    note,
  };
}

// 嶺迴歸正則化強度：相對於非截距欄位的平均尺度，確保 λ 與資料量級相稱。
function ridgeLambda(X: number[][]): number {
  const k = X[0].length;
  let sum = 0;
  for (let a = 1; a < k; a++) {
    for (const row of X) sum += row[a] * row[a];
  }
  const cols = k - 1;
  return cols > 0 ? (RIDGE_ALPHA * sum) / cols : RIDGE_ALPHA;
}

// 偏差校正中位數法：把血糖偏離目標用先驗 ISF 換成劑量差，回推每餐隱含 ICR 取中位數。
function medianIcr(meals: Meal[], settings: Settings): IcrIsfEstimate {
  const center = (settings.target_glucose_low + settings.target_glucose_high) / 2;
  const assumedIsf = ASSUMED_ISF_PER_ICR * settings.icr;

  const implied: number[] = [];
  for (const m of meals) {
    const miss = (m.glucose_after as number) - center; // 正=偏高=劑量不足
    // 這餐「該打」的劑量 ≈ 實際 + 偏離/ISF；回推 ICR = 碳水 / 該打劑量。
    const correctedDose = m.insulin_units + miss / assumedIsf;
    if (correctedDose > 0) implied.push(m.total_carbs / correctedDose);
  }

  if (implied.length === 0) {
    return {
      method: "insufficient",
      icr: null,
      isf: null,
      icrCi: null,
      isfCi: null,
      n: meals.length,
      confidence: "low",
      configuredIcr: settings.icr,
      deviates: false,
      model: null,
      note: "無法回推（修正後劑量非正），樣本不足。",
    };
  }

  const icr = median(implied);
  return {
    method: "median",
    icr,
    isf: null,
    icrCi: null,
    isfCi: null,
    n: implied.length,
    confidence: implied.length >= 10 ? "mid" : "low",
    configuredIcr: settings.icr,
    deviates: deviates(icr, settings.icr),
    model: null,
    note: `資料較少，用偏差校正中位數法（已納入偏高/偏低餐；ISF 暫以臨床通則 ${ASSUMED_ISF_PER_ICR}×ICR 推估）。累積更多餐後會自動改用更準的迴歸模型。`,
  };
}

function deviates(estimated: number | null, configured: number): boolean {
  return (
    estimated != null &&
    configured > 0 &&
    Math.abs(estimated - configured) / configured > ICR_DEVIATION_THRESHOLD
  );
}

// ---- 階段 4：餐別時段提示（全域為主，某時段資料夠且明顯偏離才提示）----

// 某餐別要產生提示，至少要這麼多筆可用餐次。
export const MIN_MEALS_FOR_SEGMENT_HINT = 5;

export type MealTypeIcrHint = {
  mealType: MealType;
  estimatedIcr: number; // 該時段反推 ICR
  n: number; // 該時段用於估算的餐數
};

// 只回傳「資料夠（≥門檻）且與全域 ICR 明顯偏離」的時段，作為提示（不直接給新數字建議）。
export function mealTypeIcrHints(
  meals: Meal[],
  settings: Settings,
  globalIcr: number | null,
): MealTypeIcrHint[] {
  if (globalIcr == null || globalIcr <= 0) return [];
  const types: MealType[] = ["breakfast", "lunch", "dinner", "snack"];
  const hints: MealTypeIcrHint[] = [];
  for (const mealType of types) {
    const subset = meals.filter((m) => m.meal_type === mealType);
    const est = estimateIcrIsf(subset, settings);
    if (
      est.icr != null &&
      est.method !== "insufficient" &&
      est.n >= MIN_MEALS_FOR_SEGMENT_HINT &&
      Math.abs(est.icr - globalIcr) / globalIcr > ICR_DEVIATION_THRESHOLD
    ) {
      hints.push({ mealType, estimatedIcr: est.icr, n: est.n });
    }
  }
  return hints;
}

// ---- 階段 4：信心趨勢（迴歸啟動後，ICR 與信心區間隨餐數變化）----

export type IcrTrendPoint = {
  n: number; // 累積到第幾筆有效乾淨餐
  icr: number;
  ciLow: number;
  ciHigh: number;
};

// 將有效乾淨餐依時間排序，對遞增前綴跑迴歸，收集「有信心區間」的點。
// 需累積到 MIN_MEALS_FOR_REGRESSION 才會有第一個點；之後點愈多、區間愈窄。
export function icrConfidenceTrend(
  meals: Meal[],
  settings: Settings,
): IcrTrendPoint[] {
  const usable = cleanMeals(meals)
    .filter(usableForRegression)
    .sort(
      (a, b) =>
        new Date(a.eaten_at).getTime() - new Date(b.eaten_at).getTime(),
    );

  const points: IcrTrendPoint[] = [];
  for (let k = MIN_MEALS_FOR_REGRESSION; k <= usable.length; k++) {
    const est = estimateIcrIsf(usable.slice(0, k), settings);
    if (est.method === "regression" && est.icr != null && est.icrCi) {
      points.push({
        n: k,
        icr: est.icr,
        ciLow: est.icrCi[0],
        ciHigh: est.icrCi[1],
      });
    }
  }
  return points;
}

// ---- 階段 1-C：食物落點統計（分「單獨吃 / 混合餐」）----

export type FoodOutcomeStats = {
  n: number; // 含此食物的餐數
  ideal: number;
  high: number;
  low: number;
  typicalDose: number | null; // 整餐施打中位數（單獨吃時即為此食物劑量）
  typicalCarbs: number | null; // 此食物碳水中位數
  // 階段 2.3：劑量比例化（每份／每100克施打中位數，避免「吃少打多」）。
  // 僅單獨吃時有意義（混合餐的劑量含其他食物）；無對應計量的餐則為 null。
  dosePerServing: number | null; // 份制：每份施打單位
  dosePer100g: number | null; // 克制：每 100 克施打單位
};

export type FoodAggregate = {
  foodName: string;
  all: FoodOutcomeStats;
  solo: FoodOutcomeStats; // 單獨吃（乾淨樣本：該餐只有這一項食物）
  mixed: FoodOutcomeStats; // 混合餐
};

type FoodMealRow = {
  landing: Landing | null;
  dose: number;
  foodCarbs: number;
  unit: FoodUnit;
  amount: number; // 此食物在該餐的量（份數或克數）
};

// 食物比對：名稱「完全相同」（避免「豆腐」誤命中「板豆腐」）；
// 有填品牌時再縮到品牌也相同（品牌為選填的精確化條件）。皆 trim + 小寫。
export function foodMatches(
  mf: Pick<MealFood, "food_name" | "food_brand">,
  query: { brand?: string | null; name: string },
): boolean {
  const qName = query.name.trim().toLowerCase();
  if (!qName) return false;
  if (mf.food_name.trim().toLowerCase() !== qName) return false;
  const qBrand = query.brand?.trim().toLowerCase() || null;
  if (qBrand == null) return true; // 未指定品牌 → 不分品牌
  return (mf.food_brand?.trim().toLowerCase() ?? "") === qBrand;
}

// 依「比對條件」彙整 solo/mixed 落點統計（被 aggregateFoodOutcomes 與分組搜尋共用）。
function aggregateRows(
  match: (mf: MealFood) => boolean,
  meals: Meal[],
  mealFoods: MealFood[],
  low: number,
  high: number,
): { all: FoodOutcomeStats; solo: FoodOutcomeStats; mixed: FoodOutcomeStats } {
  const mealById = new Map(meals.map((m) => [m.id, m]));

  // 每餐的食物項數（用來判定「單獨吃」）。
  const itemCount = new Map<string, number>();
  for (const mf of mealFoods) {
    itemCount.set(mf.meal_id, (itemCount.get(mf.meal_id) ?? 0) + 1);
  }

  // 命中此食物的餐次，同一餐多列則加總碳水與量（同計量單位才加總）。
  const foodCarbsByMeal = new Map<string, number>();
  const foodAmountByMeal = new Map<string, { unit: FoodUnit; amount: number }>();
  for (const mf of mealFoods) {
    if (!match(mf)) continue;
    foodCarbsByMeal.set(
      mf.meal_id,
      (foodCarbsByMeal.get(mf.meal_id) ?? 0) + mf.carbs,
    );
    const unit = mf.unit ?? "serving";
    const amount = mf.amount ?? mf.quantity ?? 1;
    const prev = foodAmountByMeal.get(mf.meal_id);
    // 同餐同食物多列、且單位一致才把量加總；單位不一致則以第一列為準。
    if (!prev) foodAmountByMeal.set(mf.meal_id, { unit, amount });
    else if (prev.unit === unit) prev.amount += amount;
  }

  const soloRows: FoodMealRow[] = [];
  const mixedRows: FoodMealRow[] = [];
  for (const [mealId, foodCarbs] of foodCarbsByMeal) {
    const meal = mealById.get(mealId);
    if (!meal) continue;
    const amt = foodAmountByMeal.get(mealId) ?? { unit: "serving", amount: 1 };
    const row: FoodMealRow = {
      landing:
        meal.glucose_after != null
          ? landingOf(meal.glucose_after, low, high)
          : null,
      dose: meal.insulin_units,
      foodCarbs,
      unit: amt.unit,
      amount: amt.amount,
    };
    if ((itemCount.get(mealId) ?? 0) <= 1) soloRows.push(row);
    else mixedRows.push(row);
  }

  return {
    all: statsOf([...soloRows, ...mixedRows]),
    solo: statsOf(soloRows),
    mixed: statsOf(mixedRows),
  };
}

export function aggregateFoodOutcomes(
  food: { brand?: string | null; name: string },
  meals: Meal[],
  mealFoods: MealFood[],
  settings: Pick<Settings, "target_glucose_low" | "target_glucose_high">,
): FoodAggregate {
  const { all, solo, mixed } = aggregateRows(
    (mf) => foodMatches(mf, food),
    meals,
    mealFoods,
    settings.target_glucose_low,
    settings.target_glucose_high,
  );
  return { foodName: food.name.trim(), all, solo, mixed };
}

// ---- 階段 3：食物查詢（模糊搜尋找出食物，但每個相異食物分開列統計）----

export type FoodSearchGroup = {
  brand: string | null;
  name: string;
  aggregate: FoodAggregate;
  avgResidual: number | null; // 來自迴歸殘差；無模型時為 null（不顯示）
};

function strictKey(brand: string | null | undefined, name: string): string {
  return `${(brand ?? "").trim().toLowerCase()}|${name.trim().toLowerCase()}`;
}

export function searchFoodAggregates(
  query: string,
  meals: Meal[],
  mealFoods: MealFood[],
  settings: Pick<Settings, "target_glucose_low" | "target_glucose_high">,
  model: IcrModel | null = null,
): FoodSearchGroup[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  // 模糊（包含）找出有哪些「相異食物」（品牌+名稱嚴格區分）符合查詢字。
  const distinct = new Map<string, { brand: string | null; name: string }>();
  for (const mf of mealFoods) {
    const hit =
      mf.food_name.toLowerCase().includes(q) ||
      (mf.food_brand?.toLowerCase().includes(q) ?? false);
    if (!hit) continue;
    const key = strictKey(mf.food_brand, mf.food_name);
    if (!distinct.has(key)) {
      distinct.set(key, { brand: mf.food_brand, name: mf.food_name });
    }
  }

  // 殘差（需迴歸模型）：以嚴格鍵對應。
  const residualByKey = new Map<string, number>();
  if (model) {
    for (const r of foodResidualsByKey(meals, mealFoods, model)) {
      residualByKey.set(r.key, r.avgResidual);
    }
  }

  const { low, high } = {
    low: settings.target_glucose_low,
    high: settings.target_glucose_high,
  };

  const groups: FoodSearchGroup[] = [];
  for (const { brand, name } of distinct.values()) {
    const key = strictKey(brand, name);
    // 嚴格比對（品牌相同、含「無品牌」自成一格），每個相異食物獨立統計。
    const { all, solo, mixed } = aggregateRows(
      (mf) => strictKey(mf.food_brand, mf.food_name) === key,
      meals,
      mealFoods,
      low,
      high,
    );
    groups.push({
      brand,
      name,
      aggregate: { foodName: foodLabel(brand, name), all, solo, mixed },
      avgResidual: residualByKey.get(key) ?? null,
    });
  }
  // 常吃的（餐數多）排前面。
  return groups.sort((a, b) => b.aggregate.all.n - a.aggregate.all.n);
}

function statsOf(rows: FoodMealRow[]): FoodOutcomeStats {
  let ideal = 0;
  let high = 0;
  let low = 0;
  for (const r of rows) {
    if (r.landing === "ideal") ideal++;
    else if (r.landing === "high") high++;
    else if (r.landing === "low") low++;
  }
  const doses = rows.map((r) => r.dose);
  const carbs = rows.map((r) => r.foodCarbs);

  // 劑量比例化（2.3）：份制 → 每份施打；克制 → 每 100 克施打。各取中位數。
  const perServing = rows
    .filter((r) => r.unit === "serving" && r.amount > 0)
    .map((r) => r.dose / r.amount);
  const per100g = rows
    .filter((r) => r.unit === "gram" && r.amount > 0)
    .map((r) => (r.dose / r.amount) * 100);

  return {
    n: rows.length,
    ideal,
    high,
    low,
    typicalDose: doses.length > 0 ? median(doses) : null,
    typicalCarbs: carbs.length > 0 ? median(carbs) : null,
    dosePerServing: perServing.length > 0 ? median(perServing) : null,
    dosePer100g: per100g.length > 0 ? median(per100g) : null,
  };
}

// ---- 階段 1-D：食物殘差（從混合餐擠出「比預期更易升糖」的訊號）----

export type FoodResidual = {
  foodName: string;
  mealCount: number;
  avgResidual: number; // 正=實際比模型預測更會升糖
};

// 需先有迴歸模型（model）；無模型時回空陣列（呼叫端不顯示）。
export function foodResiduals(
  meals: Meal[],
  mealFoods: MealFood[],
  model: IcrModel,
): FoodResidual[] {
  const mealById = new Map(meals.map((m) => [m.id, m]));

  // 每餐殘差 = 實際 Δ血糖 − 模型預測。
  const residualByMeal = new Map<string, number>();
  for (const m of meals) {
    if (m.glucose_before == null || m.glucose_after == null) continue;
    const predicted = model.a * m.total_carbs - model.b * m.insulin_units + model.c;
    const actual = m.glucose_after - m.glucose_before;
    residualByMeal.set(m.id, actual - predicted);
  }

  // 依食物分組（同一餐重複列同食物只算一次）。
  const groups = new Map<string, { mealIds: Set<string> }>();
  for (const mf of mealFoods) {
    if (!residualByMeal.has(mf.meal_id)) continue;
    if (!mealById.has(mf.meal_id)) continue;
    const key = foodLabel(mf.food_brand, mf.food_name);
    const g = groups.get(key) ?? { mealIds: new Set<string>() };
    g.mealIds.add(mf.meal_id);
    groups.set(key, g);
  }

  const out: FoodResidual[] = [];
  for (const [foodName, g] of groups) {
    const rs = [...g.mealIds].map((id) => residualByMeal.get(id) as number);
    out.push({
      foodName,
      mealCount: rs.length,
      avgResidual: mean(rs),
    });
  }
  // 由「最易升糖」到最不易。
  return out.sort((a, b) => b.avgResidual - a.avgResidual);
}

// 同 foodResiduals，但以「品牌|名稱」嚴格鍵分組（供分組搜尋精確對應）。
function foodResidualsByKey(
  meals: Meal[],
  mealFoods: MealFood[],
  model: IcrModel,
): { key: string; avgResidual: number }[] {
  const residualByMeal = new Map<string, number>();
  for (const m of meals) {
    if (m.glucose_before == null || m.glucose_after == null) continue;
    const predicted = model.a * m.total_carbs - model.b * m.insulin_units + model.c;
    residualByMeal.set(m.id, m.glucose_after - m.glucose_before - predicted);
  }

  const groups = new Map<string, Set<string>>();
  for (const mf of mealFoods) {
    if (!residualByMeal.has(mf.meal_id)) continue;
    const key = strictKey(mf.food_brand, mf.food_name);
    const ids = groups.get(key) ?? new Set<string>();
    ids.add(mf.meal_id);
    groups.set(key, ids);
  }

  return [...groups].map(([key, ids]) => ({
    key,
    avgResidual: mean([...ids].map((id) => residualByMeal.get(id) as number)),
  }));
}

// ---- 階段 4+：食物影響（自適應，取代易混淆的整餐平均上升）----
//
// 科學依據（見改進報告與文獻）：整餐平均上升會被「共現食物、胰島素劑量、份量」
// 混淆。較可靠的做法：
//   B 殘差法（有迴歸模型時）：扣掉「碳水＋胰島素」模型預測後的殘差，正殘差＝
//     比預期更會升糖；能用上混合餐並控制劑量與共現。
//   A 單獨吃正規化（無模型時）：只取「單獨吃」的餐，算每 10g 碳水的血糖上升，
//     並要求重複（n≥MIN）以降低個人內變異。

export const MIN_MEALS_FOR_FOOD_IMPACT = 2;

export type FoodImpactMode = "residual" | "solo-normalized" | "none";

export type FoodImpactItem = {
  foodName: string;
  value: number; // 殘差 mg/dL，或每 10g 碳水上升 mg/dL
  n: number; // 採計餐數
};

export type FoodImpactResult = {
  mode: FoodImpactMode;
  items: FoodImpactItem[];
};

export function foodImpactAdaptive(
  meals: Meal[],
  mealFoods: MealFood[],
  model: IcrModel | null,
): FoodImpactResult {
  // B：有迴歸模型 → 殘差法（控制碳水與胰島素，可用混合餐）。
  if (model) {
    const byKey = new Map(
      foodResidualsByKey(meals, mealFoods, model).map((r) => [r.key, r]),
    );
    const labelByKey = new Map<string, string>();
    const countByKey = new Map<string, Set<string>>();
    for (const mf of mealFoods) {
      const key = strictKey(mf.food_brand, mf.food_name);
      labelByKey.set(key, foodLabel(mf.food_brand, mf.food_name));
      const ids = countByKey.get(key) ?? new Set<string>();
      ids.add(mf.meal_id);
      countByKey.set(key, ids);
    }
    const items: FoodImpactItem[] = [];
    for (const [key, r] of byKey) {
      const n = countByKey.get(key)?.size ?? 0;
      if (n < MIN_MEALS_FOR_FOOD_IMPACT) continue;
      items.push({ foodName: labelByKey.get(key) ?? key, value: r.avgResidual, n });
    }
    if (items.length > 0) {
      items.sort((a, b) => b.value - a.value);
      return { mode: "residual", items };
    }
  }

  // A：無模型 → 只取單獨吃的餐，算每 10g 碳水上升（需 n≥MIN）。
  const mealById = new Map(meals.map((m) => [m.id, m]));
  const itemCount = new Map<string, number>();
  for (const mf of mealFoods) {
    itemCount.set(mf.meal_id, (itemCount.get(mf.meal_id) ?? 0) + 1);
  }

  const groups = new Map<string, { label: string; rises: number[] }>();
  for (const mf of mealFoods) {
    if ((itemCount.get(mf.meal_id) ?? 0) !== 1) continue; // 只取單獨吃
    const meal = mealById.get(mf.meal_id);
    if (!meal || meal.glucose_before == null || meal.glucose_after == null) continue;
    const carbs = mf.carbs;
    if (carbs <= 0) continue;
    const key = strictKey(mf.food_brand, mf.food_name);
    const g =
      groups.get(key) ?? {
        label: foodLabel(mf.food_brand, mf.food_name),
        rises: [],
      };
    g.rises.push(((meal.glucose_after - meal.glucose_before) / carbs) * 10);
    groups.set(key, g);
  }

  const items: FoodImpactItem[] = [...groups.values()]
    .filter((g) => g.rises.length >= MIN_MEALS_FOR_FOOD_IMPACT)
    .map((g) => ({ foodName: g.label, value: mean(g.rises), n: g.rises.length }))
    .sort((a, b) => b.value - a.value);

  return items.length > 0
    ? { mode: "solo-normalized", items }
    : { mode: "none", items: [] };
}

// ---- 模組四 4.1：活性胰島素（IOB）----
//
// 用指數衰減曲線（Loop / OpenAPS 的標準做法），由 DIA（作用總時間）與 peak（高峰時間）
// 兩參數決定，依使用的胰島素設定。比直線真實：先慢、中段快、尾巴拖長。
// 僅供「防疊藥」觀察提示，非藥物動力學精算。

// 預設為速效類似物（peak 75 分、DIA 300 分 = 5 小時）。
export const DEFAULT_IOB_DIA_MIN = 300;
export const DEFAULT_IOB_PEAK_MIN = 75;

// 打針後經過 tMin 分鐘，仍殘留的比例（0~1）。指數雙參數模型。
// 需 DIA > 2×peak 才有效；否則退回線性近似避免數學爆掉。
export function iobFraction(
  tMin: number,
  diaMin: number = DEFAULT_IOB_DIA_MIN,
  peakMin: number = DEFAULT_IOB_PEAK_MIN,
): number {
  if (tMin <= 0) return 1;
  if (tMin >= diaMin) return 0;

  const td = diaMin;
  const tp = peakMin;
  if (!(td > 2 * tp)) {
    // 參數不合指數模型 → 線性備援。
    return 1 - tMin / td;
  }

  const tau = (tp * (1 - tp / td)) / (1 - (2 * tp) / td);
  const a = (2 * tau) / td;
  const S = 1 / (1 - a + (1 + a) * Math.exp(-td / tau));
  const iob =
    1 -
    S *
      (1 - a) *
      (((tMin * tMin) / (tau * td * (1 - a)) - tMin / tau - 1) *
        Math.exp(-tMin / tau) +
        1);
  // 數值上夾在 0~1。
  return Math.min(1, Math.max(0, iob));
}

// 計算到 now 為止、仍殘留的活性胰島素（加總 now 之前每筆劑量的殘留）。
export function insulinOnBoard(
  meals: Meal[],
  now: Date,
  opts: { diaMin?: number; peakMin?: number } = {},
): number {
  const diaMin = opts.diaMin ?? DEFAULT_IOB_DIA_MIN;
  const peakMin = opts.peakMin ?? DEFAULT_IOB_PEAK_MIN;
  const t = now.getTime();
  let iob = 0;
  for (const m of meals) {
    if (m.insulin_units <= 0) continue;
    const elapsedMin = (t - new Date(m.eaten_at).getTime()) / 60_000;
    if (elapsedMin <= 0 || elapsedMin >= diaMin) continue;
    iob += m.insulin_units * iobFraction(elapsedMin, diaMin, peakMin);
  }
  return iob;
}

// ---- 模組一 1.1：建議劑量（碳水 + 可選校正 − 可選 IOB）----

export type DoseSuggestion = {
  dose: number; // 最終建議（已下限 0）
  base: number; // 碳水 ÷ ICR
  correction: number; // 校正劑量（(餐前 − 目標) ÷ ISF），可正可負；進階關閉時為 0
  iob: number; // 扣除的活性胰島素；進階關閉時為 0
  icrUsed: number; // 實際用來算的 ICR
  advanced: boolean;
};

export function suggestDose(params: {
  carbs: number;
  icr: number;
  advanced: boolean;
  isf?: number | null;
  glucoseBefore?: number | null;
  correctionTarget?: number | null;
  iob?: number;
  subtractIob?: boolean; // 是否真的從建議扣 IOB（預設關，僅顯示提醒）
}): DoseSuggestion {
  const { carbs, icr, advanced } = params;
  const base = icr > 0 ? carbs / icr : 0;

  let correction = 0;
  if (
    advanced &&
    params.isf != null &&
    params.isf > 0 &&
    params.glucoseBefore != null &&
    params.correctionTarget != null
  ) {
    correction = (params.glucoseBefore - params.correctionTarget) / params.isf;
  }

  // IOB 只有在進階模式且使用者開啟「自動扣除」時才從建議扣。
  const iob = advanced && params.subtractIob ? params.iob ?? 0 : 0;
  const dose = Math.max(0, base + correction - iob);
  return { dose, base, correction, iob, icrUsed: icr, advanced };
}

// ---- 線性代數小工具（迴歸用）----

// 最小平方法（可選 L2 嶺迴歸）：解 β 使 Xβ≈y。
// lambda=0 即一般 OLS、cov=σ²(XᵀX)⁻¹；lambda>0 時 M=XᵀX+λI（不罰截距），
// cov 用夾心式 σ²·M⁻¹(XᵀX)M⁻¹（λ=0 時退化為 σ²(XᵀX)⁻¹，與舊版一致）。
function ols(
  X: number[][],
  y: number[],
  lambda: number = 0,
): { beta: number[]; cov: number[][] } | null {
  const n = X.length;
  const k = X[0].length;
  if (n <= k) return null; // 自由度不足

  // XᵀX 與 Xᵀy
  const xtx = zeros(k, k);
  const xty = new Array(k).fill(0);
  for (let i = 0; i < n; i++) {
    for (let a = 0; a < k; a++) {
      xty[a] += X[i][a] * y[i];
      for (let b = 0; b < k; b++) xtx[a][b] += X[i][a] * X[i][b];
    }
  }

  // M = XᵀX + λI（截距 index 0 不正則化）。
  const m = xtx.map((row, i) =>
    row.map((v, j) => (i === j && i > 0 ? v + lambda : v)),
  );
  const mInv = invert(m);
  if (!mInv) return null; // 奇異（共線性，迴歸不可解）

  const beta = matVec(mInv, xty);

  // 殘差變異數 σ² = RSS/(n−k)
  let rss = 0;
  for (let i = 0; i < n; i++) {
    let pred = 0;
    for (let a = 0; a < k; a++) pred += X[i][a] * beta[a];
    rss += (y[i] - pred) ** 2;
  }
  const sigma2 = rss / (n - k);

  // cov = σ²·M⁻¹(XᵀX)M⁻¹
  const cov = matMul(matMul(mInv, xtx), mInv).map((row) =>
    row.map((v) => v * sigma2),
  );
  return { beta, cov };
}

// 矩陣相乘。
function matMul(a: number[][], b: number[][]): number[][] {
  const r = a.length;
  const c = b[0].length;
  const inner = b.length;
  const out = zeros(r, c);
  for (let i = 0; i < r; i++) {
    for (let k = 0; k < inner; k++) {
      const aik = a[i][k];
      if (aik === 0) continue;
      for (let j = 0; j < c; j++) out[i][j] += aik * b[k][j];
    }
  }
  return out;
}

function zeros(r: number, c: number): number[][] {
  return Array.from({ length: r }, () => new Array(c).fill(0));
}

function matVec(m: number[][], v: number[]): number[] {
  return m.map((row) => row.reduce((s, x, j) => s + x * v[j], 0));
}

// Gauss-Jordan 矩陣求逆；奇異時回 null。
function invert(m: number[][]): number[][] | null {
  const n = m.length;
  // 增廣 [m | I]
  const a = m.map((row, i) => [
    ...row,
    ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)),
  ]);
  for (let col = 0; col < n; col++) {
    // 選主元（部分樞軸）
    let piv = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(a[r][col]) > Math.abs(a[piv][col])) piv = r;
    }
    if (Math.abs(a[piv][col]) < 1e-12) return null;
    [a[col], a[piv]] = [a[piv], a[col]];
    const d = a[col][col];
    for (let j = 0; j < 2 * n; j++) a[col][j] /= d;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = a[r][col];
      for (let j = 0; j < 2 * n; j++) a[r][j] -= f * a[col][j];
    }
  }
  return a.map((row) => row.slice(n));
}

// ---- 小工具 ----

function mean(xs: number[]): number {
  return xs.reduce((s, x) => s + x, 0) / xs.length;
}

function median(xs: number[]): number {
  const sorted = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}
