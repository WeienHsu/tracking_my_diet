// 分析邏輯（純函式、可測試）。見 PROJECT_PLAN.md Section 5。

import type { Meal, MealFood, Settings } from "@/lib/types";

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

  // 依食物名稱分組（冗餘存的 food_name 為準，食物被刪也保留）。
  const groups = new Map<string, MealFood[]>();
  for (const mf of mealFoods) {
    const key = mf.food_name;
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
