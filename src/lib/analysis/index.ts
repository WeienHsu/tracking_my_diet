// 分析邏輯（純函式、可測試）。見 PROJECT_PLAN.md Section 5。

import { foodLabel, type Meal, type MealFood, type Settings } from "@/lib/types";

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
      carbs: mf.carbs * (mf.quantity ?? 1),
      insulinUnits: meal.insulin_units,
      glucoseBefore: meal.glucose_before,
      glucoseAfter: meal.glucose_after,
    }))
    .sort(
      (a, b) => new Date(b.eatenAt).getTime() - new Date(a.eatenAt).getTime(),
    );
}

// ---- 階段 1-A：clean-meal 過濾（排除「不正常的餐」）----

// 有運動或任何狀態標籤（生病/壓力/喝酒）的餐視為「不正常」，不納入 ICR/ISF 估算。
export function isCleanMeal(m: Meal): boolean {
  return m.exercise === "none" && (m.context?.length ?? 0) === 0;
}

export function cleanMeals(meals: Meal[]): Meal[] {
  return meals.filter(isCleanMeal);
}

// 可用於估算的餐：餐前、餐後、碳水、施打皆有效。
function usableForIcr(m: Meal): boolean {
  return (
    m.glucose_before != null &&
    m.glucose_after != null &&
    m.total_carbs > 0 &&
    m.insulin_units > 0
  );
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
  opts: { minMealsForRegression?: number } = {},
): IcrIsfEstimate {
  const minForReg = opts.minMealsForRegression ?? MIN_MEALS_FOR_REGRESSION;
  const configuredIcr = settings.icr;

  // 只用「正常的餐」估算（排除運動/生病/壓力/喝酒）。
  const usable = cleanMeals(meals).filter(usableForIcr);

  const base = {
    isf: null,
    isfCi: null,
    icrCi: null,
    n: usable.length,
    configuredIcr,
    model: null,
  } as const;

  if (usable.length < MIN_MEALS_FOR_ESTIMATE) {
    return {
      ...base,
      method: "insufficient",
      icr: null,
      confidence: "low",
      deviates: false,
      note: `可用餐次僅 ${usable.length} 筆（已排除有運動/狀態標記的餐），樣本不足，暫不估算。`,
    };
  }

  // 資料夠多且迴歸可解 → 迴歸法（同時得 ICR、ISF、信心區間）。
  if (usable.length >= minForReg) {
    const reg = regressionIcrIsf(usable);
    if (reg) return { ...reg, configuredIcr, deviates: deviates(reg.icr, configuredIcr) };
  }

  // 否則 → 偏差校正中位數法（用上所有餐，修正循環論證；ISF 用先驗）。
  return medianIcr(usable, settings);
}

// 迴歸法：Δ = β0 + β1·碳水 + β2·胰島素，得 a=β1、b=−β2、ISF=b、ICR=b/a。
function regressionIcrIsf(meals: Meal[]): IcrIsfEstimate | null {
  const X: number[][] = [];
  const y: number[] = [];
  for (const m of meals) {
    X.push([1, m.total_carbs, m.insulin_units]);
    y.push((m.glucose_after as number) - (m.glucose_before as number));
  }

  const fit = ols(X, y);
  if (!fit) return null;

  const [c, beta1, beta2] = fit.beta;
  const a = beta1;
  const b = -beta2;
  // 物理上必須 a>0（碳水升糖）、b>0（胰島素降糖），否則資料被混淆、迴歸不可信。
  if (!(a > 0) || !(b > 0)) return null;

  const icr = b / a;
  const isf = b;

  // 變異數：cov = σ²·(XᵀX)⁻¹。ISF=b=−β2 → Var(b)=Var(β2)。
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
    note: `以迴歸模型估算（用上所有正常餐次，含偏高/偏低），同時得 ICR 與 ISF。`,
  };
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

// ---- 階段 1-C：食物落點統計（分「單獨吃 / 混合餐」）----

export type FoodOutcomeStats = {
  n: number; // 含此食物的餐數
  ideal: number;
  high: number;
  low: number;
  typicalDose: number | null; // 整餐施打中位數（單獨吃時即為此食物劑量）
  typicalCarbs: number | null; // 此食物碳水中位數
};

export type FoodAggregate = {
  foodName: string;
  all: FoodOutcomeStats;
  solo: FoodOutcomeStats; // 單獨吃（乾淨樣本：該餐只有這一項食物）
  mixed: FoodOutcomeStats; // 混合餐
};

type FoodMealRow = { landing: Landing | null; dose: number; foodCarbs: number };

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

export function aggregateFoodOutcomes(
  food: { brand?: string | null; name: string },
  meals: Meal[],
  mealFoods: MealFood[],
  settings: Pick<Settings, "target_glucose_low" | "target_glucose_high">,
): FoodAggregate {
  const mealById = new Map(meals.map((m) => [m.id, m]));

  // 每餐的食物項數（用來判定「單獨吃」）。
  const itemCount = new Map<string, number>();
  for (const mf of mealFoods) {
    itemCount.set(mf.meal_id, (itemCount.get(mf.meal_id) ?? 0) + 1);
  }

  // 完全比對此食物（名稱相同、品牌相同或未指定），同一餐多列則加總碳水。
  const foodCarbsByMeal = new Map<string, number>();
  for (const mf of mealFoods) {
    if (!foodMatches(mf, food)) continue;
    const c = mf.carbs * (mf.quantity ?? 1);
    foodCarbsByMeal.set(mf.meal_id, (foodCarbsByMeal.get(mf.meal_id) ?? 0) + c);
  }

  const { low, high } = {
    low: settings.target_glucose_low,
    high: settings.target_glucose_high,
  };

  const soloRows: FoodMealRow[] = [];
  const mixedRows: FoodMealRow[] = [];
  for (const [mealId, foodCarbs] of foodCarbsByMeal) {
    const meal = mealById.get(mealId);
    if (!meal) continue;
    const row: FoodMealRow = {
      landing:
        meal.glucose_after != null
          ? landingOf(meal.glucose_after, low, high)
          : null,
      dose: meal.insulin_units,
      foodCarbs,
    };
    if ((itemCount.get(mealId) ?? 0) <= 1) soloRows.push(row);
    else mixedRows.push(row);
  }

  return {
    foodName: food.name.trim(),
    all: statsOf([...soloRows, ...mixedRows]),
    solo: statsOf(soloRows),
    mixed: statsOf(mixedRows),
  };
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
  return {
    n: rows.length,
    ideal,
    high,
    low,
    typicalDose: doses.length > 0 ? median(doses) : null,
    typicalCarbs: carbs.length > 0 ? median(carbs) : null,
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

// ---- 線性代數小工具（迴歸用）----

// 普通最小平方法：解 β 使 Xβ≈y，回傳係數與共變異矩陣（cov=σ²(XᵀX)⁻¹）。
function ols(
  X: number[][],
  y: number[],
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

  const xtxInv = invert(xtx);
  if (!xtxInv) return null; // 奇異（共線性，迴歸不可解）

  const beta = matVec(xtxInv, xty);

  // 殘差變異數 σ² = RSS/(n−k)
  let rss = 0;
  for (let i = 0; i < n; i++) {
    let pred = 0;
    for (let a = 0; a < k; a++) pred += X[i][a] * beta[a];
    rss += (y[i] - pred) ** 2;
  }
  const sigma2 = rss / (n - k);

  const cov = xtxInv.map((row) => row.map((v) => v * sigma2));
  return { beta, cov };
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
