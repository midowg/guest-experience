-- LOCAL REVIEW ONLY. Apply to a remote database only with separate authorization.
-- Main WAM, Kuis live (docs/rancangan-kuis-wam.md): a quiz can be tied to the agenda item "Kuis live", so its
-- Detail sesi shows "Ikut kuis" while the game is on. One nullable column; the app reads it with a fallback
-- (without it nothing is tied and Admin WAM says "menunggu migrasi"). Needs 202611200001 and 202611200601.
-- ROLLBACK (by hand): drop index mw_quizzes_session; alter table public.mw_quizzes drop column session_id;
begin;

alter table public.mw_quizzes
  add column session_id uuid references public.mw_sessions (id) on delete set null;
create index mw_quizzes_session on public.mw_quizzes (session_id) where session_id is not null;

commit;
