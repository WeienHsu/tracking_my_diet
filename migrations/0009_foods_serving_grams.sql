-- 0009_foods_serving_grams：食物加「每份克重」(3.2)。
-- 有了「一份 = 幾克」，就能在「每份碳水」與「每100克碳水」之間互相換算、自動補齊缺的那個。
-- 選填、可空，不影響既有資料與 RLS。

alter table foods add column if not exists serving_grams numeric;
