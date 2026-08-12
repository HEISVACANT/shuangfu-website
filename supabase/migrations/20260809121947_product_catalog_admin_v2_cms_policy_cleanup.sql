-- Remove the equivalent anonymous read policies installed by CMS V1.5.
-- Product catalog V2 owns the surviving public read policies.
drop policy if exists product_categories_anon_read on public.product_categories;
drop policy if exists product_category_translations_anon_read on public.product_category_translations;
