-- Move the media visibility predicate out of the public API schema.
-- Media read policies remain available to the public website, while the
-- SECURITY DEFINER function itself is not exposed as a public RPC surface.

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to anon, authenticated;

create or replace function private.is_public_media_v1_7(p_media_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    exists (
      select 1
      from public.product_images image
      join public.products product on product.id = image.product_id
      where image.media_id = p_media_id
        and product.status = 'published'
        and product.deleted_at is null
    )
    or exists (
      select 1
      from public.site_sections section
      where section.media_id = p_media_id
        and section.key in ('home', 'about')
    )
$$;

revoke all on function private.is_public_media_v1_7(uuid) from public;
grant execute on function private.is_public_media_v1_7(uuid) to anon, authenticated;

drop policy if exists media_public_read on public.media;
drop policy if exists media_authenticated_read on public.media;
create policy media_public_read
  on public.media
  for select
  to anon
  using (
    deleted_at is null
    and private.is_public_media_v1_7(media.id)
  );

create policy media_authenticated_read
  on public.media
  for select
  to authenticated
  using (
    deleted_at is null
    and (
      private.is_public_media_v1_7(media.id)
      or public.has_permission('media', 'view')
    )
  );

revoke all on function public.is_public_media_v1_6(uuid) from public, anon, authenticated;
drop function if exists public.is_public_media_v1_6(uuid);
