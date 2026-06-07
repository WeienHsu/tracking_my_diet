-- 0010_settings_dose：進階建議劑量所需設定（模組一 1.1 + 模組四 4.1）。
-- isf：胰島素敏感因子（每 1 單位約降多少 mg/dL），算校正劑量用。
-- correction_target：校正目標血糖（餐前偏離此值才校正）。
-- advanced_dose：進階建議劑量開關，預設關（關閉時建議仍只用「碳水 ÷ ICR」）。
-- 皆選填／有預設，不影響既有資料與 RLS。

alter table settings
  add column if not exists isf               numeric,
  add column if not exists correction_target integer,
  add column if not exists advanced_dose     boolean default false;
