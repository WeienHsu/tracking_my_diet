-- 0013_glucose_after_at：記錄「餐後血糖的量測時間」（方案 B′），並讓迴歸只採用接近標準窗的讀數。
-- 問題：餐後血糖欄意圖是「餐後約 2 小時」，但只存數字、不存量測時間；補太晚的讀數會被當成 2h 值，
--   汙染 ICR/ISF 迴歸（碳水餐晚量通常已回落 → 低估升糖、推高 ICR）。ADA 標準為「用餐開始後 1–2h」。
-- 解法：
--   meals.glucose_after_at：餐後讀數的實際量測時間（補填時預設帶當下、可改）。
--   settings.postmeal_window_lo_min / hi_min：有效量測窗（分鐘），預設 90–180（1.5–3h），可在設定調整。
-- 皆選填／有預設，舊資料（無 glucose_after_at）視為照舊納入，不破壞既有統計與 RLS。

alter table meals
  add column if not exists glucose_after_at timestamptz;

alter table settings
  add column if not exists postmeal_window_lo_min integer default 90,
  add column if not exists postmeal_window_hi_min integer default 180;

-- 更新原子寫入 RPC（0007），多寫入 glucose_after_at。
create or replace function create_meal_with_foods(p_meal jsonb, p_foods jsonb)
returns uuid
language plpgsql
as $$
declare
  v_meal_id uuid;
  v_food jsonb;
begin
  insert into meals (
    eaten_at, meal_type, glucose_before, total_carbs,
    insulin_units, glucose_after, glucose_after_at, exercise, context, note
  )
  values (
    (p_meal->>'eaten_at')::timestamptz,
    p_meal->>'meal_type',
    nullif(p_meal->>'glucose_before', '')::integer,
    (p_meal->>'total_carbs')::numeric,
    (p_meal->>'insulin_units')::numeric,
    nullif(p_meal->>'glucose_after', '')::integer,
    nullif(p_meal->>'glucose_after_at', '')::timestamptz,
    coalesce(p_meal->>'exercise', 'none'),
    coalesce(
      (select array_agg(value) from jsonb_array_elements_text(p_meal->'context')),
      '{}'
    ),
    p_meal->>'note'
  )
  returning id into v_meal_id;

  if p_foods is not null and jsonb_typeof(p_foods) = 'array' then
    for v_food in select * from jsonb_array_elements(p_foods)
    loop
      insert into meal_foods (
        meal_id, food_id, food_brand, food_name, carbs, unit, amount
      )
      values (
        v_meal_id,
        nullif(v_food->>'food_id', '')::uuid,
        v_food->>'food_brand',
        v_food->>'food_name',
        (v_food->>'carbs')::numeric,
        coalesce(v_food->>'unit', 'serving'),
        nullif(v_food->>'amount', '')::numeric
      );
    end loop;
  end if;

  return v_meal_id;
end;
$$;
