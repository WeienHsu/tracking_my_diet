-- 0006_food_amount：問題1 — 食物改成「真營養標示 + 實際吃多少」（份 / 每100克 兩種）。
-- foods：克制食物只填「每100克碳水」即可，故 carbs_per_serving 放寬為可空，並加 carbs_per_100g。
-- meal_foods：記下計量方式（unit）與吃的量（amount）；carbs 改存「該食物總碳水」。
-- 既有資料一次轉換：carbs 原為「每份碳水」、total=carbs*quantity，轉成 carbs=總碳水、amount=份數。
-- 皆選填或有預設、可重複套用，不影響 RLS。

alter table foods alter column carbs_per_serving drop not null;
alter table foods add column if not exists carbs_per_100g numeric;

alter table meal_foods
  add column if not exists unit   text    default 'serving', -- serving | gram
  add column if not exists amount numeric;

-- 既有資料轉換（amount 為 null 才轉，確保只跑一次、可重複套用）。
update meal_foods
   set amount = coalesce(quantity, 1),
       carbs  = carbs * coalesce(quantity, 1),
       unit   = 'serving'
 where amount is null;
