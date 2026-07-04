
-- Expense Tracker tables (exp_ prefix; isolated from the rest of this project).
-- Locked by RLS to a single login: owner@example.com.

create table if not exists exp_transactions(
  id bigserial primary key,
  date date not null, merchant text, raw text, field text,
  amount double precision not null, category text,
  ref text, source text, account text, account_type text,
  unique(source, ref)
);
create table if not exists exp_chequing(
  id bigserial primary key,
  date date, descr text, amount double precision, kind text,
  balance double precision, internal boolean, dep_type text,
  is_income boolean, account text
);
create table if not exists exp_payments(
  id bigserial primary key, date date, amount double precision, account text
);
create table if not exists exp_statements(
  source text primary key, date date, label text,
  purchases double precision, payments double precision,
  interest double precision, balance double precision
);
create table if not exists exp_rules(
  id bigserial primary key, ord int, keyword text, display text, category text
);
create table if not exists exp_budgets(category text primary key, monthly double precision);
create table if not exists exp_goals(
  id bigserial primary key, name text, target double precision, saved double precision
);
create table if not exists exp_subs(
  id bigserial primary key, name text, amount double precision, cadence text, category text
);
create table if not exists exp_settings(key text primary key, value jsonb);

create index if not exists exp_txn_date on exp_transactions(date);
create index if not exists exp_txn_acct on exp_transactions(account);
create index if not exists exp_chq_date on exp_chequing(date);

-- Enable RLS + lock every table to the single owner email.
do $$
declare t text;
begin
  foreach t in array array['exp_transactions','exp_chequing','exp_payments','exp_statements',
                           'exp_rules','exp_budgets','exp_goals','exp_subs','exp_settings']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists exp_owner on %I', t);
    execute format($f$create policy exp_owner on %I for all
      using ((auth.jwt() ->> 'email') = 'owner@example.com')
      with check ((auth.jwt() ->> 'email') = 'owner@example.com')$f$, t);
  end loop;
end $$;
;
