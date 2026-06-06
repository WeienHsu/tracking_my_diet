-- 0003_a1c：A1C（糖化血色素）紀錄表與 RLS（對應改進計劃階段 D）。

create table if not exists a1c_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) default auth.uid(),
  measured_at date not null,
  value numeric not null,            -- A1C %
  note text,
  created_at timestamptz default now()
);

alter table a1c_records enable row level security;
drop policy if exists "own_a1c" on a1c_records;
create policy "own_a1c" on a1c_records
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
