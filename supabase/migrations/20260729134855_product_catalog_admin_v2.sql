-- Shuangfu product catalog administration V2.0
begin;

do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_type t
    join pg_catalog.pg_namespace n on n.oid=t.typnamespace
    where n.nspname='public' and t.typname='product_status'
  ) then
    create type public.product_status as enum ('unpublished','published','archived');
  elsif exists (
    select 1
    from pg_catalog.pg_type t
    join pg_catalog.pg_namespace n on n.oid=t.typnamespace
    where n.nspname='public' and t.typname='product_status' and t.typtype<>'e'
  ) then
    raise exception 'public.product_status exists but is not an enum';
  end if;
end
$$;

alter type public.product_status add value if not exists 'unpublished';
alter type public.product_status add value if not exists 'published';
alter type public.product_status add value if not exists 'archived';

-- PostgreSQL does not allow a newly added enum value to be used until the
-- transaction that added it commits.
commit;
begin;

create table if not exists public.product_categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  sort_order integer not null default 0,
  is_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.product_category_translations (
  category_id uuid not null references public.product_categories(id) on delete cascade,
  locale text not null check(locale in ('zh','en','ar')),
  name text not null,
  description text not null default '',
  primary key(category_id,locale)
);

alter table public.product_categories
  add column if not exists id uuid,
  add column if not exists slug text,
  add column if not exists sort_order integer,
  add column if not exists is_enabled boolean,
  add column if not exists created_at timestamptz,
  add column if not exists updated_at timestamptz;

alter table public.product_categories
  alter column id set default gen_random_uuid(),
  alter column sort_order set default 0,
  alter column is_enabled set default true,
  alter column created_at set default now(),
  alter column updated_at set default now();

alter table public.product_categories
  alter column id set not null,
  alter column slug set not null,
  alter column sort_order set not null,
  alter column is_enabled set not null,
  alter column created_at set not null,
  alter column updated_at set not null;

do $$
declare
  v_constraint_name text;
begin
  select con.conname into v_constraint_name
  from pg_catalog.pg_constraint con
  join pg_catalog.pg_class rel on rel.oid=con.conrelid
  join pg_catalog.pg_namespace n on n.oid=rel.relnamespace
  where n.nspname='public'
    and rel.relname='product_categories'
    and con.contype='p'
    and con.conkey=array[(select attnum from pg_catalog.pg_attribute where attrelid=rel.oid and attname='id')]::smallint[];

  if v_constraint_name is null then
    if exists (
      select 1
      from pg_catalog.pg_constraint con
      join pg_catalog.pg_class rel on rel.oid=con.conrelid
      join pg_catalog.pg_namespace n on n.oid=rel.relnamespace
      where n.nspname='public' and rel.relname='product_categories' and con.contype='p'
    ) then
      raise exception 'product_categories has conflicting primary key';
    end if;
    alter table public.product_categories
      add constraint product_categories_pkey primary key(id);
  end if;
end
$$;

create unique index if not exists product_categories_slug_ci_uidx
  on public.product_categories(lower(slug));

alter table public.product_category_translations
  add column if not exists category_id uuid,
  add column if not exists locale text,
  add column if not exists name text,
  add column if not exists description text;

alter table public.product_category_translations
  alter column description set default '';

alter table public.product_category_translations
  alter column category_id set not null,
  alter column locale set not null,
  alter column name set not null,
  alter column description set not null;

do $$
declare
  v_constraint_name text;
begin
  select con.conname into v_constraint_name
  from pg_catalog.pg_constraint con
  join pg_catalog.pg_class rel on rel.oid=con.conrelid
  join pg_catalog.pg_namespace n on n.oid=rel.relnamespace
  where n.nspname='public'
    and rel.relname='product_category_translations'
    and con.contype='p'
    and con.conkey=array[
      (select attnum from pg_catalog.pg_attribute where attrelid=rel.oid and attname='category_id'),
      (select attnum from pg_catalog.pg_attribute where attrelid=rel.oid and attname='locale')
    ]::smallint[];

  if v_constraint_name is null then
    if exists (
      select 1
      from pg_catalog.pg_constraint con
      join pg_catalog.pg_class rel on rel.oid=con.conrelid
      join pg_catalog.pg_namespace n on n.oid=rel.relnamespace
      where n.nspname='public'
        and rel.relname='product_category_translations'
        and con.contype='p'
    ) then
      raise exception 'product_category_translations has conflicting primary key';
    end if;
    alter table public.product_category_translations
      add constraint product_category_translations_pkey primary key(category_id,locale);
  end if;
end
$$;

do $$
declare
  v_constraint_name text;
  v_conflicting_constraint_names text;
begin
  select string_agg(con.conname,', ' order by con.conname)
  into v_conflicting_constraint_names
  from pg_catalog.pg_constraint con
  join pg_catalog.pg_class rel on rel.oid=con.conrelid
  join pg_catalog.pg_namespace n on n.oid=rel.relnamespace
  join pg_catalog.pg_class target on target.oid=con.confrelid
  join pg_catalog.pg_namespace target_n on target_n.oid=target.relnamespace
  where n.nspname='public'
    and rel.relname='product_category_translations'
    and con.contype='f'
    and (select attnum from pg_catalog.pg_attribute where attrelid=rel.oid and attname='category_id')=any(con.conkey)
    and not (
      target_n.nspname='public'
      and target.relname='product_categories'
      and con.conkey=array[(select attnum from pg_catalog.pg_attribute where attrelid=rel.oid and attname='category_id')]::smallint[]
      and con.confkey=array[(select attnum from pg_catalog.pg_attribute where attrelid=target.oid and attname='id')]::smallint[]
      and con.confdeltype='c'
      and con.confupdtype='a'
      and con.confmatchtype='s'
      and not con.condeferrable
      and not con.condeferred
    );

  if v_conflicting_constraint_names is not null then
    raise exception 'product_category_translations.category_id has conflicting foreign key'
      using detail=format('Conflicting constraints: %s',v_conflicting_constraint_names);
  end if;

  select con.conname into v_constraint_name
  from pg_catalog.pg_constraint con
  join pg_catalog.pg_class rel on rel.oid=con.conrelid
  join pg_catalog.pg_namespace n on n.oid=rel.relnamespace
  join pg_catalog.pg_class target on target.oid=con.confrelid
  join pg_catalog.pg_namespace target_n on target_n.oid=target.relnamespace
  where n.nspname='public'
    and rel.relname='product_category_translations'
    and con.contype='f'
    and target_n.nspname='public'
    and target.relname='product_categories'
    and con.conkey=array[(select attnum from pg_catalog.pg_attribute where attrelid=rel.oid and attname='category_id')]::smallint[]
    and con.confkey=array[(select attnum from pg_catalog.pg_attribute where attrelid=target.oid and attname='id')]::smallint[]
    and con.confdeltype='c'
    and con.confupdtype='a'
    and con.confmatchtype='s'
    and not con.condeferrable
    and not con.condeferred
  limit 1;

  if v_constraint_name is not null then
    execute format(
      'alter table public.product_category_translations validate constraint %I',
      v_constraint_name
    );
  else
    alter table public.product_category_translations
      add constraint product_category_translations_category_id_fkey
      foreign key(category_id) references public.product_categories(id) on delete cascade;
  end if;
end
$$;

alter table public.product_category_translations
  drop constraint if exists product_category_translations_locale_check;
alter table public.product_category_translations
  add constraint product_category_translations_locale_check
  check(locale in ('zh','en','ar'));

alter table public.product_categories enable row level security;
alter table public.product_category_translations enable row level security;

lock table public.product_categories,public.product_category_translations in share row exclusive mode;

with seed(slug,sort_order,is_enabled) as (values
  ('bra-pads',10,true),
  ('cups',20,true),
  ('custom-development',30,false)
)
insert into public.product_categories(slug,sort_order,is_enabled)
select seed.slug,seed.sort_order,seed.is_enabled
from seed
where not exists (
  select 1 from public.product_categories c where lower(c.slug)=lower(seed.slug)
);

with seed(slug,locale,name,description) as (values
  ('bra-pads','zh','胸垫','胸垫产品'),
  ('bra-pads','en','Bra Pads','Bra pad products'),
  ('bra-pads','ar','وسادات حمالة الصدر','منتجات وسادات حمالة الصدر'),
  ('cups','zh','罩杯','罩杯产品'),
  ('cups','en','Cups','Cup products'),
  ('cups','ar','أكواب','منتجات الأكواب'),
  ('custom-development','zh','定制开发','历史定制开发分类'),
  ('custom-development','en','Custom Development','Legacy custom-development category'),
  ('custom-development','ar','تطوير مخصص','فئة التطوير المخصص القديمة')
)
insert into public.product_category_translations(category_id,locale,name,description)
select c.id,seed.locale,seed.name,seed.description
from seed
join public.product_categories c on lower(c.slug)=lower(seed.slug)
where not exists (
  select 1
  from public.product_category_translations t
  where t.category_id=c.id and t.locale=seed.locale
);

alter table public.products
  add column if not exists code text,
  add column if not exists category_id uuid,
  add column if not exists status_v2 public.product_status;

alter table public.products drop constraint if exists products_category_check;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema='public'
      and table_name='inquiries'
      and column_name='product_category'
  ) then
    alter table public.inquiries
      drop constraint if exists inquiries_product_category_check,
      drop constraint if exists inquiries_product_category_slug_check,
      add constraint inquiries_product_category_slug_check
        check(
          length(product_category) between 1 and 80
          and product_category ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
        );
  end if;
end
$$;

alter table public.product_translations
  add column if not exists colors text,
  add column if not exists material text,
  add column if not exists customization_scope text;

alter table public.product_translations
  alter column colors set default '',
  alter column material set default '',
  alter column customization_scope set default '';

update public.product_translations
set colors=coalesce(colors,''),
    material=coalesce(material,''),
    customization_scope=coalesce(customization_scope,'')
where colors is null or material is null or customization_scope is null;

alter table public.product_translations
  alter column colors set not null,
  alter column material set not null,
  alter column customization_scope set not null;

alter table public.product_images
  add column if not exists is_primary boolean;

alter table public.product_images
  alter column is_primary set default false;

update public.product_images set is_primary=false where is_primary is null;

alter table public.product_images
  alter column is_primary set not null;

update public.products p
set category_id=c.id
from public.product_categories c
where lower(c.slug)=lower(p.category)
  and p.category_id is null;

do $$
declare
  v_constraint_name text;
  v_conflicting_constraint_names text;
begin
  select string_agg(con.conname,', ' order by con.conname)
  into v_conflicting_constraint_names
  from pg_catalog.pg_constraint con
  join pg_catalog.pg_class rel on rel.oid=con.conrelid
  join pg_catalog.pg_namespace n on n.oid=rel.relnamespace
  join pg_catalog.pg_class target on target.oid=con.confrelid
  join pg_catalog.pg_namespace target_n on target_n.oid=target.relnamespace
  where n.nspname='public'
    and rel.relname='products'
    and con.contype='f'
    and (select attnum from pg_catalog.pg_attribute where attrelid=rel.oid and attname='category_id')=any(con.conkey)
    and not (
      target_n.nspname='public'
      and target.relname='product_categories'
      and con.conkey=array[(select attnum from pg_catalog.pg_attribute where attrelid=rel.oid and attname='category_id')]::smallint[]
      and con.confkey=array[(select attnum from pg_catalog.pg_attribute where attrelid=target.oid and attname='id')]::smallint[]
      and con.confdeltype='a'
      and con.confupdtype='a'
      and con.confmatchtype='s'
      and not con.condeferrable
      and not con.condeferred
    );

  if v_conflicting_constraint_names is not null then
    raise exception 'products.category_id has conflicting foreign key'
      using detail=format('Conflicting constraints: %s',v_conflicting_constraint_names);
  end if;

  select con.conname into v_constraint_name
  from pg_catalog.pg_constraint con
  join pg_catalog.pg_class rel on rel.oid=con.conrelid
  join pg_catalog.pg_namespace n on n.oid=rel.relnamespace
  join pg_catalog.pg_class target on target.oid=con.confrelid
  join pg_catalog.pg_namespace target_n on target_n.oid=target.relnamespace
  where n.nspname='public'
    and rel.relname='products'
    and con.contype='f'
    and target_n.nspname='public'
    and target.relname='product_categories'
    and con.conkey=array[(select attnum from pg_catalog.pg_attribute where attrelid=rel.oid and attname='category_id')]::smallint[]
    and con.confkey=array[(select attnum from pg_catalog.pg_attribute where attrelid=target.oid and attname='id')]::smallint[]
    and con.confdeltype='a'
    and con.confupdtype='a'
    and con.confmatchtype='s'
    and not con.condeferrable
    and not con.condeferred
  limit 1;

  if v_constraint_name is not null then
    execute format('alter table public.products validate constraint %I',v_constraint_name);
  else
    alter table public.products
      add constraint products_category_id_fkey
      foreign key(category_id) references public.product_categories(id);
  end if;
end
$$;

update public.products p
set code=(
  select nullif(trim(coalesce(nullif(s.value->>'en',''),nullif(s.value->>'zh',''),nullif(s.value->>'ar',''))),'')
  from public.product_specifications s
  where s.product_id=p.id
    and (
      lower(trim(coalesce(s.label->>'en',''))) in ('product code','product no','product no.','code','item no','item no.','model')
      or trim(coalesce(s.label->>'zh','')) in ('产品编码','产品编号','产品代码','货号','款号','型号','编号')
      or trim(coalesce(s.label->>'ar','')) in ('رمز المنتج','رقم المنتج','الرمز','الموديل')
    )
  order by s.sort_order,s.id
  limit 1
)
where nullif(trim(p.code),'') is null;

update public.products
set status_v2=case status
  when 'draft' then 'unpublished'::public.product_status
  when 'published' then 'published'::public.product_status
end
where status_v2 is null;

update public.products p
set code='LEGACY-' || left(replace(p.id::text,'-',''),8),
    status_v2=coalesce(status_v2,'unpublished'::public.product_status)
where nullif(trim(p.code),'') is null;

with ranked as (
  select id,row_number() over (partition by product_id order by sort_order, id) as image_rank
  from public.product_images candidate
  where not exists (
    select 1
    from public.product_images primary_image
    where primary_image.product_id=candidate.product_id and primary_image.is_primary
  )
)
update public.product_images pi
set is_primary=(ranked.image_rank=1)
from ranked
where ranked.id=pi.id;

alter table public.products
  alter column code set not null,
  alter column category_id set not null,
  alter column status_v2 set not null,
  alter column status_v2 set default 'unpublished';

create unique index if not exists products_code_ci_uidx on public.products(lower(code));
create unique index if not exists products_slug_ci_uidx on public.products(lower(slug));
create unique index if not exists product_images_one_primary_uidx on public.product_images(product_id) where is_primary;
create index if not exists products_category_v2_idx on public.products(category_id,status_v2,sort_order,id) where deleted_at is null;

create or replace function public.product_payload_v2(p_product_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path=''
as $$
  select jsonb_build_object(
    'id',p.id::text,'slug',p.slug,'code',p.code,'categoryId',p.category_id::text,
    'status',p.status_v2::text,'deletedAt',p.deleted_at,'updatedAt',p.updated_at,
    'category',jsonb_build_object(
      'id',c.id::text,'slug',c.slug,'sortOrder',c.sort_order,'isEnabled',c.is_enabled,
      'translations',coalesce((select jsonb_object_agg(ct.locale,jsonb_build_object('name',ct.name,'description',ct.description)) from public.product_category_translations ct where ct.category_id=c.id),'{}'::jsonb)
    ),
    'translations',coalesce((select jsonb_object_agg(t.locale,jsonb_build_object('name',t.name,'description',t.description,'colors',t.colors,'material',t.material,'customizationScope',t.customization_scope)) from public.product_translations t where t.product_id=p.id),'{}'::jsonb),
    'images',coalesce((select jsonb_agg(jsonb_build_object('id',i.id::text,'mediaId',i.media_id::text,'url',m.storage_path,'variants',m.variants,'isPrimary',i.is_primary,'sortOrder',i.sort_order,'alt',i.alt_text) order by i.sort_order,i.id) from public.product_images i join public.media m on m.id=i.media_id where i.product_id=p.id and m.deleted_at is null),'[]'::jsonb),
    'specifications',coalesce((select jsonb_agg(jsonb_build_object('id',s.id::text,'sortOrder',s.sort_order,'label',s.label,'value',s.value) order by s.sort_order,s.id) from public.product_specifications s where s.product_id=p.id),'[]'::jsonb)
  )
  from public.products p join public.product_categories c on c.id=p.category_id
  where p.id=p_product_id;
$$;

revoke execute on function public.product_payload_v2(uuid) from public,anon,authenticated,service_role;

create or replace function public.list_admin_products_v2(
  p_query text default null,
  p_category_id uuid default null,
  p_status public.product_status default null
)
returns table(payload jsonb)
language sql stable security definer set search_path=''
as $$
  select public.product_payload_v2(p.id)
  from public.products p
  where p.deleted_at is null
    and (p_category_id is null or p.category_id=p_category_id)
    and (p_status is null or p.status_v2=p_status)
    and (nullif(trim(p_query),'') is null or p.code ilike '%'||trim(p_query)||'%' or p.slug ilike '%'||trim(p_query)||'%' or exists(select 1 from public.product_translations t where t.product_id=p.id and t.name ilike '%'||trim(p_query)||'%'))
  order by p.sort_order,p.id;
$$;

create or replace function public.get_admin_product_v2(p_product_id uuid)
returns table(payload jsonb)
language sql stable security definer set search_path=''
as $$
  select public.product_payload_v2(p.id)
  from public.products p
  where p.id=p_product_id and p.deleted_at is null;
$$;

create or replace function public.list_product_categories_v2(p_include_disabled boolean default false)
returns table(payload jsonb)
language sql stable security definer set search_path=''
as $$
  select jsonb_build_object(
    'id',c.id::text,'slug',c.slug,'sortOrder',c.sort_order,'isEnabled',c.is_enabled,
    'translations',coalesce((select jsonb_object_agg(t.locale,jsonb_build_object('name',t.name,'description',t.description)) from public.product_category_translations t where t.category_id=c.id),'{}'::jsonb)
  )
  from public.product_categories c
  where p_include_disabled or c.is_enabled
  order by c.sort_order,c.id;
$$;

create or replace function public.list_published_catalog_v2()
returns table(payload jsonb)
language sql stable security definer set search_path=''
as $$
  select jsonb_build_object(
    'id',c.id::text,'slug',c.slug,'sortOrder',c.sort_order,'isEnabled',c.is_enabled,
    'translations',coalesce((select jsonb_object_agg(t.locale,jsonb_build_object('name',t.name,'description',t.description)) from public.product_category_translations t where t.category_id=c.id),'{}'::jsonb),
    'products',coalesce((select jsonb_agg(public.product_payload_v2(p.id) order by p.sort_order,p.id) from public.products p where p.category_id=c.id and p.status_v2='published' and p.deleted_at is null),'[]'::jsonb)
  )
  from public.product_categories c
  where c.is_enabled
  order by c.sort_order,c.id;
$$;

create or replace function public.get_published_product_v2(p_slug text)
returns table(payload jsonb)
language sql stable security definer set search_path=''
as $$
  select public.product_payload_v2(p.id)
  from public.products p join public.product_categories c on c.id=p.category_id
  where lower(p.slug)=lower(p_slug) and p.status_v2='published' and p.deleted_at is null and c.is_enabled
  limit 1;
$$;

create or replace function public.save_product_v2(
  p_product_id uuid,
  p_payload jsonb,
  p_expected_updated_at timestamptz,
  p_actor uuid
)
returns jsonb
language plpgsql security definer set search_path=''
as $$
declare
  v_product public.products;
  v_before jsonb;
  v_product_id uuid;
  v_requested_category_id uuid;
  v_category_slug text;
  v_item jsonb;
  v_locale text;
begin
  if p_actor is distinct from (select auth.uid()) then raise exception 'forbidden'; end if;
  if p_product_id is null then
    if not public.has_permission('products','create') then raise exception 'forbidden'; end if;
    if p_expected_updated_at is not null then raise exception 'version conflict'; end if;
  else
    if not public.has_permission('products','edit') then raise exception 'forbidden'; end if;
    select * into v_product from public.products where id=p_product_id and deleted_at is null for update;
    if v_product.id is null or not (v_product.updated_at is not distinct from p_expected_updated_at) then raise exception 'version conflict'; end if;
    if v_product.status_v2='published' then raise exception 'cannot save a published product'; end if;
    v_before:=to_jsonb(v_product);
  end if;

  if length(trim(coalesce(p_payload->>'code','')))=0 then raise exception 'product code is required'; end if;
  v_requested_category_id:=(p_payload->>'categoryId')::uuid;
  if p_product_id is null or v_requested_category_id is distinct from v_product.category_id then
    select c.slug into v_category_slug
    from public.product_categories c
    where c.id=v_requested_category_id and c.is_enabled;
    if v_category_slug is null then raise exception 'category is disabled'; end if;
  else
    select c.slug into v_category_slug
    from public.product_categories c
    where c.id=v_requested_category_id;
  end if;

  if p_product_id is null then
    insert into public.products(id,slug,category,status,sort_order,code,category_id,status_v2)
    values(
      gen_random_uuid(),
      coalesce(nullif(trim(p_payload->>'slug'),''),lower(trim(both '-' from regexp_replace(trim(p_payload->>'code'),'[^[:alnum:]]+','-','g')))),
      v_category_slug,
      'draft',coalesce((p_payload->>'sortOrder')::integer,0),trim(p_payload->>'code'),
      v_requested_category_id,'unpublished'
    ) returning * into v_product;
    v_product_id:=v_product.id;
  else
    update public.products
    set code=trim(p_payload->>'code'),
        slug=coalesce(nullif(trim(p_payload->>'slug'),''),slug),
        category_id=v_requested_category_id,
        category=v_category_slug,
        sort_order=coalesce((p_payload->>'sortOrder')::integer,sort_order),
        updated_at=clock_timestamp()
    where id=p_product_id returning * into v_product;
    v_product_id:=p_product_id;
    delete from public.product_translations where product_id=v_product_id;
    delete from public.product_images where product_id=v_product_id;
    delete from public.product_specifications where product_id=v_product_id;
  end if;

  foreach v_locale in array array['zh','en','ar'] loop
    insert into public.product_translations(product_id,locale,name,summary,description,colors,material,customization_scope)
    values(v_product_id,v_locale,coalesce(p_payload->'translations'->v_locale->>'name',''),coalesce(p_payload->'translations'->v_locale->>'description',''),coalesce(p_payload->'translations'->v_locale->>'description',''),coalesce(p_payload->'translations'->v_locale->>'colors',''),coalesce(p_payload->'translations'->v_locale->>'material',''),coalesce(p_payload->'translations'->v_locale->>'customizationScope',''));
  end loop;

  for v_item in select value from jsonb_array_elements(coalesce(p_payload->'images','[]'::jsonb)) loop
    insert into public.product_images(id,product_id,media_id,sort_order,alt_text,is_primary)
    values(coalesce((v_item->>'id')::uuid,gen_random_uuid()),v_product_id,(v_item->>'mediaId')::uuid,coalesce((v_item->>'sortOrder')::integer,0),coalesce(v_item->'alt','{}'::jsonb),coalesce((v_item->>'isPrimary')::boolean,false));
  end loop;

  for v_item in select value from jsonb_array_elements(coalesce(p_payload->'specifications','[]'::jsonb)) loop
    insert into public.product_specifications(id,product_id,label,value,sort_order)
    values(coalesce((v_item->>'id')::uuid,gen_random_uuid()),v_product_id,coalesce(v_item->'label','{}'::jsonb),coalesce(v_item->'value','{}'::jsonb),coalesce((v_item->>'sortOrder')::integer,0));
  end loop;

  update public.products set updated_at=clock_timestamp() where id=v_product_id returning * into v_product;
  insert into public.audit_logs(actor_id,action,resource_type,resource_id,before_data,after_data)
  values(p_actor,'save','product',v_product_id::text,v_before,public.product_payload_v2(v_product_id));
  return public.product_payload_v2(v_product_id);
end;
$$;

create or replace function public.publish_product_v2(p_product_id uuid,p_expected_updated_at timestamptz,p_actor uuid)
returns jsonb
language plpgsql security definer set search_path=''
as $$
declare
  v_product public.products;
  v_before jsonb;
  v_payload jsonb;
  v_details jsonb := '{"zh":[],"en":[],"ar":[],"_global":[]}'::jsonb;
  v_translation public.product_translations;
  v_image record;
  v_specification public.product_specifications;
  v_locale text;
  v_live_image_count integer;
  v_has_translation_error boolean := false;
begin
  if p_actor is distinct from (select auth.uid()) or not public.has_permission('products','publish') then raise exception 'forbidden'; end if;
  select * into v_product from public.products where id=p_product_id and deleted_at is null for update;
  if v_product.id is null or not (v_product.updated_at is not distinct from p_expected_updated_at) then raise exception 'version conflict'; end if;
  if v_product.status_v2 not in ('unpublished','archived') then raise exception 'invalid product state for publish'; end if;
  v_before:=to_jsonb(v_product);

  if not exists(select 1 from public.product_categories c where c.id=v_product.category_id and c.is_enabled) then
    v_details:=jsonb_set(v_details,'{_global}',(v_details->'_global')||jsonb_build_array('category is disabled'));
  end if;

  foreach v_locale in array array['zh','en','ar'] loop
    select * into v_translation from public.product_translations t where t.product_id=p_product_id and t.locale=v_locale;
    if not found or length(trim(coalesce(v_translation.name,'')))=0 then
      v_details:=jsonb_set(v_details,array[v_locale],(v_details->v_locale)||jsonb_build_array('translations.name'));
      v_has_translation_error:=true;
    end if;
    if not found or length(trim(coalesce(v_translation.description,'')))=0 then
      v_details:=jsonb_set(v_details,array[v_locale],(v_details->v_locale)||jsonb_build_array('translations.description'));
      v_has_translation_error:=true;
    end if;
    if not found or length(trim(coalesce(v_translation.colors,'')))=0 then
      v_details:=jsonb_set(v_details,array[v_locale],(v_details->v_locale)||jsonb_build_array('translations.colors'));
      v_has_translation_error:=true;
    end if;
    if not found or length(trim(coalesce(v_translation.material,'')))=0 then
      v_details:=jsonb_set(v_details,array[v_locale],(v_details->v_locale)||jsonb_build_array('translations.material'));
      v_has_translation_error:=true;
    end if;
    if not found or length(trim(coalesce(v_translation.customization_scope,'')))=0 then
      v_details:=jsonb_set(v_details,array[v_locale],(v_details->v_locale)||jsonb_build_array('translations.customizationScope'));
      v_has_translation_error:=true;
    end if;
  end loop;
  if v_has_translation_error then
    v_details:=jsonb_set(v_details,'{_global}',(v_details->'_global')||jsonb_build_array('incomplete translations'));
  end if;

  select count(*) into v_live_image_count
  from public.product_images i join public.media m on m.id=i.media_id
  where i.product_id=p_product_id and m.deleted_at is null;
  if v_live_image_count not between 1 and 10 then
    v_details:=jsonb_set(v_details,'{_global}',(v_details->'_global')||jsonb_build_array('invalid image count'));
  end if;

  if (select count(*) from public.product_images i join public.media m on m.id=i.media_id where i.product_id=p_product_id and i.is_primary and m.deleted_at is null)<>1 then
    v_details:=jsonb_set(v_details,'{_global}',(v_details->'_global')||jsonb_build_array('exactly one primary image is required'));
  end if;

  for v_image in
    select i.alt_text from public.product_images i join public.media m on m.id=i.media_id
    where i.product_id=p_product_id and m.deleted_at is null
  loop
    foreach v_locale in array array['zh','en','ar'] loop
      if length(trim(coalesce(v_image.alt_text->>v_locale,'')))=0 then
        v_details:=jsonb_set(v_details,array[v_locale],(v_details->v_locale)||jsonb_build_array('images.alt'));
      end if;
    end loop;
  end loop;
  if exists(select 1 from jsonb_each(v_details-'_global') entry where entry.value ? 'images.alt') then
    v_details:=jsonb_set(v_details,'{_global}',(v_details->'_global')||jsonb_build_array('incomplete image alt text'));
  end if;

  if not exists(select 1 from public.product_specifications s where s.product_id=p_product_id) then
    v_details:=jsonb_set(v_details,'{_global}',(v_details->'_global')||jsonb_build_array('at least one complete specification is required'));
  end if;
  if exists(
    select 1 from public.product_specifications s
    where s.product_id=p_product_id and (
      not (s.label ?& array['zh','en','ar']) or not (s.value ?& array['zh','en','ar'])
      or exists(select 1 from unnest(array['zh','en','ar']) locale where length(trim(coalesce(s.label->>locale,'')))=0 or length(trim(coalesce(s.value->>locale,'')))=0)
    )
  ) then
    v_details:=jsonb_set(v_details,'{_global}',(v_details->'_global')||jsonb_build_array('incomplete specification'));
  end if;
  for v_specification in select * from public.product_specifications s where s.product_id=p_product_id loop
    foreach v_locale in array array['zh','en','ar'] loop
      if length(trim(coalesce(v_specification.label->>v_locale,'')))=0 then
        v_details:=jsonb_set(v_details,array[v_locale],(v_details->v_locale)||jsonb_build_array('specifications.label'));
      end if;
      if length(trim(coalesce(v_specification.value->>v_locale,'')))=0 then
        v_details:=jsonb_set(v_details,array[v_locale],(v_details->v_locale)||jsonb_build_array('specifications.value'));
      end if;
    end loop;
  end loop;

  if v_details<>'{"zh":[],"en":[],"ar":[],"_global":[]}'::jsonb then
    raise exception 'product validation failed' using errcode='22023',detail=v_details::text;
  end if;
  update public.products set status_v2='published',status='published',updated_at=clock_timestamp() where id=p_product_id returning * into v_product;
  v_payload:=public.product_payload_v2(p_product_id);
  insert into public.audit_logs(actor_id,action,resource_type,resource_id,before_data,after_data) values(p_actor,'publish','product',p_product_id::text,v_before,v_payload);
  return v_payload;
end;
$$;

create or replace function public.archive_product_v2(p_product_id uuid,p_expected_updated_at timestamptz,p_actor uuid)
returns jsonb
language plpgsql security definer set search_path=''
as $$
declare v_product public.products; v_before jsonb;
begin
  if p_actor is distinct from (select auth.uid()) or not public.has_permission('products','publish') then raise exception 'forbidden'; end if;
  select * into v_product from public.products where id=p_product_id and deleted_at is null for update;
  if v_product.id is null or not (v_product.updated_at is not distinct from p_expected_updated_at) then raise exception 'version conflict'; end if;
  if v_product.status_v2<>'published' then raise exception 'invalid product state for archive'; end if;
  v_before:=to_jsonb(v_product);
  update public.products set status_v2='archived',status='draft',updated_at=clock_timestamp() where id=p_product_id returning * into v_product;
  insert into public.audit_logs(actor_id,action,resource_type,resource_id,before_data,after_data) values(p_actor,'archive','product',p_product_id::text,v_before,to_jsonb(v_product));
  return public.product_payload_v2(p_product_id);
end;
$$;

create or replace function public.soft_delete_product_v2(p_product_id uuid,p_expected_updated_at timestamptz,p_actor uuid)
returns jsonb
language plpgsql security definer set search_path=''
as $$
declare v_product public.products; v_before jsonb;
begin
  if p_actor is distinct from (select auth.uid()) or not public.has_permission('products','delete') then raise exception 'forbidden'; end if;
  select * into v_product from public.products where id=p_product_id and deleted_at is null for update;
  if v_product.id is null or not (v_product.updated_at is not distinct from p_expected_updated_at) then raise exception 'version conflict'; end if;
  if v_product.status_v2='published' then raise exception 'cannot delete a published product'; end if;
  v_before:=to_jsonb(v_product);
  update public.products set status_v2='archived',status='draft',deleted_at=clock_timestamp(),updated_at=clock_timestamp() where id=p_product_id returning * into v_product;
  insert into public.audit_logs(actor_id,action,resource_type,resource_id,before_data,after_data) values(p_actor,'soft_delete','product',p_product_id::text,v_before,to_jsonb(v_product));
  return to_jsonb(v_product);
end;
$$;

-- Public catalog reads are strict; authenticated administrators receive a separate policy.
drop policy if exists product_categories_public_read on public.product_categories;
drop policy if exists product_categories_authenticated_read on public.product_categories;
drop policy if exists product_category_translations_public_read on public.product_category_translations;
drop policy if exists product_category_translations_authenticated_read on public.product_category_translations;
drop policy if exists products_public_read on public.products;
drop policy if exists products_authenticated_read on public.products;
drop policy if exists product_translations_public_read on public.product_translations;
drop policy if exists product_translations_authenticated_read on public.product_translations;
drop policy if exists product_images_public_read on public.product_images;
drop policy if exists product_images_authenticated_read on public.product_images;
drop policy if exists product_specs_public_read on public.product_specifications;
drop policy if exists product_specs_authenticated_read on public.product_specifications;
drop policy if exists media_public_read on public.media;
drop policy if exists media_authenticated_read on public.media;

create policy product_categories_public_read on public.product_categories for select to anon using(is_enabled);
create policy product_categories_authenticated_read on public.product_categories for select to authenticated using(is_enabled or public.has_permission('products','view'));
create policy product_category_translations_public_read on public.product_category_translations for select to anon using(exists(select 1 from public.product_categories c where c.id=category_id and c.is_enabled));
create policy product_category_translations_authenticated_read on public.product_category_translations for select to authenticated using(exists(select 1 from public.product_categories c where c.id=category_id and (c.is_enabled or public.has_permission('products','view'))));

create policy products_public_read on public.products for select to anon using(status_v2='published' and deleted_at is null and exists(select 1 from public.product_categories c where c.id=category_id and c.is_enabled));
create policy products_authenticated_read on public.products for select to authenticated using((status_v2='published' and deleted_at is null and exists(select 1 from public.product_categories c where c.id=category_id and c.is_enabled)) or public.has_permission('products','view'));
create policy product_translations_public_read on public.product_translations for select to anon using(exists(select 1 from public.products p join public.product_categories c on c.id=p.category_id where p.id=product_id and p.status_v2='published' and p.deleted_at is null and c.is_enabled));
create policy product_translations_authenticated_read on public.product_translations for select to authenticated using(exists(select 1 from public.products p join public.product_categories c on c.id=p.category_id where p.id=product_id and p.status_v2='published' and p.deleted_at is null and c.is_enabled) or public.has_permission('products','view'));
create policy product_images_public_read on public.product_images for select to anon using(exists(select 1 from public.products p join public.product_categories c on c.id=p.category_id where p.id=product_id and p.status_v2='published' and p.deleted_at is null and c.is_enabled));
create policy product_images_authenticated_read on public.product_images for select to authenticated using(exists(select 1 from public.products p join public.product_categories c on c.id=p.category_id where p.id=product_id and p.status_v2='published' and p.deleted_at is null and c.is_enabled) or public.has_permission('products','view'));
create policy product_specs_public_read on public.product_specifications for select to anon using(exists(select 1 from public.products p join public.product_categories c on c.id=p.category_id where p.id=product_id and p.status_v2='published' and p.deleted_at is null and c.is_enabled));
create policy product_specs_authenticated_read on public.product_specifications for select to authenticated using(exists(select 1 from public.products p join public.product_categories c on c.id=p.category_id where p.id=product_id and p.status_v2='published' and p.deleted_at is null and c.is_enabled) or public.has_permission('products','view'));
create policy media_public_read on public.media for select to anon using(deleted_at is null and exists(select 1 from public.product_images i join public.products p on p.id=i.product_id join public.product_categories c on c.id=p.category_id where i.media_id=media.id and p.status_v2='published' and p.deleted_at is null and c.is_enabled));
create policy media_authenticated_read on public.media for select to authenticated using((deleted_at is null and exists(select 1 from public.product_images i join public.products p on p.id=i.product_id join public.product_categories c on c.id=p.category_id where i.media_id=media.id and p.status_v2='published' and p.deleted_at is null and c.is_enabled)) or public.has_permission('media','view'));

-- Product writes are only available through guarded security-definer RPCs.
revoke insert,update,delete on public.products,public.product_translations,public.product_images,public.product_specifications,public.product_categories,public.product_category_translations from authenticated;
grant select on public.product_categories,public.product_category_translations to anon,authenticated;

-- Retire all V1 product RPC grants without deleting migration history.
revoke execute on function public.product_payload(public.products) from public,anon,authenticated,service_role;
revoke execute on function public.list_published_products(text,integer,integer,uuid) from public,anon,authenticated,service_role;
revoke execute on function public.get_published_product(text) from public,anon,authenticated,service_role;
revoke execute on function public.publish_product_version(uuid,integer,uuid) from public,anon,authenticated,service_role;
revoke execute on function public.rollback_product_version(uuid,integer,integer,uuid) from public,anon,authenticated,service_role;
revoke execute on function public.replace_product_catalog_v1(jsonb) from public,anon,authenticated,service_role;
revoke execute on function public.export_product_catalog_snapshot_v1() from public,anon,authenticated,service_role;
revoke execute on function public.restore_product_catalog_snapshot_v1(jsonb) from public,anon,authenticated,service_role;

revoke execute on function public.list_admin_products_v2(text,uuid,public.product_status) from public,anon,authenticated,service_role;
revoke execute on function public.get_admin_product_v2(uuid) from public,anon,authenticated,service_role;
revoke execute on function public.list_product_categories_v2(boolean) from public,anon,authenticated,service_role;
revoke execute on function public.list_published_catalog_v2() from public,anon,authenticated,service_role;
revoke execute on function public.get_published_product_v2(text) from public,anon,authenticated,service_role;
revoke execute on function public.save_product_v2(uuid,jsonb,timestamptz,uuid) from public,anon,authenticated,service_role;
revoke execute on function public.publish_product_v2(uuid,timestamptz,uuid) from public,anon,authenticated,service_role;
revoke execute on function public.archive_product_v2(uuid,timestamptz,uuid) from public,anon,authenticated,service_role;
revoke execute on function public.soft_delete_product_v2(uuid,timestamptz,uuid) from public,anon,authenticated,service_role;

grant execute on function public.list_admin_products_v2(text,uuid,public.product_status) to service_role;
grant execute on function public.get_admin_product_v2(uuid) to service_role;
grant execute on function public.list_product_categories_v2(boolean) to service_role;
grant execute on function public.list_published_catalog_v2() to service_role;
grant execute on function public.get_published_product_v2(text) to service_role;
grant execute on function public.save_product_v2(uuid,jsonb,timestamptz,uuid) to authenticated;
grant execute on function public.publish_product_v2(uuid,timestamptz,uuid) to authenticated;
grant execute on function public.archive_product_v2(uuid,timestamptz,uuid) to authenticated;
grant execute on function public.soft_delete_product_v2(uuid,timestamptz,uuid) to authenticated;

commit;
