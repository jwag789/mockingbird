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

-- Voice answers only: how long the candidate spoke, from the speech-to-text
-- word timings. Kept beside turns so text and voice share one transcript.
create table if not exists answer_audio (
  session_id uuid not null,
  seq        int  not null,
  talk_ms    int  not null check (talk_ms >= 0),
  primary key (session_id, seq),
  foreign key (session_id, seq) references turns (session_id, seq) on delete cascade
);

-- Live scoring progress the worker writes as it goes, so the scorecard page
-- can show each answer being scored. Null until the worker picks the job up.
alter table sessions add column if not exists progress jsonb;

-- Accounts. Better Auth owns the "user", "session", "account" and
-- "verification" tables (created by `npm run db:migrate`). Interviews from
-- before accounts existed have no owner and aren't shown to anyone.
alter table sessions add column if not exists user_id text references "user" (id) on delete cascade;
create index if not exists sessions_user_idx on sessions (user_id, created_at desc);

-- Practice resources: vetted videos and articles, tagged by skill. The coach
-- may only assign resources from this table, so it never makes up links.
create table if not exists resources (
  id           bigserial primary key,
  kind         text not null check (kind in ('video', 'article')),
  skill        text not null,
  title        text not null,
  url          text not null unique,
  source       text not null,
  summary      text not null,
  published_at timestamptz,
  duration_s   int,
  stats        jsonb not null default '{}',
  quality      real  not null default 0,
  helpful      int   not null default 0,
  unhelpful    int   not null default 0,
  status       text  not null default 'active' check (status in ('active', 'retired')),
  checked_at   timestamptz not null default now(),
  created_at   timestamptz not null default now()
);

create index if not exists resources_skill_idx on resources (skill, status, quality desc);

-- One practice plan per scored interview.
create table if not exists practice_plans (
  session_id uuid primary key references sessions (id) on delete cascade,
  user_id    text not null references "user" (id) on delete cascade,
  status     text not null default 'building' check (status in ('building', 'ready', 'failed')),
  focus      text,
  created_at timestamptz not null default now()
);

create table if not exists practice_tasks (
  id           bigserial primary key,
  session_id   uuid not null references practice_plans (session_id) on delete cascade,
  user_id      text not null references "user" (id) on delete cascade,
  position     int  not null,
  kind         text not null check (kind in ('watch', 'read', 'drill', 'challenge')),
  skill        text not null,
  title        text not null,
  why          text not null,
  -- The scorecard evidence behind the task: question, dimension, score, quote.
  evidence     jsonb,
  resource_id  bigint references resources (id) on delete set null,
  -- Drills and challenges: what to answer, what it's scored on, and the
  -- score it's trying to beat.
  prompt       text,
  dimension    text,
  baseline     real,
  status       text not null default 'todo' check (status in ('todo', 'done')),
  rating       smallint check (rating in (-1, 1)),
  completed_at timestamptz,
  created_at   timestamptz not null default now()
);

create index if not exists practice_tasks_user_idx on practice_tasks (user_id, status, created_at desc);

create table if not exists practice_attempts (
  id         bigserial primary key,
  task_id    bigint not null references practice_tasks (id) on delete cascade,
  user_id    text   not null references "user" (id) on delete cascade,
  answer     text   not null,
  score      real   not null,
  feedback   jsonb  not null,
  created_at timestamptz not null default now()
);

-- The real interview the user is preparing for. The dashboard counts down to
-- it and paces the open practice tasks across the days left.
create table if not exists upcoming_interviews (
  user_id      text primary key references "user" (id) on delete cascade,
  company      text not null,
  role_title   text not null,
  interview_on date not null,
  updated_at   timestamptz not null default now()
);
