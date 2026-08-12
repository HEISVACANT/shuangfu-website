-- Shuangfu corporate site foreign-key indexes and trigger privilege V1.3

create index if not exists audit_logs_actor_idx
  on public.audit_logs (actor_id);
create index if not exists email_outbox_inquiry_idx
  on public.email_outbox (inquiry_id);
create index if not exists inquiry_followups_author_idx
  on public.inquiry_followups (author_id);
create index if not exists product_images_media_idx
  on public.product_images (media_id);
create index if not exists profile_groups_group_idx
  on public.profile_groups (group_id);
create index if not exists published_versions_publisher_idx
  on public.published_versions (published_by);
create index if not exists site_settings_updated_by_idx
  on public.site_settings (updated_by);

revoke execute on function public.enforce_product_image_limit()
  from public, anon, authenticated;
