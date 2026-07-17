-- Allowlist: Javi's real accounts (US-1, M10 ship gate).
-- She uses both Google accounts, so both are allowlisted.
insert into allowed_emails (email, note) values
  ('javivita.parra@gmail.com', 'Javi (primary)'),
  ('javinunn.n@gmail.com', 'Javi (secondary)')
on conflict (email) do nothing;
