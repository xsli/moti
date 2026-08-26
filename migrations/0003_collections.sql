create table if not exists collections (
  user_id    text not null,
  id         text not null,
  name       text not null,
  kind       text not null default 'custom',
  created_at bigint not null,
  updated_at bigint not null,
  primary key (user_id, id)
);

create index if not exists collections_user_updated_idx
  on collections (user_id, updated_at desc);

alter table problems add column if not exists collection_id text;

create index if not exists problems_user_collection_idx
  on problems (user_id, collection_id);
