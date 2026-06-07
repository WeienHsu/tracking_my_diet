-- 0007_create_meal_rpc：一餐與其食物明細的原子寫入（模組六 6.1）。
-- 問題：原本「先 insert meals、再 insert meal_foods」是兩段，第二段失敗會留下孤兒 meal。
-- 解法：包成單一 plpgsql function；function 在同一交易內執行，任一步失敗整筆 rollback。
-- security invoker（預設）→ 仍受 RLS 約束；user_id 由 meals 的 default auth.uid() 填入。

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
    insulin_units, glucose_after, exercise, context, note
  )
  values (
    (p_meal->>'eaten_at')::timestamptz,
    p_meal->>'meal_type',
    nullif(p_meal->>'glucose_before', '')::integer,
    (p_meal->>'total_carbs')::numeric,
    (p_meal->>'insulin_units')::numeric,
    nullif(p_meal->>'glucose_after', '')::integer,
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
