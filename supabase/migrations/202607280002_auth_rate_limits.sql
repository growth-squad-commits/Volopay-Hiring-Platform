create table if not exists public.auth_rate_limits (
  scope text not null,
  identifier_hash text not null,
  window_started_at timestamptz not null,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  updated_at timestamptz not null default now(),
  primary key (scope, identifier_hash)
);

alter table public.auth_rate_limits enable row level security;
revoke all on public.auth_rate_limits from anon, authenticated;

create or replace function public.consume_auth_rate_limit(
  p_scope text,
  p_identifier_hash text,
  p_limit integer,
  p_window_seconds integer
)
returns table(allowed boolean, retry_after_seconds integer, remaining integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_row public.auth_rate_limits;
  v_elapsed numeric;
begin
  if length(trim(p_scope)) = 0 or length(trim(p_identifier_hash)) < 16 then
    raise exception 'Invalid rate-limit key';
  end if;
  if p_limit < 1 or p_window_seconds < 1 then
    raise exception 'Invalid rate-limit configuration';
  end if;

  insert into public.auth_rate_limits(scope, identifier_hash, window_started_at, attempt_count, updated_at)
  values (p_scope, p_identifier_hash, v_now, 1, v_now)
  on conflict (scope, identifier_hash) do update
  set
    window_started_at = case
      when auth_rate_limits.window_started_at + make_interval(secs => p_window_seconds) <= v_now then v_now
      else auth_rate_limits.window_started_at
    end,
    attempt_count = case
      when auth_rate_limits.window_started_at + make_interval(secs => p_window_seconds) <= v_now then 1
      else auth_rate_limits.attempt_count + 1
    end,
    updated_at = v_now
  returning * into v_row;

  v_elapsed := extract(epoch from (v_now - v_row.window_started_at));
  allowed := v_row.attempt_count <= p_limit;
  retry_after_seconds := case when allowed then 0 else greatest(1, ceil(p_window_seconds - v_elapsed)::integer) end;
  remaining := greatest(0, p_limit - v_row.attempt_count);
  return next;
end;
$$;

revoke all on function public.consume_auth_rate_limit(text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_auth_rate_limit(text, text, integer, integer) to service_role;

create index if not exists auth_rate_limits_updated_at_idx on public.auth_rate_limits(updated_at);
