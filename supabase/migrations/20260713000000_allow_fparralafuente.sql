-- Allowlist: additional account (US-1)
insert into allowed_emails (email, note) values
  ('fparralafuente@gmail.com', 'additional allowed account')
on conflict (email) do nothing;
