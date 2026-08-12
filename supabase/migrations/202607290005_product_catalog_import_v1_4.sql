-- Shuangfu recoverable product catalog import V1.4

create or replace function public.replace_product_catalog_v1(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_product jsonb;
  v_translation jsonb;
  v_image jsonb;
  v_specification jsonb;
  v_product_id uuid;
  v_media_id uuid;
  v_locale text;
  v_image_count integer := 0;
  v_image_sort_order integer;
  v_specification_sort_order integer;
begin
  if jsonb_typeof(p_payload)<>'object' or p_payload->>'version'<>'1.0' then
    raise exception 'invalid product catalog version' using errcode='22023';
  end if;

  if jsonb_typeof(p_payload->'products')<>'array'
    or jsonb_array_length(p_payload->'products')<>10 then
    raise exception 'product catalog must contain exactly 10 products' using errcode='22023';
  end if;

  if (
    select count(distinct item->>'slug')
    from jsonb_array_elements(p_payload->'products') as catalog(item)
  )<>10 then
    raise exception 'product slugs must be unique' using errcode='22023';
  end if;

  if (
    select count(distinct (item->>'sortOrder')::integer)
    from jsonb_array_elements(p_payload->'products') as catalog(item)
    where (item->>'sortOrder')~'^[1-9][0-9]*$'
      and (item->>'sortOrder')::integer between 1 and 10
  )<>10 then
    raise exception 'product sort orders must be the integers 1 through 10' using errcode='22023';
  end if;

  for v_product in
    select value from jsonb_array_elements(p_payload->'products')
  loop
    if length(trim(coalesce(v_product->>'slug','')))=0
      or v_product->>'category' not in ('bra-pads','cups') then
      raise exception 'invalid product identity' using errcode='22023';
    end if;

    if jsonb_typeof(v_product->'translations')<>'object'
      or not coalesce(v_product->'translations' ?& array['zh','en','ar'],false) then
      raise exception 'incomplete product translations' using errcode='22023';
    end if;

    foreach v_locale in array array['zh','en','ar']
    loop
      v_translation:=v_product->'translations'->v_locale;
      if jsonb_typeof(v_translation)<>'object'
        or length(trim(coalesce(v_translation->>'name','')))=0
        or length(trim(coalesce(v_translation->>'summary','')))=0
        or length(trim(coalesce(v_translation->>'description','')))=0 then
        raise exception 'incomplete product translation for locale %',v_locale using errcode='22023';
      end if;
    end loop;

    if jsonb_typeof(v_product->'images')<>'array'
      or jsonb_array_length(v_product->'images') not between 1 and 10 then
      raise exception 'each product must contain between 1 and 10 images' using errcode='22023';
    end if;

    for v_image in
      select value from jsonb_array_elements(v_product->'images')
    loop
      if length(trim(coalesce(v_image->>'storagePath','')))=0
        or length(trim(coalesce(v_image->>'publicUrl','')))=0
        or v_image->>'mimeType'<>'image/webp'
        or coalesce((v_image->>'byteSize')::bigint,0) not between 1 and 10485760
        or coalesce((v_image->>'width')::integer,0)<=0
        or coalesce((v_image->>'height')::integer,0)<=0
        or jsonb_typeof(v_image->'alt')<>'object'
        or not coalesce(v_image->'alt' ?& array['zh','en','ar'],false) then
        raise exception 'invalid product image metadata' using errcode='22023';
      end if;
      foreach v_locale in array array['zh','en','ar']
      loop
        if length(trim(coalesce(v_image->'alt'->>v_locale,'')))=0 then
          raise exception 'incomplete product image alt for locale %',v_locale using errcode='22023';
        end if;
      end loop;
      v_image_count:=v_image_count+1;
    end loop;

    if jsonb_typeof(v_product->'specifications')<>'array' then
      raise exception 'product specifications must be an array' using errcode='22023';
    end if;

    for v_specification in
      select value from jsonb_array_elements(v_product->'specifications')
    loop
      if jsonb_typeof(v_specification->'label')<>'object'
        or jsonb_typeof(v_specification->'value')<>'object'
        or not coalesce(v_specification->'label' ?& array['zh','en','ar'],false)
        or not coalesce(v_specification->'value' ?& array['zh','en','ar'],false) then
        raise exception 'invalid product specification' using errcode='22023';
      end if;
      foreach v_locale in array array['zh','en','ar']
      loop
        if length(trim(coalesce(v_specification->'label'->>v_locale,'')))=0
          or length(trim(coalesce(v_specification->'value'->>v_locale,'')))=0 then
          raise exception 'incomplete product specification for locale %',v_locale using errcode='22023';
        end if;
      end loop;
    end loop;
  end loop;

  if v_image_count<>11 then
    raise exception 'product catalog must contain exactly 11 images' using errcode='22023';
  end if;

  update public.products
  set status='draft', deleted_at=now(), updated_at=now()
  where not exists (
    select 1
    from jsonb_array_elements(p_payload->'products') as catalog(item)
    where catalog.item->>'slug'=public.products.slug
  );

  for v_product in
    select value from jsonb_array_elements(p_payload->'products')
  loop
    insert into public.products(slug,category,status,sort_order,deleted_at)
    values(
      v_product->>'slug',
      v_product->>'category',
      'published',
      (v_product->>'sortOrder')::integer,
      null
    )
    on conflict(slug) do update
    set category=excluded.category,
        status='published',
        sort_order=excluded.sort_order,
        version=public.products.version+1,
        deleted_at=null,
        updated_at=now()
    returning id into v_product_id;

    delete from public.product_translations where product_id=v_product_id;
    delete from public.product_images where product_id=v_product_id;
    delete from public.product_specifications where product_id=v_product_id;

    foreach v_locale in array array['zh','en','ar']
    loop
      v_translation:=v_product->'translations'->v_locale;
      insert into public.product_translations(product_id,locale,name,summary,description)
      values(
        v_product_id,
        v_locale,
        v_translation->>'name',
        v_translation->>'summary',
        v_translation->>'description'
      );
    end loop;

    v_image_sort_order:=0;
    for v_image in
      select value from jsonb_array_elements(v_product->'images')
    loop
      insert into public.media(storage_path,mime_type,byte_size,width,height,variants,deleted_at)
      values(
        v_image->>'publicUrl',
        v_image->>'mimeType',
        (v_image->>'byteSize')::bigint,
        (v_image->>'width')::integer,
        (v_image->>'height')::integer,
        jsonb_build_object('storagePath',v_image->>'storagePath'),
        null
      )
      on conflict(storage_path) do update
      set mime_type=excluded.mime_type,
          byte_size=excluded.byte_size,
          width=excluded.width,
          height=excluded.height,
          variants=excluded.variants,
          deleted_at=null
      returning id into v_media_id;

      insert into public.product_images(product_id,media_id,sort_order,alt_text)
      values(v_product_id,v_media_id,v_image_sort_order,v_image->'alt');
      v_image_sort_order:=v_image_sort_order+1;
    end loop;

    v_specification_sort_order:=0;
    for v_specification in
      select value from jsonb_array_elements(v_product->'specifications')
    loop
      insert into public.product_specifications(product_id,label,value,sort_order)
      values(
        v_product_id,
        v_specification->'label',
        v_specification->'value',
        v_specification_sort_order
      );
      v_specification_sort_order:=v_specification_sort_order+1;
    end loop;
  end loop;

  return jsonb_build_object('version','1.0','productCount',10,'imageCount',11);
end;
$$;

revoke all on function public.replace_product_catalog_v1(jsonb) from public;
revoke all on function public.replace_product_catalog_v1(jsonb) from anon;
revoke all on function public.replace_product_catalog_v1(jsonb) from authenticated;
grant execute on function public.replace_product_catalog_v1(jsonb) to service_role;

create or replace function public.export_product_catalog_snapshot_v1()
returns jsonb
language sql
stable
security definer
set search_path=''
as $$
  select jsonb_build_object(
    'version','1.0',
    'capturedAt',now(),
    'products',coalesce((
      select jsonb_agg(to_jsonb(p) order by p.sort_order,p.id)
      from public.products p
    ),'[]'::jsonb),
    'translations',coalesce((
      select jsonb_agg(to_jsonb(t) order by t.product_id,t.locale)
      from public.product_translations t
    ),'[]'::jsonb),
    'media',coalesce((
      select jsonb_agg(to_jsonb(m) order by m.created_at,m.id)
      from public.media m
    ),'[]'::jsonb),
    'productImages',coalesce((
      select jsonb_agg(to_jsonb(i) order by i.product_id,i.sort_order,i.id)
      from public.product_images i
    ),'[]'::jsonb),
    'specifications',coalesce((
      select jsonb_agg(to_jsonb(s) order by s.product_id,s.sort_order,s.id)
      from public.product_specifications s
    ),'[]'::jsonb)
  );
$$;

revoke all on function public.export_product_catalog_snapshot_v1() from public;
revoke all on function public.export_product_catalog_snapshot_v1() from anon;
revoke all on function public.export_product_catalog_snapshot_v1() from authenticated;
grant execute on function public.export_product_catalog_snapshot_v1() to service_role;

create or replace function public.restore_product_catalog_snapshot_v1(p_snapshot jsonb)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_product jsonb;
  v_translation jsonb;
  v_media jsonb;
  v_image jsonb;
  v_specification jsonb;
  v_conflicting_product_id uuid;
  v_validated_conflicting_product_ids uuid[] := array[]::uuid[];
  v_conflicting_slug text;
  v_product_count integer;
  v_image_count integer;
begin
  if jsonb_typeof(p_snapshot)<>'object' or p_snapshot->>'version'<>'1.0' then
    raise exception 'invalid product catalog snapshot version' using errcode='22023';
  end if;
  if jsonb_typeof(p_snapshot->'products')<>'array'
    or jsonb_typeof(p_snapshot->'translations')<>'array'
    or jsonb_typeof(p_snapshot->'media')<>'array'
    or jsonb_typeof(p_snapshot->'productImages')<>'array'
    or jsonb_typeof(p_snapshot->'specifications')<>'array' then
    raise exception 'invalid product catalog snapshot structure' using errcode='22023';
  end if;

  if (
    select count(*)<>count(distinct item->>'id') or count(*)<>count(distinct item->>'slug')
    from jsonb_array_elements(p_snapshot->'products') as snapshot(item)
  ) then
    raise exception 'snapshot product ids and slugs must be unique' using errcode='22023';
  end if;

  for v_product in select value from jsonb_array_elements(p_snapshot->'products')
  loop
    perform (v_product->>'id')::uuid;
    perform (v_product->>'sort_order')::integer;
    perform (v_product->>'version')::integer;
    perform (v_product->>'deleted_at')::timestamptz;
    perform (v_product->>'created_at')::timestamptz;
    perform (v_product->>'updated_at')::timestamptz;
    if v_product->>'slug' is null
      or coalesce(v_product->>'category','') not in ('bra-pads','cups','custom-development')
      or coalesce(v_product->>'status','') not in ('draft','published')
      or v_product->>'sort_order' is null
      or v_product->>'version' is null
      or v_product->>'created_at' is null
      or v_product->>'updated_at' is null then
      raise exception 'invalid snapshot product' using errcode='22023';
    end if;
  end loop;

  if (
    select count(*)<>count(distinct concat(item->>'product_id','|',item->>'locale'))
    from jsonb_array_elements(p_snapshot->'translations') as snapshot(item)
  ) then
    raise exception 'snapshot translations must be unique' using errcode='22023';
  end if;
  for v_translation in select value from jsonb_array_elements(p_snapshot->'translations')
  loop
    perform (v_translation->>'product_id')::uuid;
    if coalesce(v_translation->>'locale','') not in ('zh','en','ar')
      or v_translation->>'name' is null
      or v_translation->>'summary' is null
      or v_translation->>'description' is null
      or not exists (
        select 1 from jsonb_array_elements(p_snapshot->'products') as products(item)
        where products.item->>'id'=v_translation->>'product_id'
      ) then
      raise exception 'invalid snapshot translation' using errcode='22023';
    end if;
  end loop;

  if (
    select count(*)<>count(distinct item->>'id') or count(*)<>count(distinct item->>'storage_path')
    from jsonb_array_elements(p_snapshot->'media') as snapshot(item)
  ) then
    raise exception 'snapshot media ids and storage paths must be unique' using errcode='22023';
  end if;
  for v_media in select value from jsonb_array_elements(p_snapshot->'media')
  loop
    perform (v_media->>'id')::uuid;
    perform (v_media->>'byte_size')::bigint;
    perform (v_media->>'width')::integer;
    perform (v_media->>'height')::integer;
    perform (v_media->>'deleted_at')::timestamptz;
    perform (v_media->>'created_at')::timestamptz;
    if v_media->>'storage_path' is null
      or coalesce(v_media->>'mime_type','') not in ('image/jpeg','image/png','image/webp')
      or v_media->>'byte_size' is null
      or v_media->>'width' is null
      or v_media->>'height' is null
      or (v_media->>'byte_size')::bigint not between 1 and 10485760
      or (v_media->>'width')::integer<=0
      or (v_media->>'height')::integer<=0
      or not (v_media ? 'variants')
      or v_media->>'created_at' is null then
      raise exception 'invalid snapshot media' using errcode='22023';
    end if;
  end loop;

  if (
    select count(*)<>count(distinct item->>'id')
      or count(*)<>count(distinct concat(item->>'product_id','|',item->>'sort_order'))
    from jsonb_array_elements(p_snapshot->'productImages') as snapshot(item)
  ) then
    raise exception 'snapshot product images must be unique' using errcode='22023';
  end if;
  for v_image in select value from jsonb_array_elements(p_snapshot->'productImages')
  loop
    perform (v_image->>'id')::uuid;
    perform (v_image->>'product_id')::uuid;
    perform (v_image->>'media_id')::uuid;
    perform (v_image->>'sort_order')::integer;
    if v_image->>'sort_order' is null
      or not coalesce(v_image->'alt_text' ?& array['zh','en','ar'],false)
      or not exists (
        select 1 from jsonb_array_elements(p_snapshot->'products') as products(item)
        where products.item->>'id'=v_image->>'product_id'
      )
      or not exists (
        select 1 from jsonb_array_elements(p_snapshot->'media') as media(item)
        where media.item->>'id'=v_image->>'media_id'
      ) then
      raise exception 'invalid snapshot product image' using errcode='22023';
    end if;
  end loop;

  if (
    select count(*)<>count(distinct item->>'id')
    from jsonb_array_elements(p_snapshot->'specifications') as snapshot(item)
  ) then
    raise exception 'snapshot product specification ids must be unique' using errcode='22023';
  end if;
  for v_specification in select value from jsonb_array_elements(p_snapshot->'specifications')
  loop
    perform (v_specification->>'id')::uuid;
    perform (v_specification->>'product_id')::uuid;
    perform (v_specification->>'sort_order')::integer;
    if v_specification->>'sort_order' is null
      or not coalesce(v_specification->'label' ?& array['zh','en','ar'],false)
      or not coalesce(v_specification->'value' ?& array['zh','en','ar'],false)
      or not exists (
        select 1 from jsonb_array_elements(p_snapshot->'products') as products(item)
        where products.item->>'id'=v_specification->>'product_id'
      ) then
      raise exception 'invalid snapshot product specification' using errcode='22023';
    end if;
  end loop;

  -- Only a conflicting record created by this catalog-v1 import may be hard-deleted.
  for v_product in select value from jsonb_array_elements(p_snapshot->'products')
  loop
    v_conflicting_product_id:=null;
    v_conflicting_slug:=v_product->>'slug';
    select p.id into v_conflicting_product_id
    from public.products p
    where p.slug=v_conflicting_slug and p.id<>(v_product->>'id')::uuid
    for update;

    if v_conflicting_product_id is not null then
      if not (
        v_conflicting_slug in (
        'teardrop-cup-pad','separate-oval-cup-pad','separate-round-cup-pad','camisole-cup',
        'semi-circular-cup-pad','fabric-wrapped-cup-pad','separate-triangular-cup-pad',
        'thin-top-thick-bottom-cup-pad','size-80-full-coverage-cup-pad','integrated-cup-pad'
        )
        and exists (
        select 1 from public.product_images pi
        join public.media m on m.id=pi.media_id
        where pi.product_id=v_conflicting_product_id
          and m.variants->>'storagePath' like 'catalog-v1/%'
        )
        and not exists (
        select 1 from public.product_images pi
        join public.media m on m.id=pi.media_id
        where pi.product_id=v_conflicting_product_id
          and coalesce(m.variants->>'storagePath','') not like 'catalog-v1/%'
        )
      ) then
        raise exception 'snapshot slug conflicts with an unrelated product' using errcode='23505';
      end if;
      v_validated_conflicting_product_ids:=array_append(
        v_validated_conflicting_product_ids,
        v_conflicting_product_id
      );
    end if;
  end loop;

  -- Snapshot validation complete; all writes below are transactional.
  delete from public.products
  where id=any(v_validated_conflicting_product_ids);

  update public.products
  set status='draft',deleted_at=now(),updated_at=now()
  where not exists (
    select 1 from jsonb_array_elements(p_snapshot->'products') as products(item)
    where products.item->>'id'=public.products.id::text
  );

  for v_product in select value from jsonb_array_elements(p_snapshot->'products')
  loop
    insert into public.products(id,slug,category,status,sort_order,version,deleted_at,created_at,updated_at)
    values(
      (v_product->>'id')::uuid,
      v_product->>'slug',
      v_product->>'category',
      (v_product->>'status')::public.content_status,
      (v_product->>'sort_order')::integer,
      (v_product->>'version')::integer,
      (v_product->>'deleted_at')::timestamptz,
      (v_product->>'created_at')::timestamptz,
      (v_product->>'updated_at')::timestamptz
    )
    on conflict(id) do update
    set slug=excluded.slug,
        category=excluded.category,
        status=excluded.status,
        sort_order=excluded.sort_order,
        version=excluded.version,
        deleted_at=excluded.deleted_at,
        created_at=excluded.created_at,
        updated_at=excluded.updated_at;
  end loop;

  delete from public.product_translations t
  where exists (
    select 1 from jsonb_array_elements(p_snapshot->'products') as products(item)
    where products.item->>'id'=t.product_id::text
  );
  delete from public.product_images i
  where exists (
    select 1 from jsonb_array_elements(p_snapshot->'products') as products(item)
    where products.item->>'id'=i.product_id::text
  );
  delete from public.product_specifications s
  where exists (
    select 1 from jsonb_array_elements(p_snapshot->'products') as products(item)
    where products.item->>'id'=s.product_id::text
  );

  for v_media in select value from jsonb_array_elements(p_snapshot->'media')
  loop
    insert into public.media(id,storage_path,mime_type,byte_size,width,height,variants,deleted_at,created_at)
    values(
      (v_media->>'id')::uuid,
      v_media->>'storage_path',
      v_media->>'mime_type',
      (v_media->>'byte_size')::bigint,
      (v_media->>'width')::integer,
      (v_media->>'height')::integer,
      v_media->'variants',
      (v_media->>'deleted_at')::timestamptz,
      (v_media->>'created_at')::timestamptz
    )
    on conflict(id) do update
    set storage_path=excluded.storage_path,
        mime_type=excluded.mime_type,
        byte_size=excluded.byte_size,
        width=excluded.width,
        height=excluded.height,
        variants=excluded.variants,
        deleted_at=excluded.deleted_at,
        created_at=excluded.created_at;
  end loop;

  for v_translation in select value from jsonb_array_elements(p_snapshot->'translations')
  loop
    insert into public.product_translations(product_id,locale,name,summary,description)
    values(
      (v_translation->>'product_id')::uuid,
      v_translation->>'locale',
      v_translation->>'name',
      v_translation->>'summary',
      v_translation->>'description'
    );
  end loop;

  for v_image in select value from jsonb_array_elements(p_snapshot->'productImages')
  loop
    insert into public.product_images(id,product_id,media_id,sort_order,alt_text)
    values(
      (v_image->>'id')::uuid,
      (v_image->>'product_id')::uuid,
      (v_image->>'media_id')::uuid,
      (v_image->>'sort_order')::integer,
      v_image->'alt_text'
    );
  end loop;

  for v_specification in select value from jsonb_array_elements(p_snapshot->'specifications')
  loop
    insert into public.product_specifications(id,product_id,label,value,sort_order)
    values(
      (v_specification->>'id')::uuid,
      (v_specification->>'product_id')::uuid,
      v_specification->'label',
      v_specification->'value',
      (v_specification->>'sort_order')::integer
    );
  end loop;

  update public.media m
  set deleted_at=now()
  where m.variants->>'storagePath' like 'catalog-v1/%'
    and not exists (
      select 1 from jsonb_array_elements(p_snapshot->'media') as media(item)
      where media.item->>'id'=m.id::text
    );

  select jsonb_array_length(p_snapshot->'products') into v_product_count;
  select jsonb_array_length(p_snapshot->'productImages') into v_image_count;
  return jsonb_build_object('version','1.0','productCount',v_product_count,'imageCount',v_image_count);
end;
$$;

revoke all on function public.restore_product_catalog_snapshot_v1(jsonb) from public;
revoke all on function public.restore_product_catalog_snapshot_v1(jsonb) from anon;
revoke all on function public.restore_product_catalog_snapshot_v1(jsonb) from authenticated;
grant execute on function public.restore_product_catalog_snapshot_v1(jsonb) to service_role;
