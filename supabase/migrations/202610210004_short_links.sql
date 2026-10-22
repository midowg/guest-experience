-- LOCAL REVIEW ONLY. Apply to a remote database only with separate authorization.
-- Short addresses: every event gets a 6-character code (invitation.werkudara.group/AB12CD) and
-- every personal invitation an 8-character short token (/AB12CD/k7q2mx9p). The long slug and the
-- 64-hex token stay as they are, so old links, the RPCs and the guest APIs keep working; the app
-- looks up the long values from the short ones.
begin;

-- Random characters from `p_alphabet`, drawn from gen_random_uuid() (cryptographically strong).
-- Version and variant bytes are skipped and out-of-range bytes rejected, so no character is
-- more likely than another.
create or replace function public.random_text(p_length integer, p_alphabet text)
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  pool bytea := '';
  result text := '';
  size integer := length(p_alphabet);
  limit_value integer := 256 - (256 % length(p_alphabet));
  i integer := 0;
  b integer;
begin
  while length(result) < p_length loop
    if i >= length(pool) then pool := uuid_send(gen_random_uuid()); i := 0; end if;
    if i in (6, 8) then i := i + 1; continue; end if;
    b := get_byte(pool, i);
    i := i + 1;
    if b < limit_value then result := result || substr(p_alphabet, b % size + 1, 1); end if;
  end loop;
  return result;
end;
$$;
revoke all on function public.random_text(integer, text) from public, anon, authenticated;
grant execute on function public.random_text(integer, text) to service_role;

-- Event codes: no I, L or O, so a code read aloud or from print is not mistyped.
alter table public.events add column code text;
do $$
declare
  row_id uuid;
  candidate text;
begin
  for row_id in select id from public.events where code is null loop
    loop
      candidate := public.random_text(6, 'ABCDEFGHJKMNPQRSTUVWXYZ23456789');
      exit when not exists (select 1 from public.events where code = candidate);
    end loop;
    update public.events set code = candidate where id = row_id;
  end loop;
end $$;
alter table public.events alter column code set not null;
alter table public.events add constraint events_code_key unique (code);
alter table public.events add constraint events_code_format check (code ~ '^[A-HJKMNP-Z2-9]{6}$');

create or replace function public.events_fill_code()
returns trigger
language plpgsql
set search_path = ''
as $$
declare candidate text;
begin
  if new.code is null then
    loop
      candidate := public.random_text(6, 'ABCDEFGHJKMNPQRSTUVWXYZ23456789');
      exit when not exists (select 1 from public.events where code = candidate);
    end loop;
    new.code := candidate;
  end if;
  return new;
end;
$$;
create trigger events_fill_code before insert on public.events for each row execute function public.events_fill_code();

-- Personal short tokens: lowercase without i, l or o (≈ 39 bits). A rotated token gets a new
-- short token too, so the old short link stops working with the old long one.
alter table public.event_invitations add column short_token text;
do $$
declare
  row_id uuid;
  candidate text;
begin
  for row_id in select id from public.event_invitations where short_token is null loop
    loop
      candidate := public.random_text(8, 'abcdefghjkmnpqrstuvwxyz23456789');
      exit when not exists (select 1 from public.event_invitations where short_token = candidate);
    end loop;
    update public.event_invitations set short_token = candidate where id = row_id;
  end loop;
end $$;
alter table public.event_invitations alter column short_token set not null;
alter table public.event_invitations add constraint event_invitations_short_token_key unique (short_token);
alter table public.event_invitations add constraint event_invitations_short_token_format check (short_token ~ '^[a-hjkmnp-z2-9]{8}$');

create or replace function public.invitations_fill_short_token()
returns trigger
language plpgsql
set search_path = ''
as $$
declare candidate text;
begin
  if tg_op = 'INSERT' and new.short_token is not null then return new; end if;
  if tg_op = 'UPDATE' and new.token is not distinct from old.token then return new; end if;
  loop
    candidate := public.random_text(8, 'abcdefghjkmnpqrstuvwxyz23456789');
    exit when not exists (select 1 from public.event_invitations where short_token = candidate);
  end loop;
  new.short_token := candidate;
  return new;
end;
$$;
create trigger invitations_fill_short_token before insert or update of token on public.event_invitations
for each row execute function public.invitations_fill_short_token();

-- The event document carries its code; the column wins over anything stored in content.
create or replace view public.event_documents with (security_invoker = true) as
select e.id,e.slug,e.status,e.updated_at,
  e.content || jsonb_build_object('id',e.id,'slug',e.slug,'code',e.code,'status',e.status,'created_at',e.created_at,'updated_at',e.updated_at,
    'agenda',coalesce((select jsonb_agg(to_jsonb(a)-'event_id' order by a.sort_order,a.id) from public.event_agenda_items a where a.event_id=e.id),'[]'::jsonb),
    'feedback_questions',coalesce((select jsonb_agg(to_jsonb(q)-'event_id' order by q.sort_order,q.id) from public.feedback_questions q where q.event_id=e.id),'[]'::jsonb)) as document,
  e.code
from public.events e;
grant select on public.event_documents to anon,authenticated,service_role;

commit;
