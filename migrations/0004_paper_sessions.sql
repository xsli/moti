create table if not exists paper_sessions (
  user_id    text primary key,
  payload    text not null,
  updated_at bigint not null
);
