-- 0008_meal_foods_fk_set_null：食物庫管理頁（3.3）要能刪除食物。
-- meal_foods.food_id 原本參照 foods(id) 無 on delete 規則 → 刪除被引用的食物會被外鍵擋下。
-- 改為 on delete set null：刪食物時把明細的 food_id 設為 null，歷史仍靠冗餘的
-- food_brand / food_name 保留，不影響既有統計。

alter table meal_foods drop constraint if exists meal_foods_food_id_fkey;
alter table meal_foods
  add constraint meal_foods_food_id_fkey
  foreign key (food_id) references foods(id) on delete set null;
