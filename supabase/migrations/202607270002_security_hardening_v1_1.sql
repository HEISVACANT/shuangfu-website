-- Shuangfu corporate site schema security hardening V1.1

-- Trigger functions do not need to remain callable through the Data API.
revoke all on function public.handle_new_user() from public;

create unique index if not exists profiles_single_system_owner_idx
  on public.profiles (is_system_owner)
  where is_system_owner;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name, is_system_owner)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)),
    not exists (select 1 from public.profiles)
  );
  return new;
end
$$;

revoke all on function public.handle_new_user() from public;

create or replace function public.protect_system_owner()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.is_system_owner and (
    tg_op = 'DELETE'
    or not new.is_system_owner
    or not new.is_active
  ) then
    raise exception 'system owner cannot be deleted, demoted, or disabled';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end
$$;

revoke all on function public.protect_system_owner() from public;
create trigger protect_system_owner
before update or delete on public.profiles
for each row execute function public.protect_system_owner();

-- Replace broad FOR ALL policies with action-specific permission checks.
drop policy if exists pages_manage on public.pages;
drop policy if exists page_translations_manage on public.page_translations;
drop policy if exists products_manage on public.products;
drop policy if exists product_translations_manage on public.product_translations;
drop policy if exists product_images_manage on public.product_images;
drop policy if exists product_specs_manage on public.product_specifications;
drop policy if exists followups_manage on public.inquiry_followups;
drop policy if exists settings_manage on public.site_settings;

create policy pages_create on public.pages for insert to authenticated
  with check (public.has_permission('pages', 'create'));
create policy pages_update on public.pages for update to authenticated
  using (public.has_permission('pages', 'edit'))
  with check (public.has_permission('pages', 'edit'));
create policy pages_delete on public.pages for delete to authenticated
  using (public.has_permission('pages', 'delete'));

create policy page_translations_create on public.page_translations for insert to authenticated
  with check (public.has_permission('pages', 'create'));
create policy page_translations_update on public.page_translations for update to authenticated
  using (public.has_permission('pages', 'edit'))
  with check (public.has_permission('pages', 'edit'));
create policy page_translations_delete on public.page_translations for delete to authenticated
  using (public.has_permission('pages', 'delete'));

create policy products_create on public.products for insert to authenticated
  with check (public.has_permission('products', 'create'));
create policy products_update on public.products for update to authenticated
  using (public.has_permission('products', 'edit'))
  with check (public.has_permission('products', 'edit'));
create policy products_delete on public.products for delete to authenticated
  using (public.has_permission('products', 'delete'));

create policy product_translations_create on public.product_translations for insert to authenticated
  with check (public.has_permission('products', 'create'));
create policy product_translations_update on public.product_translations for update to authenticated
  using (public.has_permission('products', 'edit'))
  with check (public.has_permission('products', 'edit'));
create policy product_translations_delete on public.product_translations for delete to authenticated
  using (public.has_permission('products', 'delete'));

create policy product_images_create on public.product_images for insert to authenticated
  with check (public.has_permission('products', 'edit'));
create policy product_images_update on public.product_images for update to authenticated
  using (public.has_permission('products', 'edit'))
  with check (public.has_permission('products', 'edit'));
create policy product_images_delete on public.product_images for delete to authenticated
  using (public.has_permission('products', 'edit'));

create policy product_specs_create on public.product_specifications for insert to authenticated
  with check (public.has_permission('products', 'edit'));
create policy product_specs_update on public.product_specifications for update to authenticated
  using (public.has_permission('products', 'edit'))
  with check (public.has_permission('products', 'edit'));
create policy product_specs_delete on public.product_specifications for delete to authenticated
  using (public.has_permission('products', 'edit'));

create policy media_create on public.media for insert to authenticated
  with check (public.has_permission('media', 'create'));
create policy media_update on public.media for update to authenticated
  using (public.has_permission('media', 'edit'))
  with check (public.has_permission('media', 'edit'));
create policy media_delete on public.media for delete to authenticated
  using (public.has_permission('media', 'delete'));

create policy customization_public_read on public.customization_dimensions for select to anon, authenticated
  using (is_enabled and deleted_at is null or public.has_permission('products', 'view'));
create policy customization_create on public.customization_dimensions for insert to authenticated
  with check (public.has_permission('products', 'create'));
create policy customization_update on public.customization_dimensions for update to authenticated
  using (public.has_permission('products', 'edit'))
  with check (public.has_permission('products', 'edit'));
create policy customization_delete on public.customization_dimensions for delete to authenticated
  using (public.has_permission('products', 'delete'));

create policy followups_read on public.inquiry_followups for select to authenticated
  using (public.has_permission('inquiries', 'view'));
create policy followups_create on public.inquiry_followups for insert to authenticated
  with check (
    public.has_permission('inquiries', 'edit')
    and author_id = (select auth.uid())
  );
create policy followups_update on public.inquiry_followups for update to authenticated
  using (public.has_permission('inquiries', 'edit'))
  with check (public.has_permission('inquiries', 'edit'));
create policy followups_delete on public.inquiry_followups for delete to authenticated
  using (public.has_permission('inquiries', 'delete'));

create policy settings_read on public.site_settings for select to authenticated
  using (public.has_permission('settings', 'view'));
create policy settings_create on public.site_settings for insert to authenticated
  with check (public.has_permission('settings', 'create'));
create policy settings_update on public.site_settings for update to authenticated
  using (public.has_permission('settings', 'edit'))
  with check (public.has_permission('settings', 'edit'));
create policy settings_delete on public.site_settings for delete to authenticated
  using (public.has_permission('settings', 'delete'));

-- User and permission administration policies.
create policy profiles_read on public.profiles for select to authenticated
  using (id = (select auth.uid()) or public.has_permission('users', 'view'));
create policy profiles_update on public.profiles for update to authenticated
  using (public.has_permission('users', 'edit'))
  with check (public.has_permission('users', 'edit'));
create policy profiles_delete on public.profiles for delete to authenticated
  using (public.has_permission('users', 'delete'));

create policy permission_groups_read on public.permission_groups for select to authenticated
  using (public.has_permission('permission_groups', 'view'));
create policy permission_groups_create on public.permission_groups for insert to authenticated
  with check (public.has_permission('permission_groups', 'create'));
create policy permission_groups_update on public.permission_groups for update to authenticated
  using (public.has_permission('permission_groups', 'edit'))
  with check (public.has_permission('permission_groups', 'edit'));
create policy permission_groups_delete on public.permission_groups for delete to authenticated
  using (public.has_permission('permission_groups', 'delete'));

create policy group_permissions_read on public.group_permissions for select to authenticated
  using (public.has_permission('permission_groups', 'view'));
create policy group_permissions_create on public.group_permissions for insert to authenticated
  with check (public.has_permission('permission_groups', 'edit'));
create policy group_permissions_update on public.group_permissions for update to authenticated
  using (public.has_permission('permission_groups', 'edit'))
  with check (public.has_permission('permission_groups', 'edit'));
create policy group_permissions_delete on public.group_permissions for delete to authenticated
  using (public.has_permission('permission_groups', 'edit'));

create policy profile_groups_read on public.profile_groups for select to authenticated
  using (public.has_permission('users', 'view'));
create policy profile_groups_create on public.profile_groups for insert to authenticated
  with check (public.has_permission('users', 'edit'));
create policy profile_groups_delete on public.profile_groups for delete to authenticated
  using (public.has_permission('users', 'edit'));

-- Audit rows are append-only and an authenticated actor may only attribute
-- an event to their own active profile.
create policy audit_insert_own on public.audit_logs for insert to authenticated
  with check (
    actor_id = (select auth.uid())
    and exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid()) and p.is_active
    )
  );
