create table public.funnel_events (
  id uuid primary key default gen_random_uuid(),
  event text not null,
  session_id text,
  user_id uuid,
  meta jsonb,
  created_at timestamptz not null default now()
);

grant insert on public.funnel_events to anon, authenticated;
grant select on public.funnel_events to authenticated;
grant all on public.funnel_events to service_role;

alter table public.funnel_events enable row level security;

create policy "anyone can insert funnel events"
  on public.funnel_events for insert
  to anon, authenticated
  with check (true);

create policy "admins can read funnel events"
  on public.funnel_events for select
  to authenticated
  using (public.has_role(auth.uid(), 'admin'));

create index funnel_events_event_created_idx on public.funnel_events (event, created_at desc);
create index funnel_events_session_idx on public.funnel_events (session_id);