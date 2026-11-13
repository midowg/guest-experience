-- LOCAL REVIEW ONLY: the owner applies this in the Supabase SQL Editor, after 202611130010.
--
-- Kartu tokoh: a third person per figure (13 Nov 2026, the owner's choice). Two people a figure
-- first; once every figure has two, a figure may have a third, so more than 96 people still get a
-- card (48 figures × 3 = 144). The place stays unique (cq_person_cards_figure_place), so the
-- database still refuses a fourth. Before this runs the app keeps to two places and the 97th
-- person gets "Semua tokoh sudah dipakai".
--
-- ROLLBACK (by hand, only while nobody has place 3):
--   alter table public.cq_person_cards drop constraint if exists cq_person_cards_figure_slot_check;
--   alter table public.cq_person_cards add constraint cq_person_cards_figure_slot_check check (figure_slot is null or figure_slot between 1 and 2);
begin;

alter table public.cq_person_cards drop constraint if exists cq_person_cards_figure_slot_check;
alter table public.cq_person_cards add constraint cq_person_cards_figure_slot_check check (figure_slot is null or figure_slot between 1 and 3);

commit;
