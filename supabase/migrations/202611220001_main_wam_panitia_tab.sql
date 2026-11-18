-- LOCAL REVIEW ONLY. Apply to a remote database only with separate authorization.
-- Main WAM, Panitia tab (docs/main-wam/KONTRAK.md §3): Silent Meeting is Pra WAM's, not Main WAM's, so its
-- module is off by default. Runs once on a database that already has 202611200001 (and 0501, 210001), and just
-- as well in the full order on an empty one (then there is nothing to change). Safe to run again.
--   1. mw_settings.modules: {"silent": true} becomes {"silent": false}. Nothing else in the row changes, and
--      no table, function or row of Silent Meeting is touched (an admin can switch the module on again in
--      Admin WAM → Main WAM → Pengaturan; its questions and feedback stay as they were).
-- ROLLBACK (by hand): update public.mw_settings set modules = jsonb_set(modules, '{silent}', 'true'::jsonb);
begin;

update public.mw_settings
set modules = jsonb_set(modules, '{silent}', 'false'::jsonb)
where jsonb_typeof(modules) = 'object' and modules -> 'silent' = 'true'::jsonb;

commit;
