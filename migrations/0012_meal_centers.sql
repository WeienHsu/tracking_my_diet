-- 0012_meal_centers：餐別判定改「三餐中心點 ±1.5 小時」模型（看板：優化早午晚點心自動判定區間）。
-- 舊的 breakfast_end_hour/lunch_end_hour/dinner_end_hour（邊界連續切分）改不再使用，但保留欄位不刪。
-- 新增三餐中心時間（分鐘 of day）與半徑：落在任一中心 ±window 內歸該餐、否則算點心。
-- 預設：早 08:00、午 12:30、晚 18:30、±90 分（1.5 小時）。皆有預設，不影響既有資料與 RLS。

alter table settings
  add column if not exists breakfast_center_min integer default 480,
  add column if not exists lunch_center_min     integer default 750,
  add column if not exists dinner_center_min    integer default 1110,
  add column if not exists meal_window_min      integer default 90;
