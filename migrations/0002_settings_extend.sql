-- 0002_settings_extend：settings 加餐別時段邊界與外觀主題（對應改進計劃階段 B）。

alter table settings
  add column if not exists breakfast_end_hour integer default 11,
  add column if not exists lunch_end_hour     integer default 16,
  add column if not exists dinner_end_hour    integer default 21,
  add column if not exists theme              text    default 'system'; -- system | light | dark
