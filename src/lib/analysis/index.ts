// 分析邏輯（純函式、可測試）。見 PROJECT_PLAN.md Section 5。
// Phase 2 僅放型別定義與空殼，實作於 Phase 5。
/* eslint-disable @typescript-eslint/no-unused-vars -- 空殼簽章，參數於 Phase 5 使用 */

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

// ---- 空殼（Phase 5 實作）----

export function classifyLanding(
  _meals: Meal[],
  _settings: Pick<Settings, "target_glucose_low" | "target_glucose_high">,
): LandingSummary {
  throw new Error("Not implemented (Phase 5)");
}

export function estimateActualIcr(
  _meals: Meal[],
  _settings: Settings,
): IcrEstimate {
  throw new Error("Not implemented (Phase 5)");
}

export function rankFoodImpact(
  _meals: Meal[],
  _mealFoods: MealFood[],
): FoodImpact[] {
  throw new Error("Not implemented (Phase 5)");
}

export function foodHistory(
  _foodName: string,
  _meals: Meal[],
  _mealFoods: MealFood[],
): FoodHistoryEntry[] {
  throw new Error("Not implemented (Phase 5)");
}
