import { describe, it, expect } from "vitest";
import type { Meal, MealFood, Settings } from "@/lib/types";
import { foodCarbs } from "@/lib/types";
import {
  isCleanMeal,
  cleanMeals,
  wellSpacedMeals,
  recentMeals,
  estimateIcrIsf,
  mealTypeIcrHints,
  icrConfidenceTrend,
  aggregateFoodOutcomes,
  searchFoodAggregates,
  foodResiduals,
  foodImpactAdaptive,
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

// 第 i 天的 08:00（UTC），用來造「間隔 > 4 小時的獨立乾淨餐」（階段 5.3）。
function dayIso(i: number): string {
  return new Date(Date.UTC(2026, 0, 1 + i, 8, 0, 0)).toISOString();
}

function makeMealFood(p: Partial<MealFood> & { meal_id: string }): MealFood {
  return {
    id: `${p.meal_id}-${p.food_name ?? "f"}`,
    food_id: null,
    food_brand: null,
    food_name: "食物",
    carbs: 30,
    unit: "serving",
    amount: 1,
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

// ---- 問題1：食物碳水換算（份 / 每100克）----

describe("foodCarbs", () => {
  it("份制：每份碳水 × 份數（支援半份）", () => {
    expect(foodCarbs("serving", 38, 0.5)).toBeCloseTo(19, 6); // 每份38g、吃半份
    expect(foodCarbs("serving", 60, 2)).toBeCloseTo(120, 6);
  });

  it("克制：每100克碳水 × 克數 / 100", () => {
    expect(foodCarbs("gram", 26, 150)).toBeCloseTo(39, 6); // 每100g 26g碳水、吃150g
    expect(foodCarbs("gram", 100, 100)).toBeCloseTo(100, 6);
  });

  it("無效輸入回 0", () => {
    expect(foodCarbs("serving", 0, 2)).toBe(0);
    expect(foodCarbs("serving", 38, 0)).toBe(0);
    expect(foodCarbs("gram", NaN, 150)).toBe(0);
  });
});

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
          eaten_at: dayIso(i),
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
          eaten_at: dayIso(i),
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

// ---- 問題2：沒打針（胰島素=0）的乾淨餐 ----

describe("沒打針的純碳水餐", () => {
  it("迴歸法會納入 insulin=0 的乾淨餐", () => {
    const ICR = 7;
    const ISF = 35;
    const a = ISF / ICR;
    const meals: Meal[] = [];
    // 30 筆有打針、可辨識模型的餐。
    for (let i = 0; i < 30; i++) {
      const carbs = 30 + (i % 7) * 10;
      const insulin = carbs / ICR + ((i % 3) - 1) * 2;
      meals.push(
        makeMeal({
          id: `m${i}`,
          eaten_at: dayIso(i),
          total_carbs: carbs,
          insulin_units: insulin,
          glucose_before: 100,
          glucose_after: 100 + a * carbs - ISF * insulin,
        }),
      );
    }
    // 5 筆沒打針的純碳水餐（insulin=0）：Δ = a·碳水。
    for (let i = 0; i < 5; i++) {
      const carbs = 40 + i * 10;
      meals.push(
        makeMeal({
          id: `z${i}`,
          eaten_at: dayIso(30 + i),
          total_carbs: carbs,
          insulin_units: 0,
          glucose_before: 100,
          glucose_after: 100 + a * carbs,
        }),
      );
    }
    const r = estimateIcrIsf(meals, SETTINGS);
    expect(r.method).toBe("regression");
    expect(r.n).toBe(35); // 含 5 筆沒打針的餐
    expect(r.icr).toBeCloseTo(7, 4);
    expect(r.isf).toBeCloseTo(35, 4);
  });

  it("中位數法仍排除 insulin=0 的餐（避免除以零）", () => {
    const center =
      (SETTINGS.target_glucose_low + SETTINGS.target_glucose_high) / 2;
    const meals: Meal[] = [];
    // 5 筆打剛好的餐（insulin>0），隱含 ICR=5。
    for (let i = 0; i < 5; i++) {
      const carbs = 40 + i * 5;
      meals.push(
        makeMeal({
          id: `m${i}`,
          eaten_at: dayIso(i),
          total_carbs: carbs,
          insulin_units: carbs / 5,
          glucose_before: 100,
          glucose_after: center,
        }),
      );
    }
    // 3 筆沒打針的餐：不該進中位數法。
    for (let i = 0; i < 3; i++) {
      meals.push(
        makeMeal({
          id: `z${i}`,
          eaten_at: dayIso(5 + i),
          total_carbs: 50,
          insulin_units: 0,
          glucose_before: 100,
          glucose_after: center,
        }),
      );
    }
    // 用高門檻逼走迴歸 → 走中位數法。
    const r = estimateIcrIsf(meals, SETTINGS, { minMealsForRegression: 100 });
    expect(r.method).toBe("median");
    expect(r.n).toBe(5); // 只算有打針的 5 筆
    expect(r.icr).toBeCloseTo(5, 6);
  });
});

// ---- 階段 5.2：時段啞變數 ----

describe("時段啞變數（5.2）", () => {
  it("不同時段基礎血糖不同時，加啞變數仍能正確回推 ICR/ISF", () => {
    // 真值 ICR=7、ISF=35（a=5）；早餐基線 0、晚餐基線 +40（晚餐整體偏高）。
    const ICR = 7;
    const ISF = 35;
    const a = ISF / ICR;
    const meals: Meal[] = [];
    for (let i = 0; i < 40; i++) {
      const carbs = 30 + (i % 7) * 10;
      const insulin = carbs / ICR + ((i % 3) - 1) * 2; // 與碳水獨立變化
      const isDinner = i >= 20;
      const baseline = isDinner ? 40 : 0;
      meals.push(
        makeMeal({
          id: `m${i}`,
          eaten_at: dayIso(i),
          meal_type: isDinner ? "dinner" : "breakfast",
          total_carbs: carbs,
          insulin_units: insulin,
          glucose_before: 100,
          glucose_after: 100 + baseline + a * carbs - ISF * insulin,
        }),
      );
    }
    const r = estimateIcrIsf(meals, SETTINGS);
    expect(r.method).toBe("regression");
    expect(r.icr).toBeCloseTo(7, 3);
    expect(r.isf).toBeCloseTo(35, 3);
  });
});

// ---- 階段 5.3：獨立乾淨餐（>4 小時間隔）----

describe("wellSpacedMeals（5.3）", () => {
  it("同一天密集進食只留第一餐", () => {
    const base = Date.UTC(2026, 0, 1, 8, 0, 0);
    const meals = [0, 1, 2, 5].map((h, i) =>
      makeMeal({
        id: `m${i}`,
        eaten_at: new Date(base + h * 3_600_000).toISOString(),
      }),
    );
    // 08:00 留、09:00 排除、10:00 排除、13:00 留（距前一餐 3h... 不，距 10:00 為 3h → 排除）
    // 修正：間隔 0/1h/1h/3h → 只有第一餐（08:00）獨立。
    expect(wellSpacedMeals(meals).map((m) => m.id)).toEqual(["m0"]);
  });

  it("間隔都大於 4 小時則全留", () => {
    const meals = [0, 1, 2].map((d) => makeMeal({ id: `d${d}`, eaten_at: dayIso(d) }));
    expect(wellSpacedMeals(meals)).toHaveLength(3);
  });
});

// ---- 階段 D：滾動窗口 ----

describe("recentMeals（D）", () => {
  it("只留最近 N 天的餐", () => {
    const now = new Date(Date.UTC(2026, 0, 31, 8, 0, 0));
    const meals = [
      makeMeal({ id: "old", eaten_at: dayIso(0) }), // 1/1
      makeMeal({ id: "mid", eaten_at: dayIso(20) }), // 1/21
      makeMeal({ id: "new", eaten_at: dayIso(29) }), // 1/30
    ];
    const recent = recentMeals(meals, 15, now).map((m) => m.id);
    expect(recent).toEqual(["mid", "new"]);
  });
});

// ---- 階段 5.1：共線資料不當機 ----

describe("嶺迴歸／共線穩定（5.1）", () => {
  it("完全照碳水÷ICR 打針造成共線時，估算不當機、仍給得出結果", () => {
    const ICR = 5;
    const meals: Meal[] = [];
    for (let i = 0; i < 35; i++) {
      const carbs = 40 + (i % 5) * 10;
      meals.push(
        makeMeal({
          id: `m${i}`,
          eaten_at: dayIso(i),
          total_carbs: carbs,
          insulin_units: carbs / ICR, // 與碳水完全共線
          glucose_before: 100,
          glucose_after: 150, // 餐後偏高（劑量不足）
        }),
      );
    }
    const r = estimateIcrIsf(meals, SETTINGS);
    expect(r.method).not.toBe("insufficient");
    expect(r.icr).not.toBeNull();
    expect(Number.isFinite(r.icr as number)).toBe(true);
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
          eaten_at: dayIso(i),
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
          eaten_at: dayIso(i),
          meal_type: "breakfast",
          total_carbs: 80,
          insulin_units: 10, // 80/10 = 8
          glucose_before: 100,
          glucose_after: center, // 打剛好 → 隱含 ICR=碳水/施打=8
        }),
      );
    }
    // 午餐只有 1 筆 → 不足、不提示。
    const lunch = makeMeal({ id: "l1", eaten_at: dayIso(20), meal_type: "lunch" });

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

// ---- 食物影響（自適應）----

describe("foodImpactAdaptive", () => {
  it("無模型時用單獨吃、每 10g 碳水上升，且需 n≥2", () => {
    const meals = [
      // 白飯單獨吃兩次：碳水 50，上升 +100 與 +50 → 每10g = 20、10，平均 15
      makeMeal({ id: "r1", glucose_before: 100, glucose_after: 200 }),
      makeMeal({ id: "r2", glucose_before: 100, glucose_after: 150 }),
      // 青菜單獨吃一次（n=1 → 不採計）
      makeMeal({ id: "v1", glucose_before: 100, glucose_after: 110 }),
      // 麵+蛋（混合餐 → A 模式不採計）
      makeMeal({ id: "m1", glucose_before: 100, glucose_after: 220 }),
    ];
    const mealFoods = [
      makeMealFood({ meal_id: "r1", food_name: "白飯", carbs: 50 }),
      makeMealFood({ meal_id: "r2", food_name: "白飯", carbs: 50 }),
      makeMealFood({ meal_id: "v1", food_name: "青菜", carbs: 5 }),
      makeMealFood({ meal_id: "m1", food_name: "麵", carbs: 60 }),
      makeMealFood({ meal_id: "m1", food_name: "蛋", carbs: 1 }),
    ];
    const res = foodImpactAdaptive(meals, mealFoods, null);
    expect(res.mode).toBe("solo-normalized");
    expect(res.items).toHaveLength(1); // 只有白飯達 n≥2
    expect(res.items[0].foodName).toBe("白飯");
    expect(res.items[0].value).toBeCloseTo(15, 6);
    expect(res.items[0].n).toBe(2);
  });

  it("有模型時用殘差法（可含混合餐），需 n≥2", () => {
    const model = { a: 5, b: 30, c: 0 };
    // 同一食物「糖」出現在兩餐，殘差皆 +60 → 平均 60。
    const meals = [
      makeMeal({ id: "a", total_carbs: 10, insulin_units: 2, glucose_before: 100, glucose_after: 150 }),
      makeMeal({ id: "b", total_carbs: 10, insulin_units: 2, glucose_before: 100, glucose_after: 150 }),
    ];
    const mealFoods = [
      makeMealFood({ meal_id: "a", food_name: "糖" }),
      makeMealFood({ meal_id: "b", food_name: "糖" }),
    ];
    const res = foodImpactAdaptive(meals, mealFoods, model);
    expect(res.mode).toBe("residual");
    expect(res.items[0].foodName).toBe("糖");
    expect(res.items[0].value).toBeCloseTo(60, 6);
    expect(res.items[0].n).toBe(2);
  });

  it("沒有足夠資料時 mode 為 none", () => {
    const meals = [makeMeal({ id: "x", glucose_before: 100, glucose_after: 150 })];
    const mealFoods = [makeMealFood({ meal_id: "x", food_name: "白飯", carbs: 50 })];
    expect(foodImpactAdaptive(meals, mealFoods, null).mode).toBe("none");
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
