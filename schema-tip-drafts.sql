-- Drafts are kept apart from tip_settlements so the deployed legacy client
-- cannot mistake an unfinished draft for a completed calculation.
create table if not exists public.tip_drafts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.tip_workspaces(id) on delete cascade,
  label text,
  period_start date,
  period_end date,
  input_snapshot jsonb not null,
  saved_at timestamptz not null default now(),
  revision bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tip_drafts_period_check check (period_start is null or period_end is null or period_start <= period_end)
);
create index if not exists tip_drafts_workspace_saved_idx on public.tip_drafts(workspace_id, saved_at desc);
alter table public.tip_drafts enable row level security;
create policy tip_drafts_member_all on public.tip_drafts for all to authenticated
  using (private.tip_is_workspace_member(workspace_id))
  with check (private.tip_is_workspace_member(workspace_id));
create trigger tip_drafts_touch before update on public.tip_drafts
  for each row execute function public.tip_touch_revision();
grant select, insert, update, delete on public.tip_drafts to authenticated;
alter publication supabase_realtime add table public.tip_drafts;
