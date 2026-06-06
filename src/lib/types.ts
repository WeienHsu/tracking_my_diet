// 與資料庫 schema 對應的領域型別（見 PROJECT_PLAN.md Section 4）。

export type MealType = "breakfast" | "lunch" | "dinner" | "snack";

export const MEAL_TYPE_LABELS: Record<MealType, string> = {
  breakfast: "早餐",
  lunch: "午餐",
  dinner: "晚餐",
  snack: "點心",
};

export type MealRange = {
  breakfast_end_hour: number;
  lunch_end_hour: number;
  dinner_end_hour: number;
};

// 預設餐別時段邊界（與 DB settings 欄位預設一致）。
export const DEFAULT_MEAL_RANGE: MealRange = {
  breakfast_end_hour: 11,
  lunch_end_hour: 16,
  dinner_end_hour: 21,
};

// 依小時數判定餐別（記錄頁預設、之後可由設定調整邊界）。
export function mealTypeForHour(
  hour: number,
  range: MealRange = DEFAULT_MEAL_RANGE,
): MealType {
  if (hour < range.breakfast_end_hour) return "breakfast";
  if (hour < range.lunch_end_hour) return "lunch";
  if (hour < range.dinner_end_hour) return "dinner";
  return "snack";
}

// 食物顯示標籤：有品牌時為「品牌 食物名」，否則只顯示食物名。
export function foodLabel(
  brand: string | null | undefined,
  name: string,
): string {
  const b = brand?.trim();
  return b ? `${b} ${name}` : name;
}

export type Food = {
  id: string;
  user_id: string;
  brand: string | null; // 品牌／餐廳（選填）
  name: string; // 食物名稱
  carbs_per_serving: number; // 每份碳水克數
  serving_desc: string | null; // 份量描述（例：一個便當）
  note: string | null; // 其他備註
  created_at: string;
};

export type Meal = {
  id: string;
  user_id: string;
  eaten_at: string; // ISO 時間字串
  meal_type: MealType;
  glucose_before: number | null; // 餐前血糖 mg/dL
  total_carbs: number; // 碳水總量 g
  insulin_units: number; // 實際施打單位
  glucose_after: number | null; // 餐後兩小時血糖 mg/dL
  note: string | null;
  created_at: string;
};

export type MealFood = {
  id: string;
  meal_id: string;
  food_id: string | null;
  food_brand: string | null; // 冗餘存品牌，食物被刪也保留歷史
  food_name: string; // 冗餘存名稱，食物被刪也保留歷史
  carbs: number; // 此餐此食物的碳水量
  quantity: number;
};

// 糖化血色素（A1C）紀錄：每隔一段時間測一次的回顧指標。
export type A1cRecord = {
  id: string;
  user_id: string;
  measured_at: string; // 量測日期（YYYY-MM-DD）
  value: number; // A1C %
  note: string | null;
  created_at: string;
};

export type Settings = {
  user_id: string;
  icr: number; // g 碳水 / 1 單位
  target_glucose_low: number;
  target_glucose_high: number;
  // 餐別自動判定的時段邊界（小時，0–23）。記錄頁據此預設餐別。
  breakfast_end_hour: number; // 此時前算早餐
  lunch_end_hour: number; // 此時前算午餐
  dinner_end_hour: number; // 此時前算晚餐，之後算點心
  updated_at: string;
};

// ---- 新增/更新用的輸入型別（user_id 由 DB 預設 auth.uid() 填入）----

export type FoodInput = {
  brand?: string | null;
  name: string;
  carbs_per_serving: number;
  serving_desc?: string | null;
  note?: string | null;
};

export type MealInput = {
  eaten_at: string;
  meal_type: MealType;
  glucose_before?: number | null;
  total_carbs: number;
  insulin_units: number;
  glucose_after?: number | null;
  note?: string | null;
};

export type MealFoodInput = {
  food_id?: string | null;
  food_brand?: string | null;
  food_name: string;
  carbs: number;
  quantity?: number;
};

export type A1cInput = {
  measured_at: string;
  value: number;
  note?: string | null;
};

export type SettingsInput = {
  icr: number;
  target_glucose_low: number;
  target_glucose_high: number;
  breakfast_end_hour: number;
  lunch_end_hour: number;
  dinner_end_hour: number;
};
