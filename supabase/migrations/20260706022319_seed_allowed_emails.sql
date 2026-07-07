-- Allowlist seed (US-1)
insert into allowed_emails (email, note) values
  ('bolguinpozo@gmail.com', 'test account (owner)')
on conflict (email) do nothing;
