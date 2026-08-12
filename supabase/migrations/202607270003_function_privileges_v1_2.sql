-- Shuangfu corporate site function and storage privilege hardening V1.2

-- Supabase may grant function execution directly to API roles through default
-- privileges. Revoke from the concrete roles, not only from PUBLIC.
revoke execute on function public.handle_new_user() from anon, authenticated;
revoke execute on function public.protect_system_owner() from anon, authenticated;
revoke execute on function public.enforce_product_image_limit() from anon, authenticated;

revoke execute on function public.accept_inquiry(uuid, jsonb, text, text) from anon, authenticated;
revoke execute on function public.check_and_record_inquiry_rate_limit(text, text) from anon, authenticated;
grant execute on function public.accept_inquiry(uuid, jsonb, text, text) to service_role;
grant execute on function public.check_and_record_inquiry_rate_limit(text, text) to service_role;

revoke execute on function public.product_payload(public.products) from anon, authenticated;
revoke execute on function public.list_published_products(text, integer, integer, uuid) from anon, authenticated;
revoke execute on function public.get_published_product(text) from anon, authenticated;
grant execute on function public.product_payload(public.products) to service_role;
grant execute on function public.list_published_products(text, integer, integer, uuid) to service_role;
grant execute on function public.get_published_product(text) to service_role;

revoke execute on function public.has_permission(text, public.permission_action) from anon;
revoke execute on function public.publish_page_version(uuid, integer, uuid) from anon;
revoke execute on function public.rollback_page_version(uuid, integer, integer, uuid) from anon;
revoke execute on function public.publish_product_version(uuid, integer, uuid) from anon;
revoke execute on function public.rollback_product_version(uuid, integer, integer, uuid) from anon;

-- These functions validate auth.uid() and the permission matrix internally.
grant execute on function public.has_permission(text, public.permission_action) to authenticated;
grant execute on function public.publish_page_version(uuid, integer, uuid) to authenticated;
grant execute on function public.rollback_page_version(uuid, integer, integer, uuid) to authenticated;
grant execute on function public.publish_product_version(uuid, integer, uuid) to authenticated;
grant execute on function public.rollback_product_version(uuid, integer, integer, uuid) to authenticated;

-- Public buckets can serve object URLs without a broad SELECT policy. Removing
-- it prevents anonymous clients from listing every object in the bucket.
drop policy if exists media_storage_public_read on storage.objects;
