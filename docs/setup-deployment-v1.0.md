# 双芙官网部署配置 V1.0

## 1. Supabase

1. 新建独立的预发布 Supabase 项目。
2. 按迁移历史顺序应用 `supabase/migrations/` 中的迁移；页面内容配置依赖
   `202607290006_site_content_cms_v1_5.sql`。迁移必须先在预发布项目验证，
   不得直接跳过预发布应用到生产。
3. 在 Authentication 创建首位管理员；触发器会自动创建 `profiles` 记录。
4. 仅在 SQL Editor 中将该用户设为系统所有者：

   ```sql
   update public.profiles set is_system_owner = true where id = '<auth user uuid>';
   ```

5. 系统所有者不可通过后台删除、停用或清空权限。后续用户应通过权限组管理。

浏览器优先使用 `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`；已有环境可继续使用
`NEXT_PUBLIC_SUPABASE_ANON_KEY`。服务端优先使用 `SUPABASE_SECRET_KEY`；已有环境可继续使用
`SUPABASE_SERVICE_ROLE_KEY`。secret/service-role key 只配置在服务端和受控维护环境，
绝不写入公开代码、浏览器、命令输出或文档实例值。

## 2. 环境变量

复制 `.env.example` 到 `.env.local`，分别配置预发布值。`IP_HASH_SECRET` 与 `CRON_SECRET` 使用独立高熵随机值；Resend 发件域名、负责人邮箱和 Turnstile 域名必须属于预发布环境。

页面内容维护脚本读取以下变量：

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SECRET_KEY`，或兼容变量 `SUPABASE_SERVICE_ROLE_KEY`
- 只读公开访问核验还需要 `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`，或兼容变量
  `NEXT_PUBLIC_SUPABASE_ANON_KEY`

脚本只输出有界计数和布尔状态，不输出 key、媒体 URL、记录 ID 或完整页面内容。

## 3. 页面内容 V1.5 初始化与核验

确认 V1.5 migration 已应用、表结构/RLS/函数权限与 Supabase advisors 均通过后，在预发布环境执行：

```bash
node scripts/seed-site-content-media-v1.mjs
node scripts/verify-site-content-staging-v1.mjs
```

媒体种子脚本只处理以下固定对象，并在上传和插入前检查已有对象与 `media` 行；两张图准备完成后，通过仅 service role 可执行的数据库函数在同一事务中更新首页和企业介绍引用。任一媒体校验失败时两个正式引用都不变，重复执行不会重复上传：

- `site-content-v1/home/hero-products-placeholder-v1.png`
- `site-content-v1/about/company-craft-placeholder-v1.png`

种子成功时，首页和企业介绍均输出 `ready=true`。只读核验成功时应包含：

```text
sections=5
locales=zh,en,ar
enabledCategories=<至少 1>
mediaReady=true
publicRead=true
saveFunctionPublicExecute=false
```

该核验会通过仅 service role 可执行的 ACL 检查函数读取真实函数权限，并同时比对 Storage 固定对象、`media` 行、板块 `media_id` 和公开 URL。因此该核验只证明预发布项目已具备五板块、三语、启用分类、媒体引用、公开读取及匿名禁止保存的基础条件。
仍需在已登录后台做一次不改变内容语义的“保存并立即生效”，再分别读取 `/zh`、`/en`、`/ar`
完成真实闭环。脚本不会创建询盘、删除业务数据或修改生产环境。

## 4. 邮件与定时任务

咨询由数据库函数原子写入 `inquiries` 与 `email_outbox`。接口落库成功即返回 202；Resend 异常不会删除线索。`vercel.json` 每 15 分钟调用发件箱任务，使用 `Authorization: Bearer <CRON_SECRET>` 校验。

## 5. 预发布限制

- 非 production 环境自动输出 `noindex`，`robots.txt` 禁止抓取。
- 当前 `public/images/*placeholder-v1.png` 和示例产品均为设计占位。
- 企业截图中的电话、邮箱和地址仅用于受控预览，公开前需再次确认。
- 生产域名、真实素材、正式数据和公开部署不在本次实施授权范围内。

## 6. 正式发布门槛

真实 Logo、产品与工厂素材；业务电话和邮箱；中英阿人工审校；正式隐私政策；Resend 发件域名；Turnstile 域名；生产 Supabase/Vercel 账号；正式域名均确认后，再单独取得公开授权。
