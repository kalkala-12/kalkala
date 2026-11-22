-- =====================================================================
-- כלכלת הבית – סכמת מסד נתונים ל-Supabase
-- להריץ פעם אחת: Supabase → SQL Editor → New query → להדביק → Run
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------- משק בית וחברים ----------
create table if not exists households (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'המשפחה שלי',
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists household_members (
  household_id uuid not null references households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'owner',
  created_at timestamptz not null default now(),
  primary key (household_id, user_id)
);

-- הזמנת משתמש נוסף (בן/בת זוג): מוסיפים מייל, וכשהוא נרשם הוא מצטרף לאותו משק בית
create table if not exists household_invites (
  email text primary key,
  household_id uuid not null references households(id) on delete cascade,
  created_at timestamptz not null default now()
);

create or replace function is_member(h uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from household_members where household_id = h and user_id = auth.uid());
$$;

-- ---------- חשבונות בנק, מזומן, חיסכון וכרטיסי אשראי ----------
create table if not exists accounts (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  name text not null,
  bank text,
  kind text not null default 'bank' check (kind in ('bank','card','cash','savings')),
  owner text not null default 'joint' check (owner in ('me','spouse','joint')),
  opening_balance numeric not null default 0,      -- יתרה במועד העדכון האחרון
  opening_date date not null default current_date,  -- מועד העדכון האחרון של היתרה
  credit_limit numeric not null default 0,          -- מסגרת אשראי (לחשבון בנק)
  billing_day int check (billing_day between 1 and 31),   -- יום חיוב (לכרטיס אשראי)
  expected_charge numeric not null default 0,       -- חיוב צפוי חודשי (לכרטיס אשראי)
  linked_account_id uuid references accounts(id) on delete set null, -- מאיזה חשבון יורד חיוב הכרטיס
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---------- הלוואות, משכנתאות וחובות ----------
create table if not exists loans (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  name text not null,
  lender text,
  kind text not null default 'bank' check (kind in ('bank','mortgage','private','person','installments','other')),
  owner text not null default 'joint' check (owner in ('me','spouse','joint')),
  original_amount numeric not null default 0,
  balance numeric not null default 0,
  monthly_payment numeric not null default 0,
  interest_rate numeric,             -- ריבית שנתית באחוזים, אם ידועה
  payments_left int,                 -- מספר תשלומים שנותרו, אם ידוע
  payment_day int not null default 10 check (payment_day between 1 and 31),
  account_id uuid references accounts(id) on delete set null,
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---------- הכנסות והוצאות קבועות (הוראות קבע, משכורות, שכירות) ----------
create table if not exists recurring (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  kind text not null check (kind in ('income','expense')),
  amount numeric not null check (amount >= 0),
  category text not null,
  description text,
  owner text not null default 'joint' check (owner in ('me','spouse','joint')),
  account_id uuid references accounts(id) on delete set null,
  day_of_month int not null default 1 check (day_of_month between 1 and 31),
  every_months int not null default 1 check (every_months between 1 and 12),
  start_date date not null default current_date,
  end_date date,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---------- תנועות בפועל ----------
create table if not exists transactions (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  date date not null,
  kind text not null check (kind in ('income','expense','transfer')),
  amount numeric not null check (amount >= 0),
  category text,
  description text,
  owner text not null default 'joint' check (owner in ('me','spouse','joint')),
  account_id uuid references accounts(id) on delete set null,
  to_account_id uuid references accounts(id) on delete set null,  -- להעברות / תשלום כרטיס
  is_fixed boolean not null default false,
  recurring_id uuid references recurring(id) on delete set null,
  loan_id uuid references loans(id) on delete set null,
  source text not null default 'manual',
  import_hash text,
  created_at timestamptz not null default now()
);
-- מונע ייבוא כפול של אותה תנועה (ערכי NULL לא מתנגשים, כך שתנועות ידניות לא מושפעות)
create unique index if not exists transactions_import_uniq on transactions(household_id, import_hash);
create index if not exists transactions_date_idx on transactions(household_id, date);

-- ---------- נכסים (דירות, חסכונות, פנסיה, רכב) ----------
create table if not exists assets (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  name text not null,
  kind text not null default 'other' check (kind in ('real_estate','savings','pension','investment','vehicle','other')),
  value numeric not null default 0,
  ownership_pct numeric not null default 100,
  annual_growth_pct numeric not null default 0,
  notes text,
  created_at timestamptz not null default now()
);

-- ---------- יעדי צמיחה ----------
create table if not exists goals (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  name text not null,
  metric text not null check (metric in ('net_worth','total_debt','overdraft','cash','monthly_surplus','assets')),
  target numeric not null,
  start_value numeric not null default 0,
  start_date date not null default current_date,
  target_date date not null,
  notes text,
  created_at timestamptz not null default now()
);

-- ---------- תמונת מצב יומית (לגרפי התפתחות) ----------
create table if not exists snapshots (
  household_id uuid not null references households(id) on delete cascade,
  date date not null,
  cash numeric not null default 0,
  overdraft numeric not null default 0,
  debt numeric not null default 0,
  assets numeric not null default 0,
  net_worth numeric not null default 0,
  primary key (household_id, date)
);

-- =====================================================================
-- הרשאות (Row Level Security): כל משתמש רואה רק את משק הבית שלו
-- =====================================================================
alter table households enable row level security;
alter table household_members enable row level security;
alter table household_invites enable row level security;
alter table accounts enable row level security;
alter table loans enable row level security;
alter table recurring enable row level security;
alter table transactions enable row level security;
alter table assets enable row level security;
alter table goals enable row level security;
alter table snapshots enable row level security;

drop policy if exists hh_select on households;
create policy hh_select on households for select using (is_member(id));
drop policy if exists hh_update on households;
create policy hh_update on households for update using (is_member(id)) with check (is_member(id));

drop policy if exists hm_select on household_members;
create policy hm_select on household_members for select using (is_member(household_id));

drop policy if exists hi_all on household_invites;
create policy hi_all on household_invites for all using (is_member(household_id)) with check (is_member(household_id));

do $$
declare t text;
begin
  foreach t in array array['accounts','loans','recurring','transactions','assets','goals','snapshots'] loop
    execute format('drop policy if exists member_all on %I', t);
    execute format('create policy member_all on %I for all using (is_member(household_id)) with check (is_member(household_id))', t);
  end loop;
end $$;

-- =====================================================================
-- משתמש חדש: מצטרף למשק בית שהוזמן אליו, או מקבל משק בית חדש
-- =====================================================================
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare h uuid;
begin
  select household_id into h from household_invites where lower(email) = lower(new.email);
  if h is not null then
    insert into household_members(household_id, user_id, role) values (h, new.id, 'member');
    delete from household_invites where lower(email) = lower(new.email);
  else
    insert into households default values returning id into h;
    insert into household_members(household_id, user_id, role) values (h, new.id, 'owner');
  end if;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function handle_new_user();
