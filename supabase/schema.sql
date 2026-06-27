-- ============================================================
-- 个人作品集：Supabase 数据库、认证与存储权限初始化
-- 在 Supabase Dashboard → SQL Editor 中完整粘贴并执行本文件。
-- 可安全重复执行主要对象；数据表不会被删除。
-- ============================================================

create extension if not exists "pgcrypto";

-- 1) 用户资料：新注册 / 新建 Auth 用户会自动得到一行 profile。
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do update set email = excluded.email;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- 为已经存在的 Auth 用户补建 profile（首次配置时很有用）。
insert into public.profiles (id, email)
select id, email from auth.users
on conflict (id) do update set email = excluded.email;

-- 供 RLS 调用的管理员判断函数。
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select coalesce(
    (select is_admin from public.profiles where id = auth.uid()),
    false
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;

-- 2) 公开展示的个人信息。id 固定为 true，只保留一份网站设置。
create table if not exists public.site_settings (
  id boolean primary key default true check (id = true),
  full_name text not null default '你的名字',
  role text default '创作者 · 设计师',
  bio text default '在这里展示作品、项目经验与成长轨迹。',
  email text default '',
  location text default '',
  avatar_url text,
  avatar_path text,
  resume_url text,
  resume_path text,
  resume_name text,
  updated_at timestamptz not null default now()
);

create table if not exists public.works (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  category text not null default '作品',
  description text default '',
  image_url text not null,
  stored_path text,
  project_url text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.certificates (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  issuer text default '',
  image_url text not null,
  stored_path text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.site_settings enable row level security;
alter table public.works enable row level security;
alter table public.certificates enable row level security;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_site_settings_updated_at on public.site_settings;
create trigger set_site_settings_updated_at
  before update on public.site_settings
  for each row execute procedure public.set_updated_at();

drop trigger if exists set_works_updated_at on public.works;
create trigger set_works_updated_at
  before update on public.works
  for each row execute procedure public.set_updated_at();

drop trigger if exists set_certificates_updated_at on public.certificates;
create trigger set_certificates_updated_at
  before update on public.certificates
  for each row execute procedure public.set_updated_at();

-- 创建唯一的网站设置行。以后由管理员后台更新。
insert into public.site_settings (id)
values (true)
on conflict (id) do nothing;

-- 3) 数据库 RLS：任何人可读；只有 profiles.is_admin = true 的用户可写。
drop policy if exists "Users can read own profile" on public.profiles;
create policy "Users can read own profile"
on public.profiles for select
to authenticated
using (auth.uid() = id);

drop policy if exists "Public can read site settings" on public.site_settings;
create policy "Public can read site settings"
on public.site_settings for select
to anon, authenticated
using (true);

drop policy if exists "Admins can update site settings" on public.site_settings;
create policy "Admins can update site settings"
on public.site_settings for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Public can read works" on public.works;
create policy "Public can read works"
on public.works for select
to anon, authenticated
using (true);

drop policy if exists "Admins can insert works" on public.works;
create policy "Admins can insert works"
on public.works for insert
to authenticated
with check (public.is_admin());

drop policy if exists "Admins can update works" on public.works;
create policy "Admins can update works"
on public.works for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Admins can delete works" on public.works;
create policy "Admins can delete works"
on public.works for delete
to authenticated
using (public.is_admin());

drop policy if exists "Public can read certificates" on public.certificates;
create policy "Public can read certificates"
on public.certificates for select
to anon, authenticated
using (true);

drop policy if exists "Admins can insert certificates" on public.certificates;
create policy "Admins can insert certificates"
on public.certificates for insert
to authenticated
with check (public.is_admin());

drop policy if exists "Admins can update certificates" on public.certificates;
create policy "Admins can update certificates"
on public.certificates for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Admins can delete certificates" on public.certificates;
create policy "Admins can delete certificates"
on public.certificates for delete
to authenticated
using (public.is_admin());

-- 4) Storage：一个公开读取、仅管理员可写的 Bucket。
insert into storage.buckets (id, name, public)
values ('portfolio-assets', 'portfolio-assets', true)
on conflict (id) do update set public = true;

drop policy if exists "Public can view portfolio assets" on storage.objects;
create policy "Public can view portfolio assets"
on storage.objects for select
to public
using (bucket_id = 'portfolio-assets');

drop policy if exists "Admins can upload portfolio assets" on storage.objects;
create policy "Admins can upload portfolio assets"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'portfolio-assets'
  and public.is_admin()
);

drop policy if exists "Admins can update portfolio assets" on storage.objects;
create policy "Admins can update portfolio assets"
on storage.objects for update
to authenticated
using (
  bucket_id = 'portfolio-assets'
  and public.is_admin()
)
with check (
  bucket_id = 'portfolio-assets'
  and public.is_admin()
);

drop policy if exists "Admins can delete portfolio assets" on storage.objects;
create policy "Admins can delete portfolio assets"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'portfolio-assets'
  and public.is_admin()
);

-- 5) 性能索引
create index if not exists works_order_idx on public.works (sort_order, created_at desc);
create index if not exists certificates_order_idx on public.certificates (sort_order, created_at desc);

-- ============================================================
-- 最后一步：在 Supabase Auth → Users 新建后台账号后，执行下方语句，
-- 并将邮箱替换成你自己的管理员邮箱。
--
-- update public.profiles
-- set is_admin = true
-- where email = 'your-admin-email@example.com';
-- ============================================================
