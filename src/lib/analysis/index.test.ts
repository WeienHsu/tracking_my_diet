import { describe, it, expect } from "vitest";
import type { Meal, MealFood, Settings } from "@/lib/types";
import {
  isCleanMeal,
  cleanMeals,
  estimateIcrIsf,
  mealTypeIcrHints,
  icrConfidenceTrend,
  aggregateFoodOutcomes,
  searchFoodAggregates,
  foodResiduals,
} from "./index";

// ---- 測試用建構子 ----

function makeMeal(p: Partial<Meal> & { id: string }): Meal {
  return {
    user_id: "u",
    eaten_at: "2026-06-01T08:00:00Z",
    meal_type: "breakfast",
    glucose_before: 100,
    total_carbs: 30,
    insulin_units: 5,
    glucose_after: 120,
    exercise: "none",
    context: [],
    note: null,
    created_at: "2026-06-01T08:00:00Z",
    ...p,
  };
}

function makeMealFood(p: Partial<MealFood> & { meal_id: string }): MealFood {
  return {
    id: `${p.meal_id}-${p.food_name ?? "f"}`,
    food_id: null,
    food_brand: null,
    food_name: "食物",
    carbs: 30,
    quantity: 1,
    ...p,
  };
}

const SETTINGS: Settings = {
  user_id: "u",
  icr: 5,
  target_glucose_low: 80,
  target_glucose_high: 180,
  breakfast_end_hour: 11,
  lunch_end_hour: 16,
  dinner_end_hour: 21,
  updated_at: "2026-06-01T00:00:00Z",
};

// ---- clean-meal 過濾 ----

describe("clean-meal 過濾", () => {
  it("有運動或狀態標籤的餐視為不正常", () => {
    expect(isCleanMeal(makeMeal({ id: "a" }))).toBe(true);
    expect(isCleanMeal(makeMeal({ id: "b", exercise: "light" }))).toBe(false);
    expect(isCleanMeal(makeMeal({ id: "c", context: ["stress"] }))).toBe(false);
  });

  it("cleanMeals 只留正常餐", () => {
    const meals = [
      makeMeal({ id: "a" }),
      makeMeal({ id: "b", exercise: "intense" }),
      makeMeal({ id: "c", context: ["illness"] }),
    ];
    expect(cleanMeals(meals).map((m) => m.id)).toEqual(["a"]);
  });
});

// ---- 自適應 ICR/ISF ----

describe("estimateIcrIsf", () => {
  it("可用餐次太少時回報樣本不足", () => {
    const meals = [makeMeal({ id: "a" }), makeMeal({ id: "b" })];
    const r = estimateIcrIsf(meals, SETTINGS);
    expect(r.method).toBe("insufficient");
    expect(r.icr).toBeNull();
  });

  it("迴歸法能從已知模型回推 ICR 與 ISF", () => {
    // 真值：ICR=7、ISF=35 → a=ISF/ICR=5、b=35、c=0。
    // Δ血糖 = 5·碳水 − 35·胰島素。讓碳水與胰島素各自獨立變化避免共線性。
    const ICR = 7;
    const ISF = 35;
    const a = ISF / ICR;
    const meals: Meal[] = [];
    for (let i = 0; i < 40; i++) {
      const carbs = 30 + (i % 7) * 10; // 週期 7
      const insulin = carbs / ICR + ((i % 3) - 1) * 2; // 週期 3 的獨立偏移
      const before = 100;
      const after = before + a * carbs - ISF * insulin;
      meals.push(
        makeMeal({
          id: `m${i}`,
          total_carbs: carbs,
          insulin_units: insulin,
          glucose_before: before,
          glucose_after: after,
        }),
      );
    }
    const r = estimateIcrIsf(meals, SETTINGS);
    expect(r.method).toBe("regression");
    expect(r.icr).toBeCloseTo(7, 4);
    expect(r.isf).toBeCloseTo(35, 4);
    expect(r.model).not.toBeNull();
    // ICR 7 vs 設定 5，偏差 40% > 20% → 應標記 deviates。
    expect(r.deviates).toBe(true);
  });

  it("資料介於門檻之間時用偏差校正中位數法", () => {
    // 5 筆「打剛好」的餐（餐後=目標中心 130），隱含 ICR=碳水/施打。
    const center = (SETTINGS.target_glucose_low + SETTINGS.target_glucose_high) / 2;
    const meals: Meal[] = [];
    for (let i = 0; i < 5; i++) {
      const carbs = 40 + i * 5;
      meals.push(
        makeMeal({
          id: `m${i}`,
          total_carbs: carbs,
          insulin_units: carbs / 5, // ICR=5
          glucose_before: 100,
          glucose_after: center,
        }),
      );
    }
    const r = estimateIcrIsf(meals, SETTINGS);
    expect(r.method).toBe("median");
    expect(r.icr).toBeCloseTo(5, 6);
    expect(r.isf).toBeNull();
  });

  it("排除有運動/狀態標記的餐後才估算", () => {
    const meals = [
      makeMeal({ id: "a" }),
      makeMeal({ id: "b", exercise: "intense" }),
      makeMeal({ id: "c", context: ["alcohol"] }),
    ];
    const r = estimateIcrIsf(meals, SETTINGS);
    // 只剩 1 筆正常餐 → 不足。
    expect(r.n).toBe(1);
    expect(r.method).toBe("insufficient");
  });
});

// ---- 信心趨勢 ----

describe("icrConfidenceTrend", () => {
  it("未達迴歸門檻時無資料點", () => {
    const meals = Array.from({ length: 10 }, (_, i) =>
      makeMeal({ id: `m${i}` }),
    );
    expect(icrConfidenceTrend(meals, SETTINGS)).toEqual([]);
  });

  it("達門檻後產生資料點（從第 30 筆起，依時間遞增）", () => {
    // 造 35 筆符合已知模型的有效乾淨餐（同迴歸測試的構造）。
    const ICR = 7;
    const ISF = 35;
    const a = ISF / ICR;
    const meals: Meal[] = [];
    for (let i = 0; i < 35; i++) {
      const carbs = 30 + (i % 7) * 10;
      const insulin = carbs / ICR + ((i % 3) - 1) * 2;
      meals.push(
        makeMeal({
          id: `m${i}`,
          eaten_at: `2026-06-${String((i % 28) + 1).padStart(2, "0")}T08:00:00Z`,
          total_carbs: carbs,
          insulin_units: insulin,
          glucose_before: 100,
          glucose_after: 100 + a * carbs - ISF * insulin,
        }),
      );
    }
    const trend = icrConfidenceTrend(meals, SETTINGS);
    // 35 筆 → 點為 n=30..35，共 6 個。
    expect(trend).toHaveLength(6);
    expect(trend[0].n).toBe(30);
    expect(trend[trend.length - 1].n).toBe(35);
    // ICR 應接近真值 7，且區間有上下界。
    expect(trend[0].icr).toBeCloseTo(7, 3);
    expect(trend[0].ciLow).toBeLessThanOrEqual(trend[0].icr);
    expect(trend[0].ciHigh).toBeGreaterThanOrEqual(trend[0].icr);
  });
});

// ---- 餐別時段提示 ----

describe("mealTypeIcrHints", () => {
  it("某時段資料夠且明顯偏離全域才提示", () => {
    // 早餐 6 筆，餐後皆理想，碳水/施打=8（隱含 ICR≈8，偏離全域 5）。
    const center =
      (SETTINGS.target_glucose_low + SETTINGS.target_glucose_high) / 2;
    const breakfasts: Meal[] = [];
    for (let i = 0; i < 6; i++) {
      breakfasts.push(
        makeMeal({
          id: `b${i}`,
          meal_type: "breakfast",
          total_carbs: 80,
          insulin_units: 10, // 80/10 = 8
          glucose_before: 100,
          glucose_after: center, // 打剛好 → 隱含 ICR=碳水/施打=8
        }),
      );
    }
    // 午餐只有 1 筆 → 不足、不提示。
    const lunch = makeMeal({ id: "l1", meal_type: "lunch" });

    const hints = mealTypeIcrHints([...breakfasts, lunch], SETTINGS, 5);
    expect(hints).toHaveLength(1);
    expect(hints[0].mealType).toBe("breakfast");
    expect(hints[0].estimatedIcr).toBeCloseTo(8, 1);
    expect(hints[0].n).toBe(6);
  });

  it("全域 ICR 為 null 時不提示", () => {
    expect(mealTypeIcrHints([makeMeal({ id: "a" })], SETTINGS, null)).toEqual([]);
  });
});

// ---- 食物落點統計 ----

describe("aggregateFoodOutcomes", () => {
  it("分開單獨吃與混合餐並計落點", () => {
    const meals = [
      // 單獨吃白飯，餐後理想
      makeMeal({ id: "m1", glucose_after: 130, insulin_units: 8 }),
      // 白飯+雞排，餐後偏高
      makeMeal({ id: "m2", glucose_after: 220, insulin_units: 16 }),
    ];
    const mealFoods = [
      makeMealFood({ meal_id: "m1", food_name: "白飯", carbs: 60 }),
      makeMealFood({ meal_id: "m2", food_name: "白飯", carbs: 60 }),
      makeMealFood({ meal_id: "m2", food_name: "雞排", carbs: 10 }),
    ];
    const agg = aggregateFoodOutcomes({ name: "白飯" }, meals, mealFoods, SETTINGS);

    expect(agg.all.n).toBe(2);
    expect(agg.solo.n).toBe(1);
    expect(agg.mixed.n).toBe(1);
    expect(agg.solo.ideal).toBe(1);
    expect(agg.mixed.high).toBe(1);
    // 單獨吃時的劑量即為此食物劑量。
    expect(agg.solo.typicalDose).toBe(8);
    expect(agg.solo.typicalCarbs).toBe(60);
  });

  it("查無此食物時各統計為 0", () => {
    const meals = [makeMeal({ id: "m1" })];
    const mealFoods = [makeMealFood({ meal_id: "m1", food_name: "白飯" })];
    const agg = aggregateFoodOutcomes({ name: "牛排" }, meals, mealFoods, SETTINGS);
    expect(agg.all.n).toBe(0);
    expect(agg.all.typicalDose).toBeNull();
  });

  it("完全比對：查「豆腐」不會誤命中「板豆腐」", () => {
    const meals = [makeMeal({ id: "m1" }), makeMeal({ id: "m2" })];
    const mealFoods = [
      makeMealFood({ meal_id: "m1", food_name: "豆腐" }),
      makeMealFood({ meal_id: "m2", food_name: "板豆腐" }),
    ];
    expect(aggregateFoodOutcomes({ name: "豆腐" }, meals, mealFoods, SETTINGS).all.n).toBe(1);
    expect(aggregateFoodOutcomes({ name: "板豆腐" }, meals, mealFoods, SETTINGS).all.n).toBe(1);
  });

  it("有填品牌時縮到同品牌；未填品牌則不分品牌", () => {
    const meals = [makeMeal({ id: "m1" }), makeMeal({ id: "m2" })];
    const mealFoods = [
      makeMealFood({ meal_id: "m1", food_brand: "星巴克", food_name: "拿鐵" }),
      makeMealFood({ meal_id: "m2", food_brand: "路易莎", food_name: "拿鐵" }),
    ];
    // 未填品牌 → 兩家拿鐵都算
    expect(aggregateFoodOutcomes({ name: "拿鐵" }, meals, mealFoods, SETTINGS).all.n).toBe(2);
    // 指定品牌 → 只算該品牌
    expect(
      aggregateFoodOutcomes({ brand: "星巴克", name: "拿鐵" }, meals, mealFoods, SETTINGS).all.n,
    ).toBe(1);
  });
});

// ---- 分組搜尋 ----

describe("searchFoodAggregates", () => {
  it("模糊搜尋找出食物，但每個相異食物分開統計", () => {
    const meals = [
      makeMeal({ id: "m1" }),
      makeMeal({ id: "m2" }),
      makeMeal({ id: "m3" }),
    ];
    const mealFoods = [
      makeMealFood({ meal_id: "m1", food_name: "豆腐" }),
      makeMealFood({ meal_id: "m2", food_name: "板豆腐" }),
      makeMealFood({ meal_id: "m3", food_name: "板豆腐" }),
    ];
    const groups = searchFoodAggregates("豆腐", meals, mealFoods, SETTINGS);
    // 兩個相異食物：豆腐、板豆腐（不合併）。
    expect(groups.map((g) => g.name).sort()).toEqual(["板豆腐", "豆腐"]);
    // 板豆腐 2 次（餐數多）排前面。
    expect(groups[0].name).toBe("板豆腐");
    expect(groups[0].aggregate.all.n).toBe(2);
    const tofu = groups.find((g) => g.name === "豆腐")!;
    expect(tofu.aggregate.all.n).toBe(1);
  });

  it("同名不同品牌視為相異食物，各自一組", () => {
    const meals = [makeMeal({ id: "m1" }), makeMeal({ id: "m2" })];
    const mealFoods = [
      makeMealFood({ meal_id: "m1", food_brand: "星巴克", food_name: "拿鐵" }),
      makeMealFood({ meal_id: "m2", food_brand: "路易莎", food_name: "拿鐵" }),
    ];
    const groups = searchFoodAggregates("拿鐵", meals, mealFoods, SETTINGS);
    expect(groups).toHaveLength(2);
    expect(groups.every((g) => g.aggregate.all.n === 1)).toBe(true);
  });

  it("空查詢回空陣列", () => {
    expect(searchFoodAggregates("  ", [], [], SETTINGS)).toEqual([]);
  });
});

// ---- 食物殘差 ----

describe("foodResiduals", () => {
  it("比模型預測更易升糖的食物排前面且殘差為正", () => {
    const model = { a: 5, b: 30, c: 0 };
    const meals = [
      // 預測 Δ=5*10-30*2=-10；實際 +50 → 殘差 +60
      makeMeal({ id: "mA", total_carbs: 10, insulin_units: 2, glucose_before: 100, glucose_after: 150 }),
      // 預測 -10；實際 -20 → 殘差 -10
      makeMeal({ id: "mB", total_carbs: 10, insulin_units: 2, glucose_before: 100, glucose_after: 80 }),
    ];
    const mealFoods = [
      makeMealFood({ meal_id: "mA", food_name: "含糖飲料" }),
      makeMealFood({ meal_id: "mB", food_name: "燙青菜" }),
    ];
    const res = foodResiduals(meals, mealFoods, model);
    expect(res[0].foodName).toBe("含糖飲料");
    expect(res[0].avgResidual).toBeCloseTo(60, 6);
    expect(res[1].foodName).toBe("燙青菜");
    expect(res[1].avgResidual).toBeCloseTo(-10, 6);
  });
});
