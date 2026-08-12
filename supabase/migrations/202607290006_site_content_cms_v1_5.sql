-- Shuangfu site content CMS V1.5
-- Five fixed public sections, dynamic product categories, and one atomic save RPC.

create table public.site_sections (
  key text primary key check (key in ('home','about','products','advantages','contact')),
  sort_order integer not null check (sort_order between 0 and 4),
  layout_key text not null,
  content jsonb not null check (jsonb_typeof(content) = 'object'),
  media_id uuid references public.media(id),
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now(),
  constraint site_sections_sort_unique unique (sort_order) deferrable initially deferred,
  constraint site_sections_layout_valid check (
    (key = 'home' and layout_key in ('text-left','image-left','centered'))
    or (key = 'about' and layout_key in ('text-left','image-left','stacked'))
    or (key = 'products' and layout_key in ('tabs-grid','accordion','featured-grid'))
    or (key = 'advantages' and layout_key in ('cards','two-column','timeline'))
    or (key = 'contact' and layout_key in ('info-left','form-left','stacked'))
  )
);

create index site_sections_media_id_idx on public.site_sections(media_id);
create index site_sections_updated_by_idx on public.site_sections(updated_by);

create table public.product_categories (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  sort_order integer not null check (sort_order >= 0),
  is_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint product_categories_sort_unique unique (sort_order) deferrable initially deferred
);

create table public.product_category_translations (
  category_id uuid not null references public.product_categories(id) on delete cascade,
  locale text not null check (locale in ('zh','en','ar')),
  name text not null check (length(trim(name)) > 0),
  description text not null check (length(trim(description)) > 0),
  primary key (category_id, locale)
);

insert into public.product_categories (id, slug, sort_order, is_enabled)
values
  ('b8c8fe47-2268-4f88-bf2a-3d751c2fa001', 'bra-pads', 0, true),
  ('b8c8fe47-2268-4f88-bf2a-3d751c2fa002', 'cups', 1, true),
  ('b8c8fe47-2268-4f88-bf2a-3d751c2fa003', 'custom-development', 2, true);

insert into public.product_category_translations (category_id, locale, name, description)
select category.id, translation.locale, translation.name, translation.description
from public.product_categories category
join (
  values
    ('bra-pads', 'zh', '胸垫', '适用于文胸与贴身服饰的胸垫类产品。'),
    ('bra-pads', 'en', 'Bra pads', 'Bra pad products for lingerie and close-fitting apparel.'),
    ('bra-pads', 'ar', 'حشوات الصدر', 'منتجات حشوات الصدر للملابس الداخلية والملابس الملاصقة للجسم.'),
    ('cups', 'zh', '罩杯', '适用于内衣与服装结构的罩杯类产品。'),
    ('cups', 'en', 'Cups', 'Cup products for lingerie and structured apparel.'),
    ('cups', 'ar', 'أكواب الصدر', 'منتجات أكواب الصدر للملابس الداخلية والملابس الهيكلية.'),
    ('custom-development', 'zh', '定制开发', '根据结构、尺寸与材料需求协同开发。'),
    ('custom-development', 'en', 'Custom development', 'Collaborative development for structure, sizing, and material requirements.'),
    ('custom-development', 'ar', 'تطوير مخصص', 'تطوير تعاوني وفق متطلبات البنية والمقاس والمواد.')
) as translation(slug, locale, name, description)
  on translation.slug = category.slug;

alter table public.products
  add column category_id uuid;

update public.products product
set category_id = category.id
from public.product_categories category
where category.slug = product.category;

do $migration$
begin
  if exists (select 1 from public.products where category_id is null) then
    raise exception 'product_category_backfill_failed' using errcode = '23502';
  end if;
end;
$migration$;

alter table public.products
  alter column category_id set not null,
  add constraint products_category_id_fkey
    foreign key (category_id) references public.product_categories(id);

drop index if exists public.products_category_public_idx;
create index products_category_public_idx
  on public.products(category_id, sort_order, id)
  where status = 'published' and deleted_at is null;
create index products_category_id_idx on public.products(category_id);

alter table public.inquiries
  add column category_id uuid references public.product_categories(id) on delete set null,
  add column category_name_snapshot text;

update public.inquiries inquiry
set category_id = category.id,
    category_name_snapshot = (
      select translation.name
      from public.product_category_translations translation
      where translation.category_id = category.id
        and translation.locale = inquiry.locale
    )
from public.product_categories category
where category.slug = inquiry.product_category;

do $migration$
begin
  if exists (
    select 1
    from public.inquiries
    where category_id is null or nullif(trim(category_name_snapshot), '') is null
  ) then
    raise exception 'inquiry_category_backfill_failed' using errcode = '23502';
  end if;
end;
$migration$;

alter table public.inquiries
  alter column category_name_snapshot set not null;

create index inquiries_category_idx on public.inquiries(category_id);

insert into public.site_sections (key, sort_order, layout_key, content)
values
  (
    'home',
    0,
    'text-left',
    $json$
    {
      "enabled": true,
      "content": {
        "zh": {
          "companyShort": "双芙辅料",
          "nav": ["企业介绍", "产品介绍", "合作优势", "联系我们"],
          "eyebrow": "LINGERIE COMPONENTS · SINCE 2021",
          "title": "贴近身体的柔软，\n始于看不见的工艺。",
          "text": "专注胸垫、罩杯及服装服饰辅料制造，为品牌与制造商提供稳定、灵活且可持续迭代的产品支持。",
          "cta": "探索产品",
          "contactCta": "洽谈合作"
        },
        "en": {
          "companyShort": "Shuangfu Components",
          "nav": ["Company", "Products", "Advantages", "Contact"],
          "eyebrow": "LINGERIE COMPONENTS · SINCE 2021",
          "title": "Softness close to the body\nbegins with unseen craft.",
          "text": "Focused on bra pads, cups and apparel components, supporting brands and manufacturers with stable, flexible product development.",
          "cta": "Explore products",
          "contactCta": "Start a conversation"
        },
        "ar": {
          "companyShort": "شوانغفو للمستلزمات",
          "nav": ["عن الشركة", "المنتجات", "مزايا التعاون", "اتصل بنا"],
          "eyebrow": "مكونات الملابس الداخلية · منذ 2021",
          "title": "النعومة القريبة من الجسم\nتبدأ بحرفة لا تُرى.",
          "text": "نتخصص في حشوات الصدر والكؤوس ومستلزمات الملابس، وندعم العلامات والمصنعين بتطوير مرن وإنتاج مستقر.",
          "cta": "استكشف المنتجات",
          "contactCta": "ابدأ التعاون"
        }
      },
      "media": {
        "image": "/images/hero-products-placeholder-v1.png",
        "alt": {
          "zh": "当前图片与产品内容为设计占位，正式发布前将替换为公司确认素材。",
          "en": "Images and product content are design placeholders and must be replaced with company-approved materials before launch.",
          "ar": "الصور ومحتوى المنتجات عناصر تصميم مؤقتة ويجب استبدالها بمواد معتمدة من الشركة قبل الإطلاق."
        }
      }
    }
    $json$::jsonb
  ),
  (
    'about',
    1,
    'text-left',
    $json$
    {
      "enabled": true,
      "content": {
        "zh": {
          "eyebrow": "ABOUT SHUANGFU",
          "title": "以稳定制造，承接每一次贴身创意",
          "text": "六安市双芙服装辅料有限公司成立于 2021 年，位于安徽六安。我们围绕胸垫、罩杯与相关辅料，提供从选型、打样到批量生产的协作支持。"
        },
        "en": {
          "eyebrow": "ABOUT SHUANGFU",
          "title": "Reliable manufacturing for ideas worn close",
          "text": "Founded in 2021 in Lu'an, Anhui, Shuangfu focuses on bra pads, cups and related apparel components, supporting selection, sampling and volume production."
        },
        "ar": {
          "eyebrow": "عن شوانغفو",
          "title": "تصنيع موثوق لكل فكرة مريحة",
          "text": "تأسست شركة شوانغفو في عام 2021 في ليوآن، آنهوي. نركز على الحشوات والكؤوس ومستلزمات الملابس ذات الصلة، من اختيار المنتج والعينات إلى الإنتاج الكمي."
        }
      },
      "facts": [
        {
          "id": "founded",
          "sortOrder": 0,
          "value": {"zh": "2021", "en": "2021", "ar": "2021"},
          "label": {"zh": "成立年份", "en": "Founded", "ar": "سنة التأسيس"}
        },
        {
          "id": "services",
          "sortOrder": 1,
          "value": {"zh": "3", "en": "3", "ar": "3"},
          "label": {"zh": "核心服务方向", "en": "Core services", "ar": "مجالات الخدمة"}
        },
        {
          "id": "development",
          "sortOrder": 2,
          "value": {"zh": "多规格", "en": "Flexible", "ar": "مرنة"},
          "label": {"zh": "灵活开发能力", "en": "Development capability", "ar": "قدرة التطوير"}
        }
      ],
      "media": {
        "image": "/images/company-craft-placeholder-v1.png",
        "alt": {
          "zh": "当前图片与产品内容为设计占位，正式发布前将替换为公司确认素材。",
          "en": "Images and product content are design placeholders and must be replaced with company-approved materials before launch.",
          "ar": "الصور ومحتوى المنتجات عناصر تصميم مؤقتة ويجب استبدالها بمواد معتمدة من الشركة قبل الإطلاق."
        }
      }
    }
    $json$::jsonb
  ),
  (
    'products',
    2,
    'tabs-grid',
    $json$
    {
      "enabled": true,
      "content": {
        "zh": {
          "eyebrow": "PRODUCTS",
          "title": "从基础结构到定制开发",
          "text": "点击类目查看产品图片、介绍和尺寸规格；每件产品均可直接带入合作咨询。"
        },
        "en": {
          "eyebrow": "PRODUCTS",
          "title": "From essential structures to custom development",
          "text": "Open a category to browse images, descriptions and size specifications, then attach any product to an inquiry."
        },
        "ar": {
          "eyebrow": "المنتجات",
          "title": "من البنية الأساسية إلى التطوير المخصص",
          "text": "افتح الفئة لمشاهدة الصور والوصف ومواصفات المقاس، ثم أرفق المنتج بالاستفسار."
        }
      }
    }
    $json$::jsonb
  ),
  (
    'advantages',
    3,
    'cards',
    $json$
    {
      "enabled": true,
      "content": {
        "zh": {"eyebrow": "WHY SHUANGFU", "title": "把复杂的开发过程，变成可靠的协作", "description": "从选型、打样到批量生产，以清晰沟通和稳定制造支持每一次合作。"},
        "en": {"eyebrow": "WHY SHUANGFU", "title": "Turning complex development into dependable collaboration", "description": "From selection and sampling to volume production, clear communication and reliable manufacturing support every collaboration."},
        "ar": {"eyebrow": "لماذا شوانغفو", "title": "نحوّل التطوير المعقد إلى تعاون موثوق", "description": "من الاختيار وإعداد العينات إلى الإنتاج الكمي، ندعم كل تعاون بتواصل واضح وتصنيع موثوق."}
      },
      "steps": [
        {
          "id": "focused-expertise",
          "sortOrder": 0,
          "icon": "layers",
          "title": {"zh": "专注品类", "en": "Focused expertise", "ar": "خبرة متخصصة"},
          "text": {
            "zh": "围绕胸垫、罩杯与贴身服饰辅料积累制造经验。",
            "en": "Manufacturing experience centered on bra pads, cups and intimate-apparel components.",
            "ar": "خبرة تصنيع تركز على الحشوات والكؤوس ومستلزمات الملابس الداخلية."
          }
        },
        {
          "id": "flexible-sampling",
          "sortOrder": 1,
          "icon": "drafting",
          "title": {"zh": "灵活打样", "en": "Flexible sampling", "ar": "عينات مرنة"},
          "text": {
            "zh": "按结构、尺寸、厚度、面料与颜色协同开发。",
            "en": "Collaborative development across structure, sizing, thickness, fabric and color.",
            "ar": "تطوير تعاوني للبنية والمقاس والسماكة والقماش واللون."
          }
        },
        {
          "id": "stable-delivery",
          "sortOrder": 2,
          "icon": "package",
          "title": {"zh": "稳定交付", "en": "Stable delivery", "ar": "تسليم مستقر"},
          "text": {
            "zh": "以明确规格和过程沟通支持持续生产。",
            "en": "Clear specifications and process communication for ongoing production.",
            "ar": "مواصفات واضحة وتواصل مستمر لدعم الإنتاج."
          }
        },
        {
          "id": "responsive-service",
          "sortOrder": 3,
          "icon": "message",
          "title": {"zh": "快速响应", "en": "Responsive service", "ar": "استجابة سريعة"},
          "text": {
            "zh": "从产品咨询到开发确认，保持直接、清晰的沟通。",
            "en": "Direct communication from first inquiry through development confirmation.",
            "ar": "تواصل مباشر من الاستفسار الأول حتى تأكيد التطوير."
          }
        }
      ]
    }
    $json$::jsonb
  ),
  (
    'contact',
    4,
    'info-left',
    $json$
    {
      "enabled": true,
      "content": {
        "zh": {
          "eyebrow": "CONTACT",
          "title": "从一个样品需求开始合作",
          "companyName": "六安市双芙服装辅料有限公司",
          "address": "安徽省六安市裕安区新安镇陈集村三棵松组"
        },
        "en": {
          "eyebrow": "CONTACT",
          "title": "Start with a sample request",
          "companyName": "Lu'an Shuangfu Garment Accessories Co., Ltd.",
          "address": "Sankesong Group, Chenji Village, Xin'an Town, Yu'an District, Lu'an, Anhui, China"
        },
        "ar": {
          "eyebrow": "اتصل بنا",
          "title": "ابدأ بطلب عينة",
          "companyName": "شركة ليوآن شوانغفو لمستلزمات الملابس المحدودة",
          "address": "مجموعة سانكيسونغ، قرية تشنجي، بلدة شينآن، حي يوآن، ليوآن، آنهوي، الصين"
        }
      },
      "shared": {"phone": "155 0564 1268", "email": "15505641268@139.com"}
    }
    $json$::jsonb
  );

create or replace function public.product_payload(p public.products)
returns jsonb
language sql
stable
security definer
set search_path=''
as $$
  select jsonb_build_object(
    'id', p.id::text,
    'slug', p.slug,
    'categoryId', p.category_id::text,
    'categorySlug', category.slug,
    'category', jsonb_build_object(
      'id', category.id::text,
      'slug', category.slug,
      'isEnabled', category.is_enabled,
      'translations', coalesce((
        select jsonb_object_agg(
          translation.locale,
          jsonb_build_object(
            'name', translation.name,
            'description', translation.description
          )
        )
        from public.product_category_translations translation
        where translation.category_id = category.id
      ), '{}'::jsonb)
    ),
    'status', p.status::text,
    'sortOrder', p.sort_order,
    'deletedAt', p.deleted_at,
    'translations', (
      select jsonb_object_agg(
        translation.locale,
        jsonb_build_object(
          'name', translation.name,
          'summary', translation.summary,
          'description', translation.description
        )
      )
      from public.product_translations translation
      where translation.product_id = p.id
    ),
    'images', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', image.id::text,
          'url', media.storage_path,
          'alt', image.alt_text,
          'sortOrder', image.sort_order
        )
        order by image.sort_order
      )
      from public.product_images image
      join public.media media on media.id = image.media_id
      where image.product_id = p.id and media.deleted_at is null
    ), '[]'::jsonb),
    'specifications', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', specification.id::text,
          'label', specification.label,
          'value', specification.value,
          'sortOrder', specification.sort_order
        )
        order by specification.sort_order
      )
      from public.product_specifications specification
      where specification.product_id = p.id
    ), '[]'::jsonb)
  )
  from public.product_categories category
  where category.id = p.category_id;
$$;

create or replace function public.list_published_products(
  p_category text,
  p_limit integer,
  p_cursor_order integer default null,
  p_cursor_id uuid default null
)
returns table(payload jsonb)
language sql
stable
security definer
set search_path=''
as $$
  select public.product_payload(product)
  from public.products product
  join public.product_categories category on category.id = product.category_id
  where (category.slug = p_category or category.id::text = p_category)
    and category.is_enabled
    and product.status = 'published'
    and product.deleted_at is null
    and (
      p_cursor_order is null
      or (product.sort_order, product.id) > (p_cursor_order, p_cursor_id)
    )
  order by product.sort_order, product.id
  limit least(greatest(p_limit, 1), 25);
$$;

create or replace function public.get_published_product(p_slug text)
returns table(payload jsonb)
language sql
stable
security definer
set search_path=''
as $$
  select public.product_payload(product)
  from public.products product
  join public.product_categories category on category.id = product.category_id
  where product.slug = p_slug
    and category.is_enabled
    and product.status = 'published'
    and product.deleted_at is null
  limit 1;
$$;

create or replace function public.publish_product_version(
  p_product_id uuid,
  p_expected_version integer,
  p_actor uuid
)
returns integer
language plpgsql
security definer
set search_path=''
as $$
declare
  v_product public.products;
  v_snapshot jsonb;
  v_new_version integer;
begin
  if p_actor is distinct from (select auth.uid())
    or not public.has_permission('products','publish') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if (
    select count(*)
    from public.product_translations translation
    where translation.product_id = p_product_id
      and translation.locale in ('zh','en','ar')
      and length(trim(translation.name)) > 0
      and length(trim(translation.summary)) > 0
      and length(trim(translation.description)) > 0
  ) <> 3 then
    raise exception 'incomplete translations' using errcode = '22023';
  end if;
  if (
    select count(*) from public.product_images where product_id = p_product_id
  ) not between 1 and 10 then
    raise exception 'invalid image count' using errcode = '22023';
  end if;

  update public.products
  set status = 'published', version = version + 1, updated_at = now()
  where id = p_product_id
    and version = p_expected_version
    and deleted_at is null
  returning * into v_product;
  if v_product.id is null then
    raise exception 'version conflict' using errcode = '40001';
  end if;
  v_new_version := v_product.version;

  select jsonb_build_object(
    'product', to_jsonb(v_product),
    'translations', (
      select jsonb_object_agg(translation.locale, to_jsonb(translation) - 'product_id')
      from public.product_translations translation
      where translation.product_id = p_product_id
    ),
    'images', coalesce((
      select jsonb_agg(to_jsonb(image) - 'product_id' order by image.sort_order)
      from public.product_images image
      where image.product_id = p_product_id
    ), '[]'::jsonb),
    'specifications', coalesce((
      select jsonb_agg(
        to_jsonb(specification) - 'product_id'
        order by specification.sort_order
      )
      from public.product_specifications specification
      where specification.product_id = p_product_id
    ), '[]'::jsonb)
  ) into v_snapshot;

  insert into public.published_versions (
    resource_type, resource_id, version, snapshot, published_by
  )
  values ('product', p_product_id, v_new_version, v_snapshot, p_actor);
  insert into public.audit_logs (
    actor_id, action, resource_type, resource_id, after_data
  )
  values (p_actor, 'publish', 'product', p_product_id::text, v_snapshot);
  return v_new_version;
end;
$$;

create or replace function public.rollback_product_version(
  p_product_id uuid,
  p_target_version integer,
  p_expected_version integer,
  p_actor uuid
)
returns integer
language plpgsql
security definer
set search_path=''
as $$
declare
  v_snapshot jsonb;
  v_category_id uuid;
  v_new_version integer;
  v_item record;
begin
  if p_actor is distinct from (select auth.uid())
    or not public.has_permission('products','publish') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select snapshot into v_snapshot
  from public.published_versions
  where resource_type = 'product'
    and resource_id = p_product_id
    and version = p_target_version;
  if v_snapshot is null then
    raise exception 'version not found' using errcode = '22023';
  end if;

  if nullif(v_snapshot->'product'->>'category_id', '') is not null then
    v_category_id := (v_snapshot->'product'->>'category_id')::uuid;
  else
    select id into v_category_id
    from public.product_categories
    where slug = coalesce(
      v_snapshot->'product'->>'category',
      v_snapshot->'product'->>'categorySlug'
    );
  end if;
  if v_category_id is null then
    raise exception 'category not found' using errcode = '23503';
  end if;

  update public.products
  set status = 'published',
      category_id = v_category_id,
      sort_order = (v_snapshot->'product'->>'sort_order')::integer,
      version = version + 1,
      updated_at = now()
  where id = p_product_id
    and version = p_expected_version
    and deleted_at is null
  returning version into v_new_version;
  if v_new_version is null then
    raise exception 'version conflict' using errcode = '40001';
  end if;

  delete from public.product_translations where product_id = p_product_id;
  delete from public.product_images where product_id = p_product_id;
  delete from public.product_specifications where product_id = p_product_id;

  for v_item in select key, value from jsonb_each(v_snapshot->'translations')
  loop
    insert into public.product_translations (
      product_id, locale, name, summary, description
    )
    values (
      p_product_id,
      v_item.key,
      v_item.value->>'name',
      v_item.value->>'summary',
      v_item.value->>'description'
    );
  end loop;
  for v_item in select value from jsonb_array_elements(v_snapshot->'images')
  loop
    insert into public.product_images (id, product_id, media_id, sort_order, alt_text)
    values (
      (v_item.value->>'id')::uuid,
      p_product_id,
      (v_item.value->>'media_id')::uuid,
      (v_item.value->>'sort_order')::integer,
      v_item.value->'alt_text'
    );
  end loop;
  for v_item in select value from jsonb_array_elements(v_snapshot->'specifications')
  loop
    insert into public.product_specifications (
      id, product_id, label, value, sort_order
    )
    values (
      (v_item.value->>'id')::uuid,
      p_product_id,
      v_item.value->'label',
      v_item.value->'value',
      (v_item.value->>'sort_order')::integer
    );
  end loop;

  insert into public.published_versions (
    resource_type, resource_id, version, snapshot, published_by
  )
  values (
    'product',
    p_product_id,
    v_new_version,
    v_snapshot || jsonb_build_object('rolledBackFrom', p_target_version),
    p_actor
  );
  insert into public.audit_logs (
    actor_id, action, resource_type, resource_id, after_data
  )
  values (
    p_actor,
    'rollback',
    'product',
    p_product_id::text,
    jsonb_build_object(
      'targetVersion', p_target_version,
      'newVersion', v_new_version
    )
  );
  return v_new_version;
end;
$$;

drop function public.accept_inquiry(uuid, jsonb, text, text);

create or replace function public.accept_inquiry(
  p_id uuid,
  p_payload jsonb,
  p_country_code text,
  p_owner_email text,
  p_category_id uuid
)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  v_category record;
  v_category_name text;
  v_locale text := p_payload->>'locale';
begin
  if v_locale not in ('zh','en','ar') then
    raise exception 'invalid locale' using errcode = '22023';
  end if;

  select category.id, category.slug, category.is_enabled
  into v_category
  from public.product_categories category
  where category.id = p_category_id;
  if v_category.id is null or not v_category.is_enabled then
    raise exception 'invalid product category' using errcode = '22023';
  end if;

  select translation.name into v_category_name
  from public.product_category_translations translation
  where translation.category_id = v_category.id
    and translation.locale = v_locale;
  if nullif(trim(v_category_name), '') is null then
    raise exception 'missing product category translation' using errcode = '22023';
  end if;

  insert into public.inquiries (
    id,
    name,
    company,
    country_code,
    email,
    phone_whatsapp,
    category_id,
    category_name_snapshot,
    product_id,
    estimated_quantity,
    message,
    locale,
    privacy_consent
  )
  values (
    p_id,
    p_payload->>'name',
    p_payload->>'company',
    upper(p_country_code),
    lower(p_payload->>'email'),
    p_payload->>'phoneWhatsApp',
    v_category.id,
    v_category_name,
    nullif(p_payload->>'productId', ''),
    p_payload->>'estimatedQuantity',
    coalesce(p_payload->>'message', ''),
    v_locale,
    true
  );
  insert into public.email_outbox (inquiry_id, kind, recipient, locale)
  values
    (p_id, 'owner_notification', p_owner_email, v_locale),
    (p_id, 'customer_confirmation', lower(p_payload->>'email'), v_locale);
end;
$$;

create or replace function public.save_site_content_v1(p_payload jsonb, p_baseline jsonb)
returns timestamptz
language plpgsql
security definer
set search_path=''
as $$
declare
  v_expected_keys constant text[] := array['home','about','products','advantages','contact'];
  v_section jsonb;
  v_section_key text;
  v_current_updated_at timestamptz;
  v_baseline_text text;
  v_baseline_updated_at timestamptz;
  v_saved_at timestamptz := clock_timestamp();
  v_categories jsonb;
  v_category jsonb;
  v_category_id uuid;
  v_category_slug text;
  v_locale text;
  v_locale_content jsonb;
  v_item jsonb;
  v_field text;
  v_before jsonb;
begin
  if not public.has_permission('pages','edit') then
    raise exception using errcode = '42501', message = 'forbidden';
  end if;
  if jsonb_typeof(p_payload) is distinct from 'object'
    or jsonb_typeof(p_payload->'sections') is distinct from 'array' then
    raise exception 'invalid site sections' using errcode = '22023';
  end if;
  if jsonb_array_length(p_payload->'sections') <> 5 then
    raise exception 'invalid site sections' using errcode = '22023';
  end if;
  if (
    select count(*) = 5
      and count(distinct section->>'key') = 5
      and bool_and(section->>'key' = any(v_expected_keys))
    from jsonb_array_elements(p_payload->'sections') section
  ) is not true then
    raise exception 'invalid site section keys' using errcode = '22023';
  end if;

  for v_section in select value from jsonb_array_elements(p_payload->'sections')
  loop
    v_section_key := v_section->>'key';
    if jsonb_typeof(v_section->'enabled') is distinct from 'boolean'
      or (v_section->>'enabled')::boolean is not true then
      raise exception 'fixed_sections_cannot_be_disabled' using errcode = '22023';
    end if;
    if coalesce(v_section->>'sortOrder', '') !~ '^[0-4]$' then
      raise exception 'invalid_section_sort_order' using errcode = '22023';
    end if;
    if not (
      (v_section_key = 'home' and coalesce(v_section->>'layout', '') in ('text-left','image-left','centered'))
      or (v_section_key = 'about' and coalesce(v_section->>'layout', '') in ('text-left','image-left','stacked'))
      or (v_section_key = 'products' and coalesce(v_section->>'layout', '') in ('tabs-grid','accordion','featured-grid'))
      or (v_section_key = 'advantages' and coalesce(v_section->>'layout', '') in ('cards','two-column','timeline'))
      or (v_section_key = 'contact' and coalesce(v_section->>'layout', '') in ('info-left','form-left','stacked'))
    ) then
      raise exception 'invalid_section_layout' using errcode = '22023';
    end if;

    if v_section_key = 'home' then
      if jsonb_typeof(v_section->'content') is distinct from 'object'
        or jsonb_typeof(v_section->'media') is distinct from 'object'
        or not (v_section->'media' ? 'mediaId')
        or jsonb_typeof(v_section->'media'->'image') is distinct from 'string'
        or nullif(trim(v_section->'media'->>'image'), '') is null
        or jsonb_typeof(v_section->'media'->'alt') is distinct from 'object'
        or (
          v_section->'media'->'mediaId' <> 'null'::jsonb
          and (
            jsonb_typeof(v_section->'media'->'mediaId') is distinct from 'string'
            or coalesce(v_section->'media'->>'mediaId', '') !~
              '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          )
        ) then
        raise exception 'invalid_home_section' using errcode = '22023';
      end if;
      foreach v_locale in array array['zh','en','ar']
      loop
        v_locale_content := v_section->'content'->v_locale;
        if jsonb_typeof(v_locale_content) is distinct from 'object' then
          raise exception 'incomplete_section_translation' using errcode = '22023';
        end if;
        foreach v_field in array array['companyShort','eyebrow','title','text','cta','contactCta']
        loop
          if jsonb_typeof(v_locale_content->v_field) is distinct from 'string'
            or nullif(trim(v_locale_content->>v_field), '') is null then
            raise exception 'incomplete_section_translation' using errcode = '22023';
          end if;
        end loop;
        if jsonb_typeof(v_locale_content->'nav') is distinct from 'array' then
          raise exception 'invalid_home_section' using errcode = '22023';
        end if;
        if jsonb_array_length(v_locale_content->'nav') <> 4
          or exists (
            select 1 from jsonb_array_elements(v_locale_content->'nav') nav_item
            where jsonb_typeof(nav_item) is distinct from 'string'
              or nullif(trim(nav_item #>> '{}'), '') is null
          ) then
          raise exception 'invalid_home_section' using errcode = '22023';
        end if;
        if jsonb_typeof(v_section->'media'->'alt'->v_locale) is distinct from 'string'
          or nullif(trim(v_section->'media'->'alt'->>v_locale), '') is null then
          raise exception 'incomplete_section_translation' using errcode = '22023';
        end if;
      end loop;
    elsif v_section_key = 'about' then
      if jsonb_typeof(v_section->'content') is distinct from 'object'
        or jsonb_typeof(v_section->'facts') is distinct from 'array'
        or jsonb_typeof(v_section->'media') is distinct from 'object'
        or not (v_section->'media' ? 'mediaId')
        or jsonb_typeof(v_section->'media'->'image') is distinct from 'string'
        or nullif(trim(v_section->'media'->>'image'), '') is null
        or jsonb_typeof(v_section->'media'->'alt') is distinct from 'object'
        or (
          v_section->'media'->'mediaId' <> 'null'::jsonb
          and (
            jsonb_typeof(v_section->'media'->'mediaId') is distinct from 'string'
            or coalesce(v_section->'media'->>'mediaId', '') !~
              '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          )
        ) then
        raise exception 'invalid_about_section' using errcode = '22023';
      end if;
      if jsonb_array_length(v_section->'facts') < 1 then
        raise exception 'invalid_about_section' using errcode = '22023';
      end if;
      foreach v_locale in array array['zh','en','ar']
      loop
        v_locale_content := v_section->'content'->v_locale;
        foreach v_field in array array['eyebrow','title','text']
        loop
          if jsonb_typeof(v_locale_content) is distinct from 'object'
            or jsonb_typeof(v_locale_content->v_field) is distinct from 'string'
            or nullif(trim(v_locale_content->>v_field), '') is null
            or jsonb_typeof(v_section->'media'->'alt'->v_locale) is distinct from 'string'
            or nullif(trim(v_section->'media'->'alt'->>v_locale), '') is null then
            raise exception 'incomplete_section_translation' using errcode = '22023';
          end if;
        end loop;
      end loop;
      for v_item in select value from jsonb_array_elements(v_section->'facts')
      loop
        if jsonb_typeof(v_item) is distinct from 'object'
          or nullif(trim(v_item->>'id'), '') is null
          or coalesce(v_item->>'sortOrder', '') !~ '^[0-9]+$'
          or jsonb_typeof(v_item->'value') is distinct from 'object'
          or jsonb_typeof(v_item->'label') is distinct from 'object' then
          raise exception 'invalid_about_section' using errcode = '22023';
        end if;
        foreach v_locale in array array['zh','en','ar']
        loop
          if jsonb_typeof(v_item->'value'->v_locale) is distinct from 'string'
            or nullif(trim(v_item->'value'->>v_locale), '') is null
            or jsonb_typeof(v_item->'label'->v_locale) is distinct from 'string'
            or nullif(trim(v_item->'label'->>v_locale), '') is null then
            raise exception 'incomplete_section_translation' using errcode = '22023';
          end if;
        end loop;
      end loop;
      if (
        select count(*) <> count(distinct (fact->>'sortOrder')::integer)
          or count(*) <> count(distinct fact->>'id')
        from jsonb_array_elements(v_section->'facts') fact
      ) then
        raise exception 'invalid_about_section' using errcode = '22023';
      end if;
    elsif v_section_key = 'products' then
      if jsonb_typeof(v_section->'content') is distinct from 'object'
        or jsonb_typeof(v_section->'categories') is distinct from 'array' then
        raise exception 'invalid_products_section' using errcode = '22023';
      end if;
      foreach v_locale in array array['zh','en','ar']
      loop
        v_locale_content := v_section->'content'->v_locale;
        foreach v_field in array array['eyebrow','title','text']
        loop
          if jsonb_typeof(v_locale_content) is distinct from 'object'
            or jsonb_typeof(v_locale_content->v_field) is distinct from 'string'
            or nullif(trim(v_locale_content->>v_field), '') is null then
            raise exception 'incomplete_section_translation' using errcode = '22023';
          end if;
        end loop;
      end loop;
    elsif v_section_key = 'advantages' then
      if jsonb_typeof(v_section->'content') is distinct from 'object'
        or jsonb_typeof(v_section->'steps') is distinct from 'array' then
        raise exception 'invalid_advantages_section' using errcode = '22023';
      end if;
      if jsonb_array_length(v_section->'steps') not between 1 and 8 then
        raise exception 'invalid_advantages_section' using errcode = '22023';
      end if;
      foreach v_locale in array array['zh','en','ar']
      loop
        v_locale_content := v_section->'content'->v_locale;
        foreach v_field in array array['eyebrow','title','description']
        loop
          if jsonb_typeof(v_locale_content) is distinct from 'object'
            or jsonb_typeof(v_locale_content->v_field) is distinct from 'string'
            or nullif(trim(v_locale_content->>v_field), '') is null then
            raise exception 'incomplete_section_translation' using errcode = '22023';
          end if;
        end loop;
      end loop;
      for v_item in select value from jsonb_array_elements(v_section->'steps')
      loop
        if jsonb_typeof(v_item) is distinct from 'object'
          or nullif(trim(v_item->>'id'), '') is null
          or coalesce(v_item->>'sortOrder', '') !~ '^[0-9]+$'
          or coalesce(v_item->>'icon', '') not in ('layers','drafting','package','message','quality','design')
          or jsonb_typeof(v_item->'title') is distinct from 'object'
          or jsonb_typeof(v_item->'text') is distinct from 'object' then
          raise exception 'invalid_advantages_section' using errcode = '22023';
        end if;
        foreach v_locale in array array['zh','en','ar']
        loop
          if jsonb_typeof(v_item->'title'->v_locale) is distinct from 'string'
            or nullif(trim(v_item->'title'->>v_locale), '') is null
            or jsonb_typeof(v_item->'text'->v_locale) is distinct from 'string'
            or nullif(trim(v_item->'text'->>v_locale), '') is null then
            raise exception 'incomplete_section_translation' using errcode = '22023';
          end if;
        end loop;
      end loop;
      if (
        select count(*) <> count(distinct (step->>'sortOrder')::integer)
          or count(*) <> count(distinct step->>'id')
        from jsonb_array_elements(v_section->'steps') step
      ) then
        raise exception 'invalid_advantages_section' using errcode = '22023';
      end if;
    elsif v_section_key = 'contact' then
      if jsonb_typeof(v_section->'content') is distinct from 'object'
        or jsonb_typeof(v_section->'shared') is distinct from 'object'
        or jsonb_typeof(v_section->'shared'->'phone') is distinct from 'string'
        or nullif(trim(v_section->'shared'->>'phone'), '') is null
        or jsonb_typeof(v_section->'shared'->'email') is distinct from 'string'
        or nullif(trim(v_section->'shared'->>'email'), '') is null
        or v_section->'shared'->>'email' !~
          '^[A-Za-z0-9!#$%&''*+/=?^_{}|~-]+(\.[A-Za-z0-9!#$%&''*+/=?^_{}|~-]+)*@[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?)+$' then
        raise exception 'invalid_contact_section' using errcode = '22023';
      end if;
      foreach v_locale in array array['zh','en','ar']
      loop
        v_locale_content := v_section->'content'->v_locale;
        foreach v_field in array array['eyebrow','title','companyName','address']
        loop
          if jsonb_typeof(v_locale_content) is distinct from 'object'
            or jsonb_typeof(v_locale_content->v_field) is distinct from 'string'
            or nullif(trim(v_locale_content->>v_field), '') is null then
            raise exception 'incomplete_section_translation' using errcode = '22023';
          end if;
        end loop;
      end loop;
    end if;
  end loop;

  if (
    select count(*) <> count(distinct (section->>'sortOrder')::integer)
    from jsonb_array_elements(p_payload->'sections') section
  ) then
    raise exception 'invalid_section_sort_order' using errcode = '22023';
  end if;

  select coalesce(
    jsonb_agg(to_jsonb(section_row) order by section_row.sort_order),
    '[]'::jsonb
  )
  into v_before
  from public.site_sections section_row;

  -- Lock and compare every baseline before the first mutation. A stale caller
  -- therefore cannot write sections, categories, translations, or audit rows.
  foreach v_section_key in array v_expected_keys
  loop
    select section_row.updated_at
    into v_current_updated_at
    from public.site_sections section_row
    where section_row.key = v_section_key
    for update;
    if v_current_updated_at is null then
      raise exception 'site_content_missing' using errcode = '23502';
    end if;

    select baseline_item->>'updatedAt'
    into v_baseline_text
    from jsonb_array_elements(coalesce(p_baseline->'sections', '[]'::jsonb)) baseline_item
    where baseline_item->>'key' = v_section_key;
    v_baseline_text := coalesce(
      v_baseline_text,
      (
        select baseline_item->>'updated_at'
        from jsonb_array_elements(coalesce(p_baseline->'sections', '[]'::jsonb)) baseline_item
        where baseline_item->>'key' = v_section_key
      ),
      p_baseline->v_section_key->>'updatedAt',
      p_baseline->v_section_key->>'updated_at',
      p_baseline->>v_section_key
    );
    begin
      v_baseline_updated_at := v_baseline_text::timestamptz;
    exception when others then
      raise exception using errcode = '40001', message = 'site_content_conflict';
    end;
    if v_current_updated_at is distinct from v_baseline_updated_at then
      raise exception using errcode = '40001', message = 'site_content_conflict';
    end if;
  end loop;

  select section->'categories'
  into v_categories
  from jsonb_array_elements(p_payload->'sections') section
  where section->>'key' = 'products';
  if jsonb_typeof(v_categories) is distinct from 'array' then
    raise exception 'invalid product categories' using errcode = '22023';
  end if;
  if jsonb_array_length(v_categories) = 0
    or not exists (
      select 1
      from jsonb_array_elements(v_categories) category
      where category->'enabled' = 'true'::jsonb
    )
    or exists (
      select 1
      from jsonb_array_elements(v_categories) category
      where jsonb_typeof(category) is distinct from 'object'
        or nullif(trim(category->>'id'), '') is null
        or coalesce(category->>'slug', '') !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
        or jsonb_typeof(category->'enabled') is distinct from 'boolean'
        or coalesce(category->>'sortOrder', '') !~ '^[0-9]+$'
        or coalesce(category->>'productReferenceCount', '') !~ '^[0-9]+$'
    )
    or (
      select count(*) <> count(distinct category->>'slug')
        or count(*) <> count(distinct category->>'id')
        or count(*) <> count(distinct (category->>'sortOrder')::integer)
      from jsonb_array_elements(v_categories) category
    ) then
    raise exception 'invalid product categories' using errcode = '22023';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(v_categories) category
    cross join unnest(array['zh','en','ar']) required_locale(locale)
    where jsonb_typeof(category->'translations') is distinct from 'object'
      or jsonb_typeof(category->'translations'->required_locale.locale)
        is distinct from 'object'
      or jsonb_typeof(category->'translations'->required_locale.locale->'name')
        is distinct from 'string'
      or nullif(trim(category->'translations'->required_locale.locale->>'name'), '') is null
      or jsonb_typeof(category->'translations'->required_locale.locale->'description')
        is distinct from 'string'
      or nullif(
        trim(category->'translations'->required_locale.locale->>'description'),
        ''
      ) is null
  ) then
    raise exception 'invalid_category_translation' using errcode = '22023';
  end if;

  if exists (
    select 1
    from public.product_categories existing
    where not exists (
      select 1
      from jsonb_array_elements(v_categories) category
      where category->>'slug' = existing.slug
    )
      and exists (
        select 1
        from public.products product
        where product.category_id = existing.id
      )
  ) then
    raise exception using errcode = '23503', message = 'category_in_use';
  end if;

  for v_section in select value from jsonb_array_elements(p_payload->'sections')
  loop
    update public.site_sections
    set sort_order = (v_section->>'sortOrder')::integer,
        layout_key = v_section->>'layout',
         content = case
           when v_section->>'key' = 'contact' then jsonb_build_object(
             'enabled', true,
             'content', jsonb_build_object(
               'zh', jsonb_build_object(
                 'eyebrow', v_section->'content'->'zh'->'eyebrow',
                 'title', v_section->'content'->'zh'->'title',
                 'companyName', v_section->'content'->'zh'->'companyName',
                 'address', v_section->'content'->'zh'->'address'
               ),
               'en', jsonb_build_object(
                 'eyebrow', v_section->'content'->'en'->'eyebrow',
                 'title', v_section->'content'->'en'->'title',
                 'companyName', v_section->'content'->'en'->'companyName',
                 'address', v_section->'content'->'en'->'address'
               ),
               'ar', jsonb_build_object(
                 'eyebrow', v_section->'content'->'ar'->'eyebrow',
                 'title', v_section->'content'->'ar'->'title',
                 'companyName', v_section->'content'->'ar'->'companyName',
                 'address', v_section->'content'->'ar'->'address'
               )
             ),
             'shared', jsonb_build_object(
               'phone', v_section->'shared'->'phone',
               'email', v_section->'shared'->'email'
             )
           )
           else (v_section
             - 'key'
             - 'sortOrder'
             - 'layout'
             - 'categories'
             - 'updatedAt') #- '{media,mediaId}'
         end,
        media_id = case
          when v_section->>'key' in ('home','about')
            then nullif(v_section->'media'->>'mediaId', '')::uuid
          else null
        end,
        updated_by = (select auth.uid()),
        updated_at = v_saved_at
    where key = v_section->>'key';
  end loop;

  for v_category in select value from jsonb_array_elements(v_categories)
  loop
    v_category_slug := v_category->>'slug';
    select id into v_category_id
    from public.product_categories
    where slug = v_category_slug
    for update;

    if v_category_id is null then
      if coalesce(v_category->>'id', '') ~
        '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
        v_category_id := (v_category->>'id')::uuid;
      else
        v_category_id := gen_random_uuid();
      end if;
      insert into public.product_categories (
        id, slug, sort_order, is_enabled, updated_at
      )
      values (
        v_category_id,
        v_category_slug,
        (v_category->>'sortOrder')::integer,
        (v_category->>'enabled')::boolean,
        v_saved_at
      );
    else
      update public.product_categories
      set sort_order = (v_category->>'sortOrder')::integer,
          is_enabled = (v_category->>'enabled')::boolean,
          updated_at = v_saved_at
      where id = v_category_id;
    end if;

    foreach v_locale in array array['zh','en','ar']
    loop
      insert into public.product_category_translations (
        category_id, locale, name, description
      )
      values (
        v_category_id,
        v_locale,
        trim(v_category->'translations'->v_locale->>'name'),
        trim(v_category->'translations'->v_locale->>'description')
      )
      on conflict (category_id, locale) do update
      set name = excluded.name,
          description = excluded.description;
    end loop;
  end loop;

  delete from public.product_categories existing
  where not exists (
    select 1
    from jsonb_array_elements(v_categories) category
    where category->>'slug' = existing.slug
  );

  insert into public.audit_logs (
    actor_id,
    action,
    resource_type,
    resource_id,
    before_data,
    after_data,
    created_at
  )
  values (
    (select auth.uid()),
    'save',
    'site_content',
    'site',
    v_before,
    p_payload,
    v_saved_at
  );
  return v_saved_at;
end;
$$;

-- Keep the legacy slug column as a compatibility bridge for the V1.4 catalog
-- backup/import RPCs. category_id is authoritative and the trigger prevents
-- drift in either old or new callers. The fixed-category check is removed so
-- newly created CMS categories remain usable by those compatibility paths.
alter table public.products
  drop constraint if exists products_category_check;

create or replace function public.sync_product_category_v1()
returns trigger
language plpgsql
set search_path=''
as $$
declare
  v_category_id uuid;
  v_category_slug text;
begin
  if tg_op = 'INSERT' then
    if new.category_id is not null then
      select slug into v_category_slug
      from public.product_categories
      where id = new.category_id;
      if v_category_slug is null then
        raise exception 'category not found' using errcode = '23503';
      end if;
      new.category := v_category_slug;
    else
      select id into v_category_id
      from public.product_categories
      where slug = new.category;
      if v_category_id is null then
        raise exception 'category not found' using errcode = '23503';
      end if;
      new.category_id := v_category_id;
    end if;
  elsif new.category_id is distinct from old.category_id then
    select slug into v_category_slug
    from public.product_categories
    where id = new.category_id;
    if v_category_slug is null then
      raise exception 'category not found' using errcode = '23503';
    end if;
    new.category := v_category_slug;
  elsif new.category is distinct from old.category then
    select id into v_category_id
    from public.product_categories
    where slug = new.category;
    if v_category_id is null then
      raise exception 'category not found' using errcode = '23503';
    end if;
    new.category_id := v_category_id;
  end if;
  return new;
end;
$$;

create trigger sync_product_category_v1
before insert or update of category_id, category on public.products
for each row execute function public.sync_product_category_v1();

-- V1.4 accepted category slugs because product_categories did not exist yet.
-- Keep those thoroughly validated data writers as private implementation
-- helpers, then make the V1.5 public contracts validate and assign the
-- authoritative category UUID explicitly in the same transaction.
alter function public.replace_product_catalog_v1(jsonb)
  rename to replace_product_catalog_v1_slug_legacy;
alter function public.restore_product_catalog_snapshot_v1(jsonb)
  rename to restore_product_catalog_snapshot_v1_slug_legacy;

revoke all on function public.replace_product_catalog_v1_slug_legacy(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.restore_product_catalog_snapshot_v1_slug_legacy(jsonb)
  from public, anon, authenticated, service_role;

create function public.replace_product_catalog_v1(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_product jsonb;
  v_category_id uuid;
  v_category_slug text;
  v_normalized_products jsonb;
  v_normalized_payload jsonb;
  v_result jsonb;
begin
  if jsonb_typeof(p_payload)<>'object'
    or p_payload->>'version'<>'1.0'
    or jsonb_typeof(p_payload->'products')<>'array' then
    raise exception 'invalid product catalog structure' using errcode='22023';
  end if;

  for v_product in select value from jsonb_array_elements(p_payload->'products')
  loop
    if coalesce(v_product->>'categoryId','') !~
      '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      or length(trim(coalesce(v_product->>'categorySlug','')))=0 then
      raise exception 'invalid product category identity' using errcode='22023';
    end if;
    v_category_id := (v_product->>'categoryId')::uuid;
    v_category_slug := v_product->>'categorySlug';
    if not exists (
      select 1 from public.product_categories category
      where category.id=v_category_id
        and category.slug=v_category_slug
        and category.is_enabled
    ) then
      raise exception 'category id and slug do not match an enabled category'
        using errcode='22023';
    end if;
  end loop;

  -- The private V1.4 helper still performs the complete catalog/media
  -- validation and replacement. Its temporary bridge slug is overwritten by
  -- the explicit category_id writes below before this transaction can commit.
  select coalesce(
    jsonb_agg(product || jsonb_build_object('category','bra-pads')),
    '[]'::jsonb
  ) into v_normalized_products
  from jsonb_array_elements(p_payload->'products') as catalog(product);
  v_normalized_payload := jsonb_set(p_payload, '{products}', v_normalized_products);
  v_result := public.replace_product_catalog_v1_slug_legacy(v_normalized_payload);

  for v_product in select value from jsonb_array_elements(p_payload->'products')
  loop
    update public.products
    set category_id=(v_product->>'categoryId')::uuid
    where slug=v_product->>'slug';
    if not found then
      raise exception 'catalog product missing after replacement' using errcode='P0001';
    end if;
  end loop;
  return v_result;
end;
$$;

create function public.restore_product_catalog_snapshot_v1(p_snapshot jsonb)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_product jsonb;
  v_category_id uuid;
  v_category_slug text;
  v_products_with_ids jsonb := '[]'::jsonb;
  v_legacy_products jsonb;
  v_normalized_snapshot jsonb;
  v_result jsonb;
begin
  if jsonb_typeof(p_snapshot)<>'object'
    or p_snapshot->>'version'<>'1.0'
    or jsonb_typeof(p_snapshot->'products')<>'array' then
    raise exception 'invalid product catalog snapshot structure' using errcode='22023';
  end if;

  for v_product in select value from jsonb_array_elements(p_snapshot->'products')
  loop
    v_category_slug := v_product->>'category';
    if length(trim(coalesce(v_category_slug,'')))=0 then
      raise exception 'invalid snapshot product category identity' using errcode='22023';
    end if;

    if v_product ? 'category_id' then
      if coalesce(v_product->>'category_id','') !~
        '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
        raise exception 'invalid snapshot product category identity' using errcode='22023';
      end if;
      v_category_id := (v_product->>'category_id')::uuid;
      if not exists (
        select 1 from public.product_categories category
        where category.id=v_category_id and category.slug=v_category_slug
      ) then
        raise exception 'category id and slug do not match'
          using errcode='22023';
      end if;
    else
      -- V1.4 snapshots predate category_id. Resolve their stable slug once,
      -- inject the canonical UUID, and use that normalized product for every
      -- subsequent helper call and authoritative write-back.
      v_category_id := null;
      select category.id into v_category_id
      from public.product_categories category
      where category.slug=v_category_slug;
      if v_category_id is null then
        raise exception 'category slug not found'
          using errcode='22023';
      end if;
    end if;

    v_products_with_ids := v_products_with_ids || jsonb_build_array(
      v_product || jsonb_build_object('category_id',v_category_id)
    );
  end loop;

  select coalesce(
    jsonb_agg(product || jsonb_build_object('category','bra-pads')),
    '[]'::jsonb
  ) into v_legacy_products
  from jsonb_array_elements(v_products_with_ids) as snapshot(product);
  v_normalized_snapshot := jsonb_set(p_snapshot, '{products}', v_legacy_products);
  v_result := public.restore_product_catalog_snapshot_v1_slug_legacy(v_normalized_snapshot);

  for v_product in select value from jsonb_array_elements(v_products_with_ids)
  loop
    update public.products
    set category_id=(v_product->>'category_id')::uuid
    where id=(v_product->>'id')::uuid;
    if not found then
      raise exception 'snapshot product missing after restore' using errcode='P0001';
    end if;
  end loop;
  return v_result;
end;
$$;

revoke all on function public.replace_product_catalog_v1(jsonb)
  from public, anon, authenticated;
grant execute on function public.replace_product_catalog_v1(jsonb) to service_role;
revoke all on function public.restore_product_catalog_snapshot_v1(jsonb)
  from public, anon, authenticated;
grant execute on function public.restore_product_catalog_snapshot_v1(jsonb) to service_role;

alter table public.inquiries
  drop column product_category;

alter table public.site_sections enable row level security;
alter table public.product_categories enable row level security;
alter table public.product_category_translations enable row level security;

create policy site_sections_public_read
  on public.site_sections for select
  to anon, authenticated
  using (true);

create policy product_categories_anon_read
  on public.product_categories for select
  to anon
  using (is_enabled);
create policy product_categories_authenticated_read
  on public.product_categories for select
  to authenticated
  using (
    is_enabled
    or public.has_permission('pages','view')
    or public.has_permission('products','view')
  );

create policy product_category_translations_anon_read
  on public.product_category_translations for select
  to anon
  using (
    exists (
      select 1
      from public.product_categories category
      where category.id = category_id and category.is_enabled
    )
  );
create policy product_category_translations_authenticated_read
  on public.product_category_translations for select
  to authenticated
  using (
    exists (
      select 1
      from public.product_categories category
      where category.id = category_id
        and (
          category.is_enabled
          or public.has_permission('pages','view')
          or public.has_permission('products','view')
        )
    )
  );

grant select on public.site_sections to anon, authenticated;
grant select on public.product_categories to anon, authenticated;
grant select on public.product_category_translations to anon, authenticated;
grant all on public.site_sections to service_role;
grant all on public.product_categories to service_role;
grant all on public.product_category_translations to service_role;

revoke all on function public.product_payload(public.products) from public;
revoke all on function public.product_payload(public.products) from anon, authenticated;
grant execute on function public.product_payload(public.products) to service_role;

revoke all on function public.list_published_products(text,integer,integer,uuid) from public;
revoke all on function public.list_published_products(text,integer,integer,uuid) from anon, authenticated;
grant execute on function public.list_published_products(text,integer,integer,uuid) to service_role;

revoke all on function public.get_published_product(text) from public;
revoke all on function public.get_published_product(text) from anon, authenticated;
grant execute on function public.get_published_product(text) to service_role;

revoke all on function public.publish_product_version(uuid,integer,uuid) from public;
revoke all on function public.publish_product_version(uuid,integer,uuid) from anon;
grant execute on function public.publish_product_version(uuid,integer,uuid) to authenticated;

revoke all on function public.rollback_product_version(uuid,integer,integer,uuid) from public;
revoke all on function public.rollback_product_version(uuid,integer,integer,uuid) from anon;
grant execute on function public.rollback_product_version(uuid,integer,integer,uuid) to authenticated;

revoke all on function public.accept_inquiry(uuid,jsonb,text,text,uuid) from public;
revoke all on function public.accept_inquiry(uuid,jsonb,text,text,uuid) from anon, authenticated;
grant execute on function public.accept_inquiry(uuid,jsonb,text,text,uuid) to service_role;

revoke all on function public.sync_product_category_v1() from public, anon, authenticated;

revoke all on function public.save_site_content_v1(jsonb,jsonb) from public;
revoke all on function public.save_site_content_v1(jsonb,jsonb) from anon;
grant execute on function public.save_site_content_v1(jsonb,jsonb) to authenticated;

create or replace function public.verify_site_content_setup_v1()
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select pg_catalog.has_function_privilege(
    'anon'::name,
    'public.save_site_content_v1(jsonb,jsonb)'::regprocedure,
    'EXECUTE'
  )
$$;

create or replace function public.set_site_content_seed_media_v1(
  p_home_media_id uuid,
  p_home_public_url text,
  p_about_media_id uuid,
  p_about_public_url text
)
returns timestamptz
language plpgsql
security definer
set search_path=''
as $$
declare
  v_saved_at timestamptz := clock_timestamp();
  v_existing_saved_at timestamptz;
  v_ready boolean;
  v_updated integer;
begin
  if p_home_media_id is null
    or p_about_media_id is null
    or p_home_media_id = p_about_media_id
    or nullif(trim(p_home_public_url), '') is null
    or nullif(trim(p_about_public_url), '') is null
    or p_home_public_url = p_about_public_url then
    raise exception using errcode = '22023', message = 'site_content_seed_media_invalid';
  end if;

  if (
    select count(*)
    from public.media media
    where media.deleted_at is null
      and (
        (media.id = p_home_media_id and media.storage_path = p_home_public_url)
        or (media.id = p_about_media_id and media.storage_path = p_about_public_url)
      )
  ) <> 2 then
    raise exception using errcode = '22023', message = 'site_content_seed_media_invalid';
  end if;

  if (
    select count(*)
    from public.site_sections section
    where section.key in ('home','about')
      and jsonb_typeof(section.content->'media') = 'object'
      and jsonb_typeof(section.content->'media'->'image') = 'string'
  ) <> 2 then
    raise exception using errcode = '22023', message = 'site_content_seed_sections_invalid';
  end if;

  select
    bool_and(
      section.media_id = case section.key
        when 'home' then p_home_media_id
        else p_about_media_id
      end
      and section.content->'media'->>'image' = case section.key
        when 'home' then p_home_public_url
        else p_about_public_url
      end
    ) and min(section.updated_at) = max(section.updated_at),
    max(section.updated_at)
  into v_ready, v_existing_saved_at
  from public.site_sections section
  where section.key in ('home','about');

  if v_ready is true then
    return v_existing_saved_at;
  end if;

  update public.site_sections section
  set media_id = case section.key
        when 'home' then p_home_media_id
        else p_about_media_id
      end,
      content = jsonb_set(section.content, '{media,image}', to_jsonb(
        case section.key
          when 'home' then p_home_public_url
          else p_about_public_url
        end
      ), false),
      updated_at = v_saved_at
  where section.key in ('home','about');
  get diagnostics v_updated = row_count;
  if v_updated <> 2 then
    raise exception using errcode = 'P0001', message = 'site_content_seed_sections_invalid';
  end if;
  return v_saved_at;
end;
$$;

revoke all on function public.verify_site_content_setup_v1() from public, anon, authenticated;
grant execute on function public.verify_site_content_setup_v1() to service_role;
revoke all on function public.set_site_content_seed_media_v1(uuid,text,uuid,text) from public, anon, authenticated;
grant execute on function public.set_site_content_seed_media_v1(uuid,text,uuid,text) to service_role;
