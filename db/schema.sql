-- Idempotent: safe to run on every `npm run db:migrate`.

create table if not exists sessions (
  id              uuid primary key default gen_random_uuid(),
  created_at      timestamptz not null default now(),
  status          text not null default 'active'
                  check (status in ('active', 'ended', 'scoring', 'scored', 'failed')),
  role_title      text not null,
  job_description text not null,
  target_minutes  int  not null default 20,
  plan            jsonb not null,
  state           jsonb not null,
  ended_at        timestamptz
);

create index if not exists sessions_created_at_idx on sessions (created_at desc);

create table if not exists turns (
  id          bigserial primary key,
  session_id  uuid not null references sessions (id) on delete cascade,
  seq         int  not null,
  speaker     text not null check (speaker in ('interviewer', 'candidate')),
  -- The planned question this turn belongs to, so scoring can group a
  -- question with its follow-ups and answers.
  question_id text,
  kind        text not null
              check (kind in ('question', 'follow_up', 'clarification', 'answer', 'closing')),
  content     text not null,
  created_at  timestamptz not null default now(),
  unique (session_id, seq)
);

create table if not exists reports (
  session_id uuid primary key references sessions (id) on delete cascade,
  created_at timestamptz not null default now(),
  model      text  not null,
  summary    jsonb not null,
  questions  jsonb not null,
  metrics    jsonb not null
);

-- A small Postgres-backed job queue. Workers claim jobs with
-- FOR UPDATE SKIP LOCKED, so any number of them can run side by side.
create table if not exists jobs (
  id           bigserial primary key,
  type         text  not null,
  payload      jsonb not null,
  status       text  not null default 'queued'
               check (status in ('queued', 'running', 'done', 'failed')),
  attempts     int   not null default 0,
  max_attempts int   not null default 3,
  run_at       timestamptz not null default now(),
  locked_at    timestamptz,
  last_error   text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists jobs_queued_idx on jobs (run_at, id) where status = 'queued';
