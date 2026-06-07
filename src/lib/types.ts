// 與資料庫 schema 對應的領域型別（見 PROJECT_PLAN.md Section 4）。

export type MealType = "breakfast" | "lunch" | "dinner" | "snack";

export const MEAL_TYPE_LABELS: Record<MealType, string> = {
  breakfast: "早餐",
  lunch: "午餐",
  dinner: "晚餐",
  snack: "點心",
};

// 運動強度：影響胰島素敏感度，算 ICR 時可據此排除「不正常的餐」。
export type Exercise = "none" | "light" | "intense";

export const EXERCISE_LABELS: Record<Exercise, string> = {
  none: "無",
  light: "輕",
  intense: "劇",
};

// 餐次狀態標籤（多選）：會影響血糖、算 ICR 時可排除這些餐。
export type MealContext = "illness" | "stress" | "alcohol";

export const MEAL_CONTEXT_LABELS: Record<MealContext, string> = {
  illness: "生病",
  stress: "壓力",
  alcohol: "喝酒",
};

// 餐別判定：三餐中心時間（分鐘 of day）與半徑（±分鐘）。
// 落在任一中心 ±window_min 內歸該餐（取最近的中心）；都不在則算點心。
export type MealCenters = {
  breakfast_min: number;
  lunch_min: number;
  dinner_min: number;
  window_min: number;
};

// 預設：早 08:00、午 12:30、晚 18:30、±90 分（與 DB 欄位預設一致）。
export const DEFAULT_MEAL_CENTERS: MealCenters = {
  breakfast_min: 480,
  lunch_min: 750,
  dinner_min: 1110,
  window_min: 90,
};

// 依「當日分鐘數」判定餐別（記錄頁預設、可由設定調整中心與半徑）。
export function mealTypeForMinutes(
  minOfDay: number,
  c: MealCenters = DEFAULT_MEAL_CENTERS,
): MealType {
  const candidates: [MealType, number][] = [
    ["breakfast", c.breakfast_min],
    ["lunch", c.lunch_min],
    ["dinner", c.dinner_min],
  ];
  let best: MealType | null = null;
  let bestDist = Infinity;
  for (const [type, center] of candidates) {
    const d = Math.abs(minOfDay - center);
    if (d <= c.window_min && d < bestDist) {
      best = type;
      bestDist = d;
    }
  }
  return best ?? "snack";
}

// 食物計量方式：份制（每份碳水×份數）或克制（每100克碳水×克數）。
export type FoodUnit = "serving" | "gram";

export const FOOD_UNIT_LABELS: Record<FoodUnit, string> = {
  serving: "份",
  gram: "克",
};

// 食物顯示標籤：有品牌時為「品牌 食物名」，否則只顯示食物名。
export function foodLabel(
  brand: string | null | undefined,
  name: string,
): string {
  const b = brand?.trim();
  return b ? `${b} ${name}` : name;
}

// 一筆食物的總碳水：份制＝每份碳水×份數；克制＝每100克碳水×克數/100。
export function foodCarbs(
  unit: FoodUnit,
  carbsPerUnit: number,
  amount: number,
): number {
  if (!(carbsPerUnit > 0) || !(amount > 0)) return 0;
  return unit === "gram" ? (carbsPerUnit * amount) / 100 : carbsPerUnit * amount;
}

export type Food = {
  id: string;
  user_id: string;
  brand: string | null; // 品牌／餐廳（選填）
  name: string; // 食物名稱
  carbs_per_serving: number | null; // 每份碳水克數（份制食物）
  carbs_per_100g: number | null; // 每 100 克碳水（克制食物）
  serving_grams: number | null; // 每份克重（選填，用來在份↔克間換算）
  serving_desc: string | null; // 份量描述（例：一個便當）
  note: string | null; // 其他備註
  created_at: string;
};

// 3.2：有「每份克重」時，從已知的一種碳水推算另一種（份↔克自動補齊）。
// 兩種都有或都無、或沒填克重時，原樣回傳、不亂猜。
export function deriveCarbs(
  servingGrams: number | null | undefined,
  carbsPerServing: number | null | undefined,
  carbsPer100g: number | null | undefined,
): { carbs_per_serving: number | null; carbs_per_100g: number | null } {
  let ps = carbsPerServing ?? null;
  let pg = carbsPer100g ?? null;
  if (servingGrams != null && servingGrams > 0) {
    if (ps != null && pg == null) pg = (ps / servingGrams) * 100;
    else if (pg != null && ps == null) ps = (pg * servingGrams) / 100;
  }
  return { carbs_per_serving: ps, carbs_per_100g: pg };
}

export type Meal = {
  id: string;
  user_id: string;
  eaten_at: string; // ISO 時間字串
  meal_type: MealType;
  glucose_before: number | null; // 餐前血糖 mg/dL
  total_carbs: number; // 碳水總量 g
  insulin_units: number; // 實際施打單位
  glucose_after: number | null; // 餐後兩小時血糖 mg/dL
  exercise: Exercise; // 運動強度（影響胰島素敏感度）
  context: MealContext[]; // 狀態標籤（生病/壓力/喝酒）
  note: string | null;
  created_at: string;
};

export type MealFood = {
  id: string;
  meal_id: string;
  food_id: string | null;
  food_brand: string | null; // 冗餘存品牌，食物被刪也保留歷史
  food_name: string; // 冗餘存名稱，食物被刪也保留歷史
  carbs: number; // 此餐此食物的「總」碳水量 g（已含份數/克數換算）
  unit: FoodUnit; // 計量方式：份 / 克
  amount: number; // 吃的量：份數（unit=serving）或克數（unit=gram）
  quantity: number; // 舊欄位（份數），保留相容；新資料改用 amount
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
  // 餐別自動判定：三餐中心時間（分鐘 of day）與半徑（±分鐘）。
  breakfast_center_min: number;
  lunch_center_min: number;
  dinner_center_min: number;
  meal_window_min: number;
  // 進階建議劑量（模組一/四）。
  isf: number | null; // 胰島素敏感因子（每 1 單位降多少 mg/dL）
  correction_target: number | null; // 校正目標血糖
  advanced_dose: boolean; // 進階建議劑量開關（含校正劑量與 IOB 扣除）
  // IOB（活性胰島素）參數：指數曲線由 DIA 與 peak 決定（依使用的胰島素）。
  insulin_dia_min: number; // 作用總時間（分鐘）
  insulin_peak_min: number; // 作用高峰時間（分鐘）
  iob_auto_subtract: boolean; // 是否自動從建議劑量扣除 IOB（預設關）
  updated_at: string;
};

// ---- 新增/更新用的輸入型別（user_id 由 DB 預設 auth.uid() 填入）----

export type FoodInput = {
  brand?: string | null;
  name: string;
  carbs_per_serving?: number | null;
  carbs_per_100g?: number | null;
  serving_grams?: number | null;
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
  exercise?: Exercise;
  context?: MealContext[];
  note?: string | null;
};

export type MealFoodInput = {
  food_id?: string | null;
  food_brand?: string | null;
  food_name: string;
  carbs: number; // 總碳水（已換算）
  unit?: FoodUnit;
  amount?: number;
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
  breakfast_center_min: number;
  lunch_center_min: number;
  dinner_center_min: number;
  meal_window_min: number;
  isf: number | null;
  correction_target: number | null;
  advanced_dose: boolean;
  insulin_dia_min: number;
  insulin_peak_min: number;
  iob_auto_subtract: boolean;
};
