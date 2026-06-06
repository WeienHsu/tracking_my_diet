-- 0001_init：核心資料表與 RLS（對應 PROJECT_PLAN.md §4）。
-- 全部 idempotent，可重複套用。

-- 食物庫：可重複查詢的知識
create table if not exists foods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) default auth.uid(),
  name text not null,
  carbs_per_serving numeric not null,
  serving_desc text,
  note text,
  created_at timestamptz default now()
);

-- 餐食記錄：當下的決策與結果
create table if not exists meals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) default auth.uid(),
  eaten_at timestamptz not null,
  meal_type text not null,
  glucose_before integer,
  total_carbs numeric not null,
  insulin_units numeric not null,
  glucose_after integer,
  note text,
  created_at timestamptz default now()
);

-- 餐食 ↔ 食物 關聯（一餐可含多項食物）
create table if not exists meal_foods (
  id uuid primary key default gen_random_uuid(),
  meal_id uuid not null references meals(id) on delete cascade,
  food_id uuid references foods(id),
  food_name text not null,
  carbs numeric not null,
  quantity numeric default 1
);

-- 使用者設定（ICR、目標血糖範圍）
create table if not exists settings (
  user_id uuid primary key references auth.users(id) default auth.uid(),
  icr numeric default 5,
  target_glucose_low integer default 80,
  target_glucose_high integer default 180,
  updated_at timestamptz default now()
);

-- RLS：每張表都要。drop+create 確保可重複套用。
alter table foods enable row level security;
drop policy if exists "own_foods" on foods;
create policy "own_foods" on foods
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter table meals enable row level security;
drop policy if exists "own_meals" on meals;
create policy "own_meals" on meals
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter table settings enable row level security;
drop policy if exists "own_settings" on settings;
create policy "own_settings" on settings
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- meal_foods 透過 meal_id 連動 meals 的 user_id 檢查。
alter table meal_foods enable row level security;
drop policy if exists "own_meal_foods" on meal_foods;
create policy "own_meal_foods" on meal_foods
  for all
  using (exists (select 1 from meals m where m.id = meal_foods.meal_id and m.user_id = auth.uid()))
  with check (exists (select 1 from meals m where m.id = meal_foods.meal_id and m.user_id = auth.uid()));
