# Product Catalog Preview Blockers V1.0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore independent trilingual product editing and make the authenticated media API work in the Vercel Preview runtime.

**Architecture:** Keep the existing React Hook Form product model and force locale-bound controls to remount whenever the active locale changes, so each control registers the correct nested field path. Keep Sharp out of the media route module initialization and load it only inside the upload path, so media listing does not depend on the native image runtime.

**Tech Stack:** Next.js 16 App Router, React 19, React Hook Form, Vitest, Testing Library, Sharp, Vercel Preview, Supabase.

## Global Constraints

- Change only the product locale editor, media route, and their direct regression tests.
- Preserve the current Supabase schema and staging data.
- Do not merge `main` or deploy Production.
- Verify through the authenticated Preview UI and a direct Supabase read after deployment.

---

### Task 1: Preserve independent values across locale switches

**Files:**
- Modify: `src/components/admin/products/product-drawer-v2.tsx`
- Test: `src/components/admin/products/product-drawer-v2.test.tsx`

**Interfaces:**
- Consumes: `ProductInputV2.translations`, `ProductInputV2.specifications`, `activeLocale`.
- Produces: locale-bound controls whose registration follows `translations.<locale>.*` and `specifications.<index>.*.<locale>`.

- [ ] **Step 1: Write the failing test**

```tsx
it("keeps translation and specification values isolated across locale switches", async () => {
  // Enter distinct zh, en, and ar values, revisit each tab, and assert literals.
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run src/components/admin/products/product-drawer-v2.test.tsx`

Expected: FAIL because the final locale overwrites values shown by earlier tabs.

- [ ] **Step 3: Write minimal implementation**

```tsx
<section key={activeLocale} role="tabpanel">
  {/* locale-bound registered controls */}
</section>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --run src/components/admin/products/product-drawer-v2.test.tsx`

Expected: PASS with distinct literal values restored on every tab.

### Task 2: Keep media listing independent from Sharp

**Files:**
- Modify: `src/app/api/admin/media/route.ts`
- Test: `src/app/api/admin/media/route-sharp-isolation.test.ts`

**Interfaces:**
- Consumes: authenticated GET and POST requests for `/api/admin/media`.
- Produces: GET that never initializes Sharp; POST that lazily imports and invokes Sharp only after authentication and file validation.

- [ ] **Step 1: Write the failing test**

```ts
it("lists media without loading the native image processor", async () => {
  const routeModule = import("@/app/api/admin/media/route");
  await expect(routeModule).resolves.toHaveProperty("GET");
  const response = await (await routeModule).GET(
    new Request("http://localhost/api/admin/media")
  );
  expect(response.status).toBe(200);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run src/app/api/admin/media/route-sharp-isolation.test.ts`

Expected: FAIL because Sharp is currently imported when the route module initializes.

- [ ] **Step 3: Write minimal implementation**

```ts
const sharp = (await import("sharp")).default;
```

Call the loader only in `POST`, after permission and input validation.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --run src/app/api/admin/media/route-sharp-isolation.test.ts src/app/api/admin/media/route.test.ts`

Expected: PASS and GET remains independent of Sharp.

### Task 3: Verify, deploy, and run the staging acceptance flow

**Files:**
- Verify only: all tracked source and test files.

**Interfaces:**
- Consumes: PR branch `codex/shuangfu-site-v1` and branch-scoped Preview environment variables.
- Produces: a READY Preview deployment and a published staging test product visible in zh, en, and ar.

- [ ] **Step 1: Run repository verification**

Run: `npm test && npm run typecheck && npm run lint && npm run build`

- [ ] **Step 2: Commit and push the scoped files**

Stage only the plan, two production files, and their two test files; push `codex/shuangfu-site-v1`.

- [ ] **Step 3: Deploy Preview**

Deploy the exact pushed commit with the existing branch-scoped environment variables and without the Hobby-incompatible cron schedule.

- [ ] **Step 4: Run the browser acceptance flow**

Create `QA-PREVIEW-20260812-01`, provide distinct zh/en/ar names and specifications, upload one staging image, save, refresh, publish, and verify all three public locales.

- [ ] **Step 5: Verify Supabase persistence**

Read the test product, translations, image relation, media record, specification translations, and audit trail from staging without exposing secret values.
