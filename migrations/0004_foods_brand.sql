-- 0004_foods_brand：食物欄位拆「品牌 + 食物名」（看板 #2）。
-- brand 為選填；既有 note 欄保留。meal_foods 冗餘存品牌，食物被刪也保留歷史。

alter table foods add column if not exists brand text;
alter table meal_foods add column if not exists food_brand text;
