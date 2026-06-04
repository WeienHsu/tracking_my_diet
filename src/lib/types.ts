// 與資料庫 schema 對應的領域型別（見 PROJECT_PLAN.md Section 4）。

export type MealType = "breakfast" | "lunch" | "dinner" | "snack";

export const MEAL_TYPE_LABELS: Record<MealType, string> = {
  breakfast: "早餐",
  lunch: "午餐",
  dinner: "晚餐",
  snack: "點心",
};

export type Food = {
  id: string;
  user_id: string;
  name: string;
  carbs_per_serving: number; // 每份碳水克數
  serving_desc: string | null; // 份量描述（例：一個便當）
  note: string | null; // 餐廳、品牌等
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
  food_name: string; // 冗餘存名稱，食物被刪也保留歷史
  carbs: number; // 此餐此食物的碳水量
  quantity: number;
};

export type Settings = {
  user_id: string;
  icr: number; // g 碳水 / 1 單位
  target_glucose_low: number;
  target_glucose_high: number;
  updated_at: string;
};

// ---- 新增/更新用的輸入型別（user_id 由 DB 預設 auth.uid() 填入）----

export type FoodInput = {
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
  food_name: string;
  carbs: number;
  quantity?: number;
};

export type SettingsInput = {
  icr: number;
  target_glucose_low: number;
  target_glucose_high: number;
};
