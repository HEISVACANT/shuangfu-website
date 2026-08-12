-- Site content CMS hardening V1.6.
-- This migration follows the already-applied V1.5 migration. It deliberately
-- extends that schema without rewriting V1.5 history.

create or replace function public.is_public_media_v1_6(p_media_id uuid)
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
revoke all on function public.is_public_media_v1_6(uuid) from public;
grant execute on function public.is_public_media_v1_6(uuid) to anon, authenticated;

drop policy if exists media_public_read on public.media;
drop policy if exists media_authenticated_read on public.media;
create policy media_public_read
  on public.media
  for select
  to anon
  using (
    deleted_at is null
    and public.is_public_media_v1_6(media.id)
  );

create policy media_authenticated_read
  on public.media
  for select
  to authenticated
  using (
    deleted_at is null
    and (
      public.is_public_media_v1_6(media.id)
      or public.has_permission('media', 'view')
    )
  );

alter function public.save_site_content_v1(jsonb, jsonb)
  rename to save_site_content_v1_5;

create or replace function public.validate_site_content_payload_v1_6(
  p_payload jsonb
)
returns void
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_about jsonb;
  v_contact jsonb;
  v_email text;
  v_phone text;
  v_text text;
begin
  for v_text in
    with recursive payload_values(value) as (
      select p_payload
      union all
      select child.value
      from payload_values parent
      cross join lateral (
        select object_item.value
        from jsonb_each(
          case
            when jsonb_typeof(parent.value) = 'object' then parent.value
            else '{}'::jsonb
          end
        ) object_item
        union all
        select array_item.value
        from jsonb_array_elements(
          case
            when jsonb_typeof(parent.value) = 'array' then parent.value
            else '[]'::jsonb
          end
        ) array_item
      ) child
    )
    select value #>> '{}'
    from payload_values
    where jsonb_typeof(value) = 'string'
  loop
    if char_length(v_text) > 3000 then
      raise exception using
        errcode = '22023',
        message = 'site_content_text_too_long';
    end if;
  end loop;

  select section
  into v_about
  from jsonb_array_elements(
    case
      when jsonb_typeof(p_payload->'sections') = 'array'
        then p_payload->'sections'
      else '[]'::jsonb
    end
  ) section
  where section->>'key' = 'about'
  limit 1;

  if v_about is not null
    and (
      jsonb_typeof(v_about->'facts') is distinct from 'array'
      or jsonb_array_length(v_about->'facts') <> 3
    ) then
    raise exception using
      errcode = '22023',
      message = 'invalid_about_fact_count';
  end if;

  select section
  into v_contact
  from jsonb_array_elements(
    case
      when jsonb_typeof(p_payload->'sections') = 'array'
        then p_payload->'sections'
      else '[]'::jsonb
    end
  ) section
  where section->>'key' = 'contact'
  limit 1;

  if v_contact is not null then
    v_phone := v_contact->'shared'->>'phone';
    v_email := v_contact->'shared'->>'email';
    if v_phone is not null and char_length(v_phone) > 60 then
      raise exception using
        errcode = '22023',
        message = 'site_content_phone_too_long';
    end if;
    if v_email is not null and char_length(v_email) > 254 then
      raise exception using
        errcode = '22023',
        message = 'site_content_email_too_long';
    end if;
  end if;
end
$$;

revoke all on function public.validate_site_content_payload_v1_6(jsonb)
  from public, anon, authenticated;
revoke all on function public.save_site_content_v1_5(jsonb,jsonb)
  from public, anon, authenticated;

create or replace function public.save_site_content_v1(
  p_payload jsonb,
  p_baseline jsonb
)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.validate_site_content_payload_v1_6(p_payload);
  return public.save_site_content_v1_5(p_payload, p_baseline);
end
$$;

revoke all on function public.save_site_content_v1(jsonb,jsonb)
  from public, anon;
grant execute on function public.save_site_content_v1(jsonb,jsonb)
  to authenticated;
