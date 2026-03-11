-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Users table (extends Supabase auth.users)
create table public.users (
  id uuid references auth.users(id) on delete cascade primary key,
  stripe_customer_id text,
  stripe_subscription_id text,
  subscription_status text default 'inactive' check (subscription_status in ('active', 'canceled', 'trialing', 'past_due', 'inactive')),
  examples_generated_this_month integer default 0,
  billing_period_start timestamptz default now(),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Projects table
create table public.projects (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.users(id) on delete cascade not null,
  name text not null,
  domain_description text not null,
  schema_definition jsonb not null default '{}',
  schema_raw_input text,
  axes_extracted boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Seed examples table
create table public.seed_examples (
  id uuid default uuid_generate_v4() primary key,
  project_id uuid references public.projects(id) on delete cascade not null,
  input_data jsonb not null default '{}',
  output_data jsonb not null default '{}',
  order_index integer not null default 0,
  created_at timestamptz default now()
);

-- Diversity axes table
create table public.diversity_axes (
  id uuid default uuid_generate_v4() primary key,
  project_id uuid references public.projects(id) on delete cascade not null,
  name text not null,
  description text not null,
  values jsonb not null default '[]',
  is_confirmed boolean default false,
  created_at timestamptz default now()
);

-- Batches table
create table public.batches (
  id uuid default uuid_generate_v4() primary key,
  project_id uuid references public.projects(id) on delete cascade not null,
  status text default 'pending' check (status in ('pending', 'generating', 'complete', 'failed', 'partial')),
  target_count integer not null,
  generation_config jsonb default '{}',
  created_at timestamptz default now(),
  completed_at timestamptz
);

-- Examples table
create table public.examples (
  id uuid default uuid_generate_v4() primary key,
  project_id uuid references public.projects(id) on delete cascade not null,
  batch_id uuid references public.batches(id) on delete cascade not null,
  input_data jsonb not null default '{}',
  proposed_output jsonb not null default '{}',
  labeled_output jsonb,
  label_status text default 'unlabeled' check (label_status in ('unlabeled', 'accepted', 'rejected', 'edited', 'flagged')),
  raw_claude_response text,
  created_at timestamptz default now(),
  labeled_at timestamptz
);

-- Exports table
create table public.exports (
  id uuid default uuid_generate_v4() primary key,
  project_id uuid references public.projects(id) on delete cascade not null,
  format text not null check (format in ('jsonl', 'csv', 'huggingface', 'langsmith')),
  example_count integer not null default 0,
  filter_config jsonb default '{}',
  file_url text,
  created_at timestamptz default now()
);

-- RLS policies
alter table public.users enable row level security;
alter table public.projects enable row level security;
alter table public.seed_examples enable row level security;
alter table public.diversity_axes enable row level security;
alter table public.batches enable row level security;
alter table public.examples enable row level security;
alter table public.exports enable row level security;

-- Users policies
create policy "Users can view own profile" on public.users
  for select using (auth.uid() = id);
create policy "Users can update own profile" on public.users
  for update using (auth.uid() = id);

-- Projects policies
create policy "Users can CRUD own projects" on public.projects
  for all using (auth.uid() = user_id);

-- Seed examples policies
create policy "Users can CRUD own seed examples" on public.seed_examples
  for all using (
    auth.uid() = (select user_id from public.projects where id = project_id)
  );

-- Diversity axes policies
create policy "Users can CRUD own diversity axes" on public.diversity_axes
  for all using (
    auth.uid() = (select user_id from public.projects where id = project_id)
  );

-- Batches policies
create policy "Users can CRUD own batches" on public.batches
  for all using (
    auth.uid() = (select user_id from public.projects where id = project_id)
  );

-- Examples policies
create policy "Users can CRUD own examples" on public.examples
  for all using (
    auth.uid() = (select user_id from public.projects where id = project_id)
  );

-- Exports policies
create policy "Users can CRUD own exports" on public.exports
  for all using (
    auth.uid() = (select user_id from public.projects where id = project_id)
  );

-- Auto-create user profile on signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.users (id)
  values (new.id);
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Updated_at trigger
create or replace function public.handle_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger projects_updated_at
  before update on public.projects
  for each row execute procedure public.handle_updated_at();

create trigger users_updated_at
  before update on public.users
  for each row execute procedure public.handle_updated_at();
