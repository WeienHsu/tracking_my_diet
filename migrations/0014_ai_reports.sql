-- 0014_ai_reports：AI 月報快取表，防止重複點擊刷爆 Gemini 額度。
-- 機制：同一使用者 + 同一期間（from/to）唯一一列；content_hash 為「送進 Gemini 的統計資料」雜湊。
--   呼叫 /api/report 時先組統計、算 hash，若快取的 hash 相同就直接回傳，不打 Gemini；
--   資料或設定有變動（hash 改變）才重新生成並覆寫該列。
-- period_from / period_to 允許為空（代表「全部」），用空字串正規化以維持唯一鍵穩定。

create table if not exists ai_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) default auth.uid(),
  period_from text not null default '',
  period_to text not null default '',
  content_hash text not null,
  report text not null,
  stats jsonb,
  created_at timestamptz default now(),
  unique (user_id, period_from, period_to)
);

alter table ai_reports enable row level security;
drop policy if exists "own_ai_reports" on ai_reports;
create policy "own_ai_reports" on ai_reports
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
