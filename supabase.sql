-- ============================================================
-- EVALUATIETOOL
-- SUPABASE DATABASE
-- ============================================================


create extension if not exists "pgcrypto";


-- ============================================================
-- ASSIGNMENTS
-- ============================================================

create table if not exists public.assignments (

    id text primary key,

    title text not null,

    comments jsonb not null default '[]'::jsonb,

    parameters jsonb not null default '[]'::jsonb,

    created_at timestamptz not null default now(),

    updated_at timestamptz not null default now()

);


-- ============================================================
-- CLASSES
-- ============================================================

create table if not exists public.classes (

    id text primary key,

    name text not null,

    created_at timestamptz not null default now(),

    updated_at timestamptz not null default now()

);


-- ============================================================
-- STUDENTS
-- ============================================================

create table if not exists public.students (

    id text primary key,

    name text not null,

    class_id text not null
        references public.classes(id)
        on delete cascade,

    created_at timestamptz not null default now(),

    updated_at timestamptz not null default now()

);


-- ============================================================
-- EVALUATIONS
-- ============================================================

create table if not exists public.evaluations (

    id text primary key,

    assignment_id text not null
        references public.assignments(id)
        on delete cascade,

    student_id text not null
        references public.students(id)
        on delete cascade,

    class_id text not null
        references public.classes(id)
        on delete cascade,

    scores jsonb not null default '{}'::jsonb,

    comments jsonb not null default '[]'::jsonb,

    feedback text not null default '',

    duration_seconds integer not null default 0,

    attempt_number integer not null default 1,

    evaluation_date timestamptz not null default now(),

    created_at timestamptz not null default now(),

    updated_at timestamptz not null default now()

);


-- ============================================================
-- INDEXEN
-- ============================================================

create index if not exists evaluations_student_idx
on public.evaluations(student_id);

create index if not exists evaluations_assignment_idx
on public.evaluations(assignment_id);

create index if not exists evaluations_class_idx
on public.evaluations(class_id);

create index if not exists students_class_idx
on public.students(class_id);


-- ============================================================
-- RLS
-- ============================================================

alter table public.assignments enable row level security;
alter table public.classes enable row level security;
alter table public.students enable row level security;
alter table public.evaluations enable row level security;


-- Voor de eerste testversie mag de anon-gebruiker lezen/schrijven.
-- Zie de uitleg hieronder over beveiliging/authenticatie.

create policy "assignments_all"
on public.assignments
for all
to anon, authenticated
using (true)
with check (true);


create policy "classes_all"
on public.classes
for all
to anon, authenticated
using (true)
with check (true);


create policy "students_all"
on public.students
for all
to anon, authenticated
using (true)
with check (true);


create policy "evaluations_all"
on public.evaluations
for all
to anon, authenticated
using (true)
with check (true);
