-- Null means historical attempt counts are unknown. Do not infer from mastery/review_count.
alter table problems add column if not exists practice_history_json text;
