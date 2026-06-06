-- 0005_meal_context：餐次加「運動 / 狀態」情境欄位（劑量分析改進報告 階段 0）。
-- 用途：算 ICR/ISF 時可排除「不正常的餐」（clean-meal 過濾），讓估算更準。
-- 皆選填、有預設值，不影響既有資料與 RLS。

alter table meals
  add column if not exists exercise text   default 'none', -- none | light | intense
  add column if not exists context  text[] default '{}';   -- 例：{'illness','stress','alcohol'}
