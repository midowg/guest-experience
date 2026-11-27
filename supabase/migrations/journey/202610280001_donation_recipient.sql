-- Friday Sharing: which recipient each received donation goes to (src/lib/donations.ts,
-- splitByRecipient). Set on the admin page Donasi → Pembagian; empty means not shared out yet.
-- The id is a recipient's id in the event's donation settings (events.content), not a foreign key.
alter table public.donations
  add column if not exists recipient_id text not null default ''
  check (char_length(recipient_id) <= 40);
