-- 0011_settings_iob：活性胰島素（IOB）改用指數曲線 + 依胰島素設定參數（模組四 4.1 強化）。
-- insulin_dia_min：作用總時間（分鐘）。insulin_peak_min：作用高峰時間（分鐘）。
--   指數 IOB 曲線（Loop / OpenAPS 的標準做法）由這兩個參數決定，依使用的胰島素填。
-- iob_auto_subtract：是否把 IOB 自動從建議劑量扣除（預設關，僅顯示疊藥提醒）。
-- 皆有預設值，不影響既有資料與 RLS。預設為速效類似物（peak 75、DIA 300=5h）。

alter table settings
  add column if not exists insulin_dia_min   integer default 300,
  add column if not exists insulin_peak_min  integer default 75,
  add column if not exists iob_auto_subtract boolean default false;
