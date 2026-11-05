create table if not exists study_plans (
  user_id text not null,
  id text not null,
  revision integer not null,
  payload text not null,
  created_at bigint not null,
  updated_at bigint not null,
  primary key (user_id, id)
);
create table if not exists study_plan_versions (
  user_id text not null,
  plan_id text not null,
  revision integer not null,
  payload text not null,
  saved_at bigint not null,
  primary key (user_id, plan_id, revision)
);
