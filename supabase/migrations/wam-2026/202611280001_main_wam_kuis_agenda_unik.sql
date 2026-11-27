-- LOCAL REVIEW ONLY. Apply to a remote database only with separate authorization.
-- Main WAM, Kuis live: one agenda item holds at most one quiz. The app already unties any other quiz first
-- (setQuizAgenda); this index makes the database refuse two quizzes on one item when two admins save at the
-- same moment (the app then answers 409 "coba lagi"). Needs 202611270001 (mw_quizzes.session_id).
-- If two quizzes already share one item, clear one first: update public.mw_quizzes set session_id = null where id = '<id>';
-- ROLLBACK (by hand): drop index mw_quizzes_session_unik;
begin;

create unique index if not exists mw_quizzes_session_unik on public.mw_quizzes (session_id) where session_id is not null;

commit;
