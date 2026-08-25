-- Per-user math mistake notebook. PK is (user_id, id) so sample ids can repeat across accounts.
create table if not exists problems (
  user_id         text not null,
  id              text not null,
  created_at      bigint not null,
  updated_at      bigint not null,
  source_kind     text not null,
  source_image    text,
  title           text not null,
  stem            text not null,
  figures_json    text not null default '[]',
  subject         text not null,
  tags_json       text not null default '[]',
  difficulty      smallint not null default 3,
  my_answer       text not null default '',
  correct_answer  text not null default '',
  analysis        text not null default '',
  notes           text not null default '',
  error_reason    text not null default 'unknown',
  mastery         text not null default 'new',
  review_count    integer not null default 0,
  next_review_at  bigint not null,
  primary key (user_id, id)
);

create index if not exists problems_user_updated_idx
  on problems (user_id, updated_at desc);

create table if not exists notebook_meta (
  user_id         text primary key,
  initialized_at  bigint not null
);
