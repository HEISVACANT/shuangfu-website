# 双芙三语企业官网与管理后台 V1.0

面向六安市双芙服装辅料有限公司的 Next.js 全栈官网。包含中英阿三语前台、阿文 RTL、胸垫/罩杯二级产品详情、定制范围、合作咨询，以及内容、产品、媒体、线索、权限、版本和审计后台。

## 本地运行

```bash
npm install
cp .env.example .env.local
npm run dev
```

未配置 Supabase 时，前台使用明确标注的预发布示例内容，后台进入只读预览模式，咨询返回 `development-preview`，不会伪装成持久化数据。

## 校验命令

```bash
npm run typecheck
npm run lint
npm test
npm run test:e2e
npm run build
npm audit
```

数据库、环境变量、首位系统所有者和预发布说明见 [部署配置 V1.0](docs/setup-deployment-v1.0.md)。正式公开前必须替换全部占位素材、确认联系方式并完成人工三语审校与隐私政策审批。
