-- Shuangfu corporate site schema V1.0
create extension if not exists pgcrypto;

create type public.content_status as enum ('draft','published');
create type public.inquiry_status as enum ('new','in_progress','won','closed','spam');
create type public.permission_action as enum ('view','create','edit','delete','publish','export','assign');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  is_system_owner boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.permission_groups (id uuid primary key default gen_random_uuid(), name text unique not null, description text not null default '', created_at timestamptz not null default now());
create table public.group_permissions (group_id uuid not null references public.permission_groups(id) on delete cascade, resource text not null check (resource in ('pages','products','media','inquiries','users','permission_groups','settings','audit_logs')), action public.permission_action not null, primary key(group_id,resource,action));
create table public.profile_groups (profile_id uuid not null references public.profiles(id) on delete cascade, group_id uuid not null references public.permission_groups(id) on delete cascade, primary key(profile_id,group_id));

create table public.pages (id uuid primary key default gen_random_uuid(), slug text unique not null, status public.content_status not null default 'draft', layout_key text not null default 'default', sort_order integer not null default 0, is_enabled boolean not null default true, version integer not null default 1, deleted_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table public.page_translations (page_id uuid not null references public.pages(id) on delete cascade, locale text not null check(locale in ('zh','en','ar')), title text not null, body jsonb not null default '{}'::jsonb, seo_title text not null, seo_description text not null, primary key(page_id,locale));
create table public.products (id uuid primary key default gen_random_uuid(), slug text unique not null, category text not null check(category in ('bra-pads','cups','custom-development')), status public.content_status not null default 'draft', sort_order integer not null default 0, version integer not null default 1, deleted_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table public.product_translations (product_id uuid not null references public.products(id) on delete cascade, locale text not null check(locale in ('zh','en','ar')), name text not null, summary text not null, description text not null, primary key(product_id,locale));
create table public.media (id uuid primary key default gen_random_uuid(), storage_path text unique not null, mime_type text not null check(mime_type in ('image/jpeg','image/png','image/webp')), byte_size bigint not null check(byte_size between 1 and 10485760), width integer not null check(width>0), height integer not null check(height>0), variants jsonb not null default '{}'::jsonb, deleted_at timestamptz, created_at timestamptz not null default now());
create table public.product_images (id uuid primary key default gen_random_uuid(), product_id uuid not null references public.products(id) on delete cascade, media_id uuid not null references public.media(id), sort_order integer not null default 0, alt_text jsonb not null check(alt_text ?& array['zh','en','ar']), unique(product_id,sort_order));
create table public.product_specifications (id uuid primary key default gen_random_uuid(), product_id uuid not null references public.products(id) on delete cascade, label jsonb not null check(label ?& array['zh','en','ar']), value jsonb not null check(value ?& array['zh','en','ar']), sort_order integer not null default 0);
create table public.customization_dimensions (id uuid primary key default gen_random_uuid(), key text unique not null, label jsonb not null check(label ?& array['zh','en','ar']), options jsonb not null default '[]'::jsonb, sort_order integer not null default 0, is_enabled boolean not null default true, version integer not null default 1, deleted_at timestamptz);

create table public.published_versions (id uuid primary key default gen_random_uuid(), resource_type text not null check(resource_type in ('page','product','customization')), resource_id uuid not null, version integer not null, snapshot jsonb not null, published_by uuid references public.profiles(id), created_at timestamptz not null default now(), unique(resource_type,resource_id,version));
create table public.site_settings (key text primary key, value jsonb not null, version integer not null default 1, updated_by uuid references public.profiles(id), updated_at timestamptz not null default now());

create table public.inquiries (id uuid primary key, name text not null, company text not null, country_code text not null check(length(country_code)=2), email text not null, phone_whatsapp text not null, product_category text not null check(product_category in ('bra-pads','cups','custom-development')), product_id text, estimated_quantity text not null, message text not null default '', locale text not null check(locale in ('zh','en','ar')), privacy_consent boolean not null check(privacy_consent), status public.inquiry_status not null default 'new', assignee_id uuid references public.profiles(id), deleted_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table public.inquiry_followups (id uuid primary key default gen_random_uuid(), inquiry_id uuid not null references public.inquiries(id) on delete cascade, author_id uuid not null references public.profiles(id), note text not null, previous_status public.inquiry_status, next_status public.inquiry_status, created_at timestamptz not null default now());
create table public.inquiry_rate_limits (id bigint generated always as identity primary key, ip_hash text not null, email text not null, created_at timestamptz not null default now());
create table public.email_outbox (id uuid primary key default gen_random_uuid(), inquiry_id uuid not null references public.inquiries(id) on delete cascade, kind text not null check(kind in ('owner_notification','customer_confirmation')), recipient text not null, locale text not null check(locale in ('zh','en','ar')), status text not null default 'pending' check(status in ('pending','sending','sent','failed')), attempts integer not null default 0, next_attempt_at timestamptz not null default now(), last_error text, sent_at timestamptz, created_at timestamptz not null default now());
create table public.audit_logs (id bigint generated always as identity primary key, actor_id uuid references public.profiles(id), action text not null, resource_type text not null, resource_id text not null, before_data jsonb, after_data jsonb, created_at timestamptz not null default now());

create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path='' as $$ begin insert into public.profiles(id,display_name) values(new.id,coalesce(new.raw_user_meta_data->>'display_name',split_part(new.email,'@',1))); return new; end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

create index pages_public_idx on public.pages(sort_order) where status='published' and deleted_at is null and is_enabled;
create index products_category_public_idx on public.products(category,sort_order,id) where status='published' and deleted_at is null;
create index product_translations_product_idx on public.product_translations(product_id);
create index product_images_product_idx on public.product_images(product_id,sort_order);
create index product_specs_product_idx on public.product_specifications(product_id,sort_order);
create index inquiries_status_created_idx on public.inquiries(status,created_at desc) where deleted_at is null;
create index inquiries_assignee_idx on public.inquiries(assignee_id) where deleted_at is null;
create index inquiry_followups_inquiry_idx on public.inquiry_followups(inquiry_id,created_at desc);
create index rate_limits_ip_idx on public.inquiry_rate_limits(ip_hash,created_at desc);
create index rate_limits_email_idx on public.inquiry_rate_limits(email,created_at desc);
create index outbox_retry_idx on public.email_outbox(next_attempt_at) where status in ('pending','failed');
create index audit_resource_idx on public.audit_logs(resource_type,resource_id,created_at desc);

create or replace function public.enforce_product_image_limit() returns trigger language plpgsql set search_path='' as $$ begin if (select count(*) from public.product_images where product_id=new.product_id)>=10 then raise exception 'A product can have at most 10 images'; end if; return new; end $$;
create trigger product_image_limit before insert on public.product_images for each row execute function public.enforce_product_image_limit();

create or replace function public.has_permission(p_resource text,p_action public.permission_action) returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.is_active and (p.is_system_owner or exists(select 1 from public.profile_groups pg join public.group_permissions gp on gp.group_id=pg.group_id where pg.profile_id=p.id and gp.resource=p_resource and gp.action=p_action)));
$$;
revoke all on function public.has_permission(text,public.permission_action) from public; grant execute on function public.has_permission(text,public.permission_action) to authenticated;

create or replace function public.check_and_record_inquiry_rate_limit(p_ip_hash text,p_email text) returns boolean language plpgsql security definer set search_path='' as $$
declare ip_count integer; email_count integer; begin
  select count(*) into ip_count from public.inquiry_rate_limits where ip_hash=p_ip_hash and created_at>now()-interval '24 hours';
  select count(*) into email_count from public.inquiry_rate_limits where email=lower(p_email) and created_at>now()-interval '24 hours';
  if ip_count>=8 or email_count>=4 then return false; end if;
  insert into public.inquiry_rate_limits(ip_hash,email) values(p_ip_hash,lower(p_email)); return true;
end $$;
revoke all on function public.check_and_record_inquiry_rate_limit(text,text) from public;

create or replace function public.accept_inquiry(p_id uuid,p_payload jsonb,p_country_code text,p_owner_email text) returns void language plpgsql security definer set search_path='' as $$
begin
  insert into public.inquiries(id,name,company,country_code,email,phone_whatsapp,product_category,product_id,estimated_quantity,message,locale,privacy_consent)
  values(p_id,p_payload->>'name',p_payload->>'company',upper(p_country_code),lower(p_payload->>'email'),p_payload->>'phoneWhatsApp',p_payload->>'productCategory',nullif(p_payload->>'productId',''),p_payload->>'estimatedQuantity',coalesce(p_payload->>'message',''),p_payload->>'locale',true);
  insert into public.email_outbox(inquiry_id,kind,recipient,locale) values
    (p_id,'owner_notification',p_owner_email,p_payload->>'locale'),
    (p_id,'customer_confirmation',lower(p_payload->>'email'),p_payload->>'locale');
end $$;
revoke all on function public.accept_inquiry(uuid,jsonb,text,text) from public;
grant execute on function public.accept_inquiry(uuid,jsonb,text,text) to service_role;
grant execute on function public.check_and_record_inquiry_rate_limit(text,text) to service_role;

create or replace function public.product_payload(p public.products) returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object(
    'id',p.id::text,'slug',p.slug,'category',p.category,'status',p.status::text,'sortOrder',p.sort_order,'deletedAt',p.deleted_at,
    'translations',(select jsonb_object_agg(t.locale,jsonb_build_object('name',t.name,'summary',t.summary,'description',t.description)) from public.product_translations t where t.product_id=p.id),
    'images',coalesce((select jsonb_agg(jsonb_build_object('id',pi.id::text,'url',m.storage_path,'alt',pi.alt_text,'sortOrder',pi.sort_order) order by pi.sort_order) from public.product_images pi join public.media m on m.id=pi.media_id where pi.product_id=p.id and m.deleted_at is null),'[]'::jsonb),
    'specifications',coalesce((select jsonb_agg(jsonb_build_object('id',s.id::text,'label',s.label,'value',s.value,'sortOrder',s.sort_order) order by s.sort_order) from public.product_specifications s where s.product_id=p.id),'[]'::jsonb)
  );
$$;
revoke all on function public.product_payload(public.products) from public;
grant execute on function public.product_payload(public.products) to service_role;

create or replace function public.list_published_products(p_category text,p_limit integer,p_cursor_order integer default null,p_cursor_id uuid default null) returns table(payload jsonb) language sql stable security definer set search_path='' as $$
  select public.product_payload(p) from public.products p
  where p.category=p_category and p.status='published' and p.deleted_at is null
    and (p_cursor_order is null or (p.sort_order,p.id)>(p_cursor_order,p_cursor_id))
  order by p.sort_order,p.id limit least(greatest(p_limit,1),25);
$$;
revoke all on function public.list_published_products(text,integer,integer,uuid) from public;
grant execute on function public.list_published_products(text,integer,integer,uuid) to service_role;

create or replace function public.get_published_product(p_slug text) returns table(payload jsonb) language sql stable security definer set search_path='' as $$
  select public.product_payload(p) from public.products p where p.slug=p_slug and p.status='published' and p.deleted_at is null limit 1;
$$;
revoke all on function public.get_published_product(text) from public;
grant execute on function public.get_published_product(text) to service_role;

create or replace function public.publish_page_version(p_page_id uuid,p_expected_version integer,p_actor uuid) returns integer language plpgsql security definer set search_path='' as $$
declare v_page public.pages; v_snapshot jsonb; v_new_version integer; begin
  if p_actor is distinct from (select auth.uid()) or not public.has_permission('pages','publish') then raise exception 'forbidden'; end if;
  if (select count(*) from public.page_translations t where t.page_id=p_page_id and t.locale in('zh','en','ar') and length(trim(t.title))>0 and length(trim(t.seo_title))>0 and length(trim(t.seo_description))>0 and t.body<>'{}'::jsonb)<>3 then raise exception 'incomplete translations'; end if;
  update public.pages set status='published',version=version+1,updated_at=now() where id=p_page_id and version=p_expected_version and deleted_at is null returning * into v_page;
  if v_page.id is null then raise exception 'version conflict'; end if; v_new_version:=v_page.version;
  select jsonb_build_object('page',to_jsonb(v_page),'translations',jsonb_object_agg(t.locale,to_jsonb(t)-'page_id')) into v_snapshot from public.page_translations t where t.page_id=p_page_id;
  insert into public.published_versions(resource_type,resource_id,version,snapshot,published_by) values('page',p_page_id,v_new_version,v_snapshot,p_actor);
  insert into public.audit_logs(actor_id,action,resource_type,resource_id,after_data) values(p_actor,'publish','page',p_page_id::text,v_snapshot);
  return v_new_version;
end $$;
revoke all on function public.publish_page_version(uuid,integer,uuid) from public; grant execute on function public.publish_page_version(uuid,integer,uuid) to authenticated;

create or replace function public.rollback_page_version(p_page_id uuid,p_target_version integer,p_expected_version integer,p_actor uuid) returns integer language plpgsql security definer set search_path='' as $$
declare v_snapshot jsonb; v_new_version integer; v_item record; begin
  if p_actor is distinct from (select auth.uid()) or not public.has_permission('pages','publish') then raise exception 'forbidden'; end if;
  select snapshot into v_snapshot from public.published_versions where resource_type='page' and resource_id=p_page_id and version=p_target_version;
  if v_snapshot is null then raise exception 'version not found'; end if;
  update public.pages set status='published',layout_key=v_snapshot->'page'->>'layout_key',sort_order=(v_snapshot->'page'->>'sort_order')::integer,is_enabled=(v_snapshot->'page'->>'is_enabled')::boolean,version=version+1,updated_at=now() where id=p_page_id and version=p_expected_version and deleted_at is null returning version into v_new_version;
  if v_new_version is null then raise exception 'version conflict'; end if;
  delete from public.page_translations where page_id=p_page_id;
  for v_item in select key,value from jsonb_each(v_snapshot->'translations') loop insert into public.page_translations(page_id,locale,title,body,seo_title,seo_description) values(p_page_id,v_item.key,v_item.value->>'title',v_item.value->'body',v_item.value->>'seo_title',v_item.value->>'seo_description'); end loop;
  insert into public.published_versions(resource_type,resource_id,version,snapshot,published_by) values('page',p_page_id,v_new_version,v_snapshot || jsonb_build_object('rolledBackFrom',p_target_version),p_actor);
  insert into public.audit_logs(actor_id,action,resource_type,resource_id,after_data) values(p_actor,'rollback','page',p_page_id::text,jsonb_build_object('targetVersion',p_target_version,'newVersion',v_new_version));
  return v_new_version;
end $$;
revoke all on function public.rollback_page_version(uuid,integer,integer,uuid) from public; grant execute on function public.rollback_page_version(uuid,integer,integer,uuid) to authenticated;

create or replace function public.publish_product_version(p_product_id uuid,p_expected_version integer,p_actor uuid) returns integer language plpgsql security definer set search_path='' as $$
declare v_product public.products; v_snapshot jsonb; v_new_version integer; begin
  if p_actor is distinct from (select auth.uid()) or not public.has_permission('products','publish') then raise exception 'forbidden'; end if;
  if (select count(*) from public.product_translations t where t.product_id=p_product_id and t.locale in('zh','en','ar') and length(trim(t.name))>0 and length(trim(t.summary))>0 and length(trim(t.description))>0)<>3 then raise exception 'incomplete translations'; end if;
  if (select count(*) from public.product_images where product_id=p_product_id) not between 1 and 10 then raise exception 'invalid image count'; end if;
  update public.products set status='published',version=version+1,updated_at=now() where id=p_product_id and version=p_expected_version and deleted_at is null returning * into v_product;
  if v_product.id is null then raise exception 'version conflict'; end if; v_new_version:=v_product.version;
  select jsonb_build_object('product',to_jsonb(v_product),'translations',(select jsonb_object_agg(t.locale,to_jsonb(t)-'product_id') from public.product_translations t where t.product_id=p_product_id),'images',coalesce((select jsonb_agg(to_jsonb(i)-'product_id' order by i.sort_order) from public.product_images i where i.product_id=p_product_id),'[]'::jsonb),'specifications',coalesce((select jsonb_agg(to_jsonb(s)-'product_id' order by s.sort_order) from public.product_specifications s where s.product_id=p_product_id),'[]'::jsonb)) into v_snapshot;
  insert into public.published_versions(resource_type,resource_id,version,snapshot,published_by) values('product',p_product_id,v_new_version,v_snapshot,p_actor);
  insert into public.audit_logs(actor_id,action,resource_type,resource_id,after_data) values(p_actor,'publish','product',p_product_id::text,v_snapshot); return v_new_version;
end $$;
revoke all on function public.publish_product_version(uuid,integer,uuid) from public; grant execute on function public.publish_product_version(uuid,integer,uuid) to authenticated;

create or replace function public.rollback_product_version(p_product_id uuid,p_target_version integer,p_expected_version integer,p_actor uuid) returns integer language plpgsql security definer set search_path='' as $$
declare v_snapshot jsonb; v_new_version integer; v_item jsonb; v_pair record; begin
  if p_actor is distinct from (select auth.uid()) or not public.has_permission('products','publish') then raise exception 'forbidden'; end if;
  select snapshot into v_snapshot from public.published_versions where resource_type='product' and resource_id=p_product_id and version=p_target_version;
  if v_snapshot is null then raise exception 'version not found'; end if;
  update public.products set status='published',category=v_snapshot->'product'->>'category',sort_order=(v_snapshot->'product'->>'sort_order')::integer,version=version+1,updated_at=now() where id=p_product_id and version=p_expected_version and deleted_at is null returning version into v_new_version;
  if v_new_version is null then raise exception 'version conflict'; end if;
  delete from public.product_translations where product_id=p_product_id; for v_pair in select key,value from jsonb_each(v_snapshot->'translations') loop insert into public.product_translations(product_id,locale,name,summary,description) values(p_product_id,v_pair.key,v_pair.value->>'name',v_pair.value->>'summary',v_pair.value->>'description'); end loop;
  delete from public.product_images where product_id=p_product_id; for v_item in select value from jsonb_array_elements(v_snapshot->'images') loop insert into public.product_images(id,product_id,media_id,sort_order,alt_text) values((v_item->>'id')::uuid,p_product_id,(v_item->>'media_id')::uuid,(v_item->>'sort_order')::integer,v_item->'alt_text'); end loop;
  delete from public.product_specifications where product_id=p_product_id; for v_item in select value from jsonb_array_elements(v_snapshot->'specifications') loop insert into public.product_specifications(id,product_id,label,value,sort_order) values((v_item->>'id')::uuid,p_product_id,v_item->'label',v_item->'value',(v_item->>'sort_order')::integer); end loop;
  insert into public.published_versions(resource_type,resource_id,version,snapshot,published_by) values('product',p_product_id,v_new_version,v_snapshot || jsonb_build_object('rolledBackFrom',p_target_version),p_actor);
  insert into public.audit_logs(actor_id,action,resource_type,resource_id,after_data) values(p_actor,'rollback','product',p_product_id::text,jsonb_build_object('targetVersion',p_target_version,'newVersion',v_new_version)); return v_new_version;
end $$;
revoke all on function public.rollback_product_version(uuid,integer,integer,uuid) from public; grant execute on function public.rollback_product_version(uuid,integer,integer,uuid) to authenticated;

alter table public.profiles enable row level security; alter table public.permission_groups enable row level security; alter table public.group_permissions enable row level security; alter table public.profile_groups enable row level security;
alter table public.pages enable row level security; alter table public.page_translations enable row level security; alter table public.products enable row level security; alter table public.product_translations enable row level security; alter table public.media enable row level security; alter table public.product_images enable row level security; alter table public.product_specifications enable row level security; alter table public.customization_dimensions enable row level security; alter table public.published_versions enable row level security; alter table public.site_settings enable row level security;
alter table public.inquiries enable row level security; alter table public.inquiry_followups enable row level security; alter table public.inquiry_rate_limits enable row level security; alter table public.email_outbox enable row level security; alter table public.audit_logs enable row level security;

create policy pages_public_read on public.pages for select to anon,authenticated using(status='published' and deleted_at is null and is_enabled or public.has_permission('pages','view'));
create policy page_translations_public_read on public.page_translations for select to anon,authenticated using(exists(select 1 from public.pages p where p.id=page_id and p.status='published' and p.deleted_at is null and p.is_enabled) or public.has_permission('pages','view'));
create policy products_public_read on public.products for select to anon,authenticated using(status='published' and deleted_at is null or public.has_permission('products','view'));
create policy product_translations_public_read on public.product_translations for select to anon,authenticated using(exists(select 1 from public.products p where p.id=product_id and p.status='published' and p.deleted_at is null) or public.has_permission('products','view'));
create policy product_images_public_read on public.product_images for select to anon,authenticated using(exists(select 1 from public.products p where p.id=product_id and p.status='published' and p.deleted_at is null) or public.has_permission('products','view'));
create policy product_specs_public_read on public.product_specifications for select to anon,authenticated using(exists(select 1 from public.products p where p.id=product_id and p.status='published' and p.deleted_at is null) or public.has_permission('products','view'));
create policy media_public_read on public.media for select to anon,authenticated using(deleted_at is null and exists(select 1 from public.product_images pi join public.products p on p.id=pi.product_id where pi.media_id=media.id and p.status='published' and p.deleted_at is null) or public.has_permission('media','view'));

create policy pages_manage on public.pages for all to authenticated using(public.has_permission('pages','view')) with check(public.has_permission('pages','edit'));
create policy page_translations_manage on public.page_translations for all to authenticated using(public.has_permission('pages','view')) with check(public.has_permission('pages','edit'));
create policy products_manage on public.products for all to authenticated using(public.has_permission('products','view')) with check(public.has_permission('products','edit'));
create policy product_translations_manage on public.product_translations for all to authenticated using(public.has_permission('products','view')) with check(public.has_permission('products','edit'));
create policy product_images_manage on public.product_images for all to authenticated using(public.has_permission('products','view')) with check(public.has_permission('products','edit'));
create policy product_specs_manage on public.product_specifications for all to authenticated using(public.has_permission('products','view')) with check(public.has_permission('products','edit'));
create policy inquiries_read on public.inquiries for select to authenticated using(public.has_permission('inquiries','view'));
create policy inquiries_manage on public.inquiries for update to authenticated using(public.has_permission('inquiries','edit')) with check(public.has_permission('inquiries','edit'));
create policy followups_manage on public.inquiry_followups for all to authenticated using(public.has_permission('inquiries','view')) with check(public.has_permission('inquiries','edit') and author_id=(select auth.uid()));
create policy audit_read on public.audit_logs for select to authenticated using(public.has_permission('audit_logs','view'));
create policy settings_manage on public.site_settings for all to authenticated using(public.has_permission('settings','view')) with check(public.has_permission('settings','edit'));
create policy versions_read on public.published_versions for select to authenticated using(public.has_permission('pages','view') or public.has_permission('products','view'));

revoke all on all tables in schema public from anon;
grant select on public.pages,public.page_translations,public.products,public.product_translations,public.product_images,public.product_specifications,public.media to anon;
grant select,insert,update,delete on all tables in schema public to authenticated;
grant usage,select on all sequences in schema public to authenticated;

insert into public.permission_groups(name,description) values ('内容管理员','页面、产品和媒体维护'),('销售跟进','合作意向查看、分配和跟进'),('审计员','只读审计与配置');
insert into public.group_permissions(group_id,resource,action)
select g.id,r.resource,a.action::public.permission_action from public.permission_groups g cross join (values('pages'),('products'),('media')) r(resource) cross join (values('view'),('create'),('edit'),('delete'),('publish')) a(action) where g.name='内容管理员';
insert into public.group_permissions(group_id,resource,action)
select g.id,'inquiries',a.action::public.permission_action from public.permission_groups g cross join (values('view'),('edit'),('export'),('assign')) a(action) where g.name='销售跟进';
insert into public.group_permissions(group_id,resource,action)
select g.id,r.resource,'view'::public.permission_action from public.permission_groups g cross join (values('audit_logs'),('settings')) r(resource) where g.name='审计员';

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('media','media',true,10485760,array['image/jpeg','image/png','image/webp']) on conflict(id) do update set file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
create policy media_storage_public_read on storage.objects for select to anon,authenticated using(bucket_id='media');
create policy media_storage_create on storage.objects for insert to authenticated with check(bucket_id='media' and public.has_permission('media','create'));
create policy media_storage_update on storage.objects for update to authenticated using(bucket_id='media' and public.has_permission('media','edit')) with check(bucket_id='media' and public.has_permission('media','edit'));
create policy media_storage_delete on storage.objects for delete to authenticated using(bucket_id='media' and public.has_permission('media','delete'));
