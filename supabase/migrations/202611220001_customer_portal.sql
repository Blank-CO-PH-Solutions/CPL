-- Customer portal starter schema for Supabase.
-- Apply with `supabase db push` or paste into the Supabase SQL editor.
create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  email text not null default '',
  phone text not null default '',
  company_name text not null default '',
  billing_address text not null default '',
  tax_id text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.profiles(id) on delete cascade,
  order_number text not null unique default ('ORD-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10))),
  product_name text not null,
  category text not null default 'Other',
  description text not null default '',
  total_amount numeric(12,2) not null default 0 check (total_amount >= 0),
  status text not null default 'Pending' check (status in ('Pending', 'Confirmed', 'Processing', 'In progress', 'Ready for Delivery', 'Shipped', 'Delivered', 'Completed', 'Cancelled', 'On Hold')),
  payment_status text not null default 'Pending' check (payment_status in ('Pending', 'Paid', 'Partially paid', 'Overdue', 'Refunded')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.profiles(id) on delete cascade,
  order_id uuid references public.orders(id) on delete set null,
  invoice_number text not null unique default ('INV-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10))),
  issued_at timestamptz not null default now(),
  due_at timestamptz not null default (now() + interval '14 days'),
  total_amount numeric(12,2) not null check (total_amount >= 0),
  amount_paid numeric(12,2) not null default 0 check (amount_paid >= 0 and amount_paid <= total_amount),
  status text not null default 'Unpaid' check (status in ('Draft', 'Unpaid', 'Partially paid', 'Paid', 'Overdue', 'Cancelled', 'Refunded')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.profiles(id) on delete cascade,
  invoice_id uuid not null references public.invoices(id) on delete restrict,
  transaction_ref text unique,
  payment_method text not null default 'Manual payment',
  amount numeric(12,2) not null check (amount > 0),
  status text not null default 'Pending' check (status in ('Pending', 'Completed', 'Failed', 'Refunded')),
  paid_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.profiles(id) on delete cascade,
  ticket_number text not null unique default ('TKT-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10))),
  subject text not null,
  category text not null default 'Other',
  message text not null default '',
  status text not null default 'Open' check (status in ('Open', 'In progress', 'Waiting for Customer', 'Resolved', 'Closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists orders_customer_created_idx on public.orders (customer_id, created_at desc);
create index if not exists invoices_customer_issued_idx on public.invoices (customer_id, issued_at desc);
create index if not exists invoices_order_id_idx on public.invoices (order_id);
create index if not exists payments_customer_paid_idx on public.payments (customer_id, paid_at desc);
create index if not exists payments_invoice_id_idx on public.payments (invoice_id);
create index if not exists support_tickets_customer_created_idx on public.support_tickets (customer_id, created_at desc);

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at before update on public.profiles
for each row execute function public.set_updated_at();
drop trigger if exists orders_set_updated_at on public.orders;
create trigger orders_set_updated_at before update on public.orders
for each row execute function public.set_updated_at();
drop trigger if exists invoices_set_updated_at on public.invoices;
create trigger invoices_set_updated_at before update on public.invoices
for each row execute function public.set_updated_at();
drop trigger if exists support_tickets_set_updated_at on public.support_tickets;
create trigger support_tickets_set_updated_at before update on public.support_tickets
for each row execute function public.set_updated_at();

-- Create a customer profile after signup. Users may subsequently edit their own profile.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    coalesce(new.email, '')
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute procedure public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.orders enable row level security;
alter table public.invoices enable row level security;
alter table public.payments enable row level security;
alter table public.support_tickets enable row level security;

drop policy if exists "Customers can view own profile" on public.profiles;
create policy "Customers can view own profile" on public.profiles
for select to authenticated using ((select auth.uid()) = id);
drop policy if exists "Customers can update own profile" on public.profiles;
create policy "Customers can update own profile" on public.profiles
for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

drop policy if exists "Customers can view own orders" on public.orders;
create policy "Customers can view own orders" on public.orders
for select to authenticated using ((select auth.uid()) = customer_id);
drop policy if exists "Customers can request own orders" on public.orders;
create policy "Customers can request own orders" on public.orders
for insert to authenticated with check ((select auth.uid()) = customer_id and total_amount = 0 and status = 'Pending' and payment_status = 'Pending');

drop policy if exists "Customers can view own invoices" on public.invoices;
create policy "Customers can view own invoices" on public.invoices
for select to authenticated using ((select auth.uid()) = customer_id);

drop policy if exists "Customers can view own payments" on public.payments;
create policy "Customers can view own payments" on public.payments
for select to authenticated using ((select auth.uid()) = customer_id);

drop policy if exists "Customers can view own support tickets" on public.support_tickets;
create policy "Customers can view own support tickets" on public.support_tickets
for select to authenticated using ((select auth.uid()) = customer_id);
drop policy if exists "Customers can create own support tickets" on public.support_tickets;
create policy "Customers can create own support tickets" on public.support_tickets
for insert to authenticated with check ((select auth.uid()) = customer_id and status = 'Open');
