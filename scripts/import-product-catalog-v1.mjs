import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";

const { loadEnvConfig } = nextEnv;
const PROJECT_ROOT = process.cwd();
const CATALOG_PATH = path.join(PROJECT_ROOT, "data/product-catalog-v1.json");
const IMAGE_DIRECTORY = path.join(PROJECT_ROOT, "public/images/products/catalog-v1");
const BACKUP_DIRECTORY = path.join(PROJECT_ROOT, "artifacts/product-import-v1.0");
const SUPPORTED_COMMANDS = new Set(["backup", "apply", "restore"]);

export function parseCatalogCommand(args) {
  const [command, backupFile, ...extra] = args;
  if (!SUPPORTED_COMMANDS.has(command) || extra.length > 0 || (command !== "restore" && backupFile)) {
    throw new Error("Usage: import-product-catalog-v1.mjs backup|apply|restore [backup-file]");
  }
  return { command, backupFile };
}

export function buildBackupFileName(now = new Date()) {
  const timestamp = now.toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15);
  return `product-catalog-before-v1.0-${timestamp}.json`;
}

export function buildImportReportFileName(now = new Date()) {
  const timestamp = now.toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15);
  return `product-catalog-import-v1.0-${timestamp}.json`;
}

export async function writeImportReport({
  backupFile,
  now = new Date(),
  reportDirectory = BACKUP_DIRECTORY,
  productCount = 10,
  imageCount = 11
}) {
  const report = {
    version: "1.0",
    operation: "apply",
    completedAt: now.toISOString(),
    backupFile,
    productCount,
    imageCount
  };
  await mkdir(reportDirectory, { recursive: true });
  const reportFile = path.join(reportDirectory, buildImportReportFileName(now));
  await writeFile(reportFile, `${JSON.stringify(report, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
    flag: "wx"
  });
  console.log(`[catalog:apply] ${path.relative(PROJECT_ROOT, reportFile)}`);
  return reportFile;
}

async function readSourceCatalog(catalogPath = CATALOG_PATH) {
  return JSON.parse(await readFile(catalogPath, "utf8"));
}

function assertCatalogTotals(payload) {
  const productCount = payload.products.length;
  const imageCount = payload.products.reduce((count, product) => count + product.images.length, 0);
  if (payload.version !== "1.0" || productCount !== 10 || imageCount !== 11) {
    throw new Error(`Invalid normalized catalog totals: products=${productCount}, images=${imageCount}`);
  }
}

export async function buildImportPayload({
  catalogPath = CATALOG_PATH,
  imageDirectory = IMAGE_DIRECTORY,
  categoryIdsBySlug,
  getPublicUrl
} = {}) {
  if (typeof getPublicUrl !== "function") throw new Error("getPublicUrl is required");
  const source = await readSourceCatalog(catalogPath);
  if (!Array.isArray(source.products)) throw new Error("Source catalog products are missing");

  const products = await Promise.all(source.products.map(async (product) => ({
    slug: product.slug,
    category: product.category,
    categoryId: categoryIdsBySlug?.get(product.category),
    categorySlug: product.category,
    sortOrder: product.sortOrder,
    translations: product.translations,
    specifications: product.specifications,
    images: await Promise.all(product.images.map(async (image) => {
      const storagePath = `catalog-v1/${image.fileName}`;
      const imagePath = path.join(imageDirectory, image.fileName);
      const [file, metadata] = await Promise.all([stat(imagePath), sharp(imagePath).metadata()]);
      if (!metadata.width || !metadata.height) throw new Error(`Image dimensions unavailable: ${image.fileName}`);
      return {
        storagePath,
        publicUrl: getPublicUrl(storagePath),
        mimeType: "image/webp",
        byteSize: file.size,
        width: metadata.width,
        height: metadata.height,
        alt: image.alt
      };
    }))
  })));

  const payload = { version: "1.0", products };
  assertCatalogTotals(payload);
  return payload;
}

export async function resolveImportCategoryMapV1(supabase, sourceSlugs) {
  const slugs = [...new Set(sourceSlugs)].sort();
  const { data, error } = await supabase
    .from("product_categories")
    .select("id, slug, is_enabled")
    .in("slug", slugs);
  if (error) throw stageError("categories:resolve", error);
  const categoryIdsBySlug = new Map(
    (data ?? [])
      .filter((category) => category.is_enabled)
      .map((category) => [category.slug, category.id])
  );
  for (const slug of slugs) {
    if (!categoryIdsBySlug.has(slug)) {
      throw stageError("categories:resolve", new Error(`Unknown product category slug: ${slug}`));
    }
  }
  return categoryIdsBySlug;
}

function createAdminClient() {
  loadEnvConfig(PROJECT_ROOT);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !secret) throw new Error("Supabase server environment is incomplete");
  return createClient(url, secret, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
}

function stageError(stage, error) {
  const wrapped = new Error(error instanceof Error ? error.message : String(error));
  wrapped.stage = stage;
  return wrapped;
}

function assertSnapshotShape(snapshot) {
  const arrayKeys = ["products", "translations", "media", "productImages", "specifications"];
  if (!snapshot || snapshot.version !== "1.0" || arrayKeys.some((key) => !Array.isArray(snapshot[key]))) {
    throw new Error("Product catalog snapshot structure is invalid");
  }
}

async function listCatalogV1Objects(supabase, stage) {
  const objects = [];
  let offset = 0;
  while (true) {
    const { data, error } = await supabase.storage.from("media").list("catalog-v1", {
      limit: 1000,
      offset,
      sortBy: { column: "name", order: "asc" }
    });
    if (error) throw stageError(stage, error);
    const page = data ?? [];
    objects.push(...page);
    if (page.length < 1000) return objects;
    offset += page.length;
  }
}

async function captureCatalogV1Objects(supabase) {
  const objects = await listCatalogV1Objects(supabase, "backup:storage-list");
  const captured = [];
  for (const object of objects) {
    const storagePath = `catalog-v1/${object.name}`;
    const { data, error } = await supabase.storage.from("media").download(storagePath);
    if (error) throw stageError(`backup:storage-download:${object.name}`, error);
    if (!data) throw stageError(`backup:storage-download:${object.name}`, new Error("Storage download returned no data"));
    captured.push({
      path: storagePath,
      contentType: data.type || object.metadata?.mimetype || "image/webp",
      dataBase64: Buffer.from(await data.arrayBuffer()).toString("base64")
    });
  }
  return captured;
}

export async function backupCatalog(supabase, {
  now = new Date(),
  backupDirectory = BACKUP_DIRECTORY
} = {}) {
  const { data: snapshot, error } = await supabase.rpc("export_product_catalog_snapshot_v1");
  if (error) throw stageError("backup:export", error);
  assertSnapshotShape(snapshot);
  const backup = {
    ...snapshot,
    storageObjects: await captureCatalogV1Objects(supabase)
  };
  validateCatalogSnapshotStorage(backup);
  await mkdir(backupDirectory, { recursive: true });
  const filePath = path.join(backupDirectory, buildBackupFileName(now));
  await writeFile(filePath, `${JSON.stringify(backup, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
    flag: "wx"
  });
  console.log(`[catalog:backup] ${path.relative(PROJECT_ROOT, filePath)}`);
  return { snapshot: backup, filePath };
}

async function replaceCatalog(supabase, payload, stage) {
  const { data, error } = await supabase.rpc("replace_product_catalog_v1", { p_payload: payload });
  if (error) throw stageError(stage, error);
  if (data?.version !== "1.0" || data?.productCount !== 10 || data?.imageCount !== 11) {
    throw stageError(stage, new Error("Import RPC returned an unexpected summary"));
  }
}

async function verifyPublishedCatalog(supabase, categoryIdsBySlug) {
  const products = [];
  for (const categoryId of categoryIdsBySlug.values()) {
    const { data, error } = await supabase.rpc("list_published_products", {
      p_category: categoryId,
      p_limit: 25,
      p_cursor_order: null,
      p_cursor_id: null
    });
    if (error) throw stageError("verify:catalog", error);
    products.push(...(data ?? []).map((row) => row.payload));
  }
  const imageCount = products.reduce((count, product) => count + product.images.length, 0);
  if (products.length !== 10 || imageCount !== 11) {
    throw stageError("verify:catalog", new Error(`Unexpected public catalog totals: products=${products.length}, images=${imageCount}`));
  }
  console.log("[catalog:verify] products=10 images=11");
}

async function uploadCatalogImages(supabase) {
  const source = await readSourceCatalog();
  for (const image of source.products.flatMap((product) => product.images)) {
    const storagePath = `catalog-v1/${image.fileName}`;
    const file = await readFile(path.join(IMAGE_DIRECTORY, image.fileName));
    const { error } = await supabase.storage.from("media").upload(storagePath, file, {
      contentType: "image/webp",
      cacheControl: "31536000",
      upsert: true
    });
    if (error) throw stageError(`upload:${image.fileName}`, error);
  }
}

export async function applyCatalog(supabase, backupOptions = {}) {
  const source = await readSourceCatalog();
  const categoryIdsBySlug = await resolveImportCategoryMapV1(
    supabase,
    source.products.map((product) => product.category)
  );
  const backup = await backupCatalog(supabase, backupOptions);
  await uploadCatalogImages(supabase);
  const payload = await buildImportPayload({
    categoryIdsBySlug,
    getPublicUrl: (storagePath) => supabase.storage.from("media").getPublicUrl(storagePath).data.publicUrl
  });
  await replaceCatalog(supabase, payload, "apply:rpc");
  await verifyPublishedCatalog(supabase, categoryIdsBySlug);
  const now = backupOptions.now ?? new Date();
  const reportFile = await writeImportReport({
    backupFile: path.relative(PROJECT_ROOT, backup.filePath),
    now,
    reportDirectory: backupOptions.backupDirectory ?? BACKUP_DIRECTORY
  });
  return { backupFile: backup.filePath, reportFile };
}

function snapshotCatalogV1Paths(snapshot) {
  return new Set(snapshot.storageObjects.map((object) => object.path));
}

function normalizeCatalogV1Reference(value) {
  if (typeof value !== "string") return null;
  let candidate = value.trim();
  if (!candidate) return null;
  try {
    if (/^https?:\/\//i.test(candidate)) candidate = new URL(candidate).pathname;
    candidate = decodeURIComponent(candidate.split(/[?#]/, 1)[0]);
  } catch {
    return null;
  }
  const storageUrlMatch = candidate.match(/\/storage\/v1\/object\/(?:public|sign|authenticated)\/media\/(catalog-v1\/[^/]+)$/);
  if (storageUrlMatch) candidate = storageUrlMatch[1];
  candidate = candidate.replace(/^\/+/, "");
  if (candidate.startsWith("media/")) candidate = candidate.slice("media/".length);
  return /^catalog-v1\/[A-Za-z0-9][A-Za-z0-9._-]*$/.test(candidate) ? candidate : null;
}

function collectCatalogV1References(value, references) {
  if (typeof value === "string") {
    const normalized = normalizeCatalogV1Reference(value);
    if (normalized) references.add(normalized);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectCatalogV1References(item, references);
    return;
  }
  if (value && typeof value === "object") {
    for (const item of Object.values(value)) collectCatalogV1References(item, references);
  }
}

function decodeCanonicalBase64(value) {
  if (typeof value !== "string" || value.length === 0 || value.length % 4 !== 0
    || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) {
    return null;
  }
  const body = Buffer.from(value, "base64");
  return body.length > 0 && body.toString("base64") === value ? body : null;
}

export function validateCatalogSnapshotStorage(snapshot) {
  assertSnapshotShape(snapshot);
  if (!Array.isArray(snapshot.storageObjects)) {
    throw new Error("Snapshot is missing Storage object bytes");
  }
  const referencedPaths = new Set();
  for (const media of snapshot.media) {
    collectCatalogV1References(media.storage_path, referencedPaths);
    collectCatalogV1References(media.variants, referencedPaths);
  }
  const objectPaths = new Set();
  for (const object of snapshot.storageObjects) {
    const body = decodeCanonicalBase64(object.dataBase64);
    if (typeof object.path !== "string" || !/^catalog-v1\/[A-Za-z0-9][A-Za-z0-9._-]*$/.test(object.path)
      || !["image/jpeg", "image/png", "image/webp"].includes(object.contentType)
      || !body?.length) {
      throw new Error("Snapshot contains invalid Storage object data");
    }
    if (objectPaths.has(object.path)) throw new Error(`Duplicate Storage object path ${object.path}`);
    objectPaths.add(object.path);
  }
  const missingPaths = [...referencedPaths].filter((storagePath) => !objectPaths.has(storagePath)).sort();
  if (missingPaths.length) throw new Error(`Missing Storage object bytes for ${missingPaths.join(", ")}`);
}

export async function cleanupCatalogV1Objects(supabase, snapshot) {
  const keepPaths = snapshotCatalogV1Paths(snapshot);
  const removePaths = [];
  const objects = await listCatalogV1Objects(supabase, "restore:storage-list");
  for (const object of objects) {
    const storagePath = `catalog-v1/${object.name}`;
    if (!keepPaths.has(storagePath)) removePaths.push(storagePath);
  }
  for (let index = 0; index < removePaths.length; index += 100) {
    const batch = removePaths.slice(index, index + 100);
    const { error } = await supabase.storage.from("media").remove(batch);
    if (error) throw stageError("restore:storage-remove", error);
  }
}

export async function restoreCatalogV1Objects(supabase, snapshot) {
  validateCatalogSnapshotStorage(snapshot);
  for (const object of snapshot.storageObjects) {
    const body = Buffer.from(object.dataBase64, "base64");
    const { error } = await supabase.storage.from("media").upload(object.path, body, {
      contentType: object.contentType,
      cacheControl: "31536000",
      upsert: true
    });
    if (error) throw stageError(`restore:storage-upload:${path.basename(object.path)}`, error);
  }
  await cleanupCatalogV1Objects(supabase, snapshot);
}

export async function restoreCatalog(supabase, backupFile, backupOptions = {}) {
  if (!backupFile) throw stageError("restore:input", new Error("restore requires a backup file"));
  const backupPath = path.resolve(PROJECT_ROOT, backupFile);
  const snapshot = JSON.parse(await readFile(backupPath, "utf8"));
  assertSnapshotShape(snapshot);
  validateCatalogSnapshotStorage(snapshot);
  await backupCatalog(supabase, backupOptions);
  const { data, error } = await supabase.rpc("restore_product_catalog_snapshot_v1", {
    p_snapshot: snapshot
  });
  if (error) throw stageError("restore:rpc", error);
  const expectedProductCount = snapshot.products.length;
  const expectedImageCount = snapshot.productImages.length;
  if (data?.version !== "1.0" || data?.productCount !== expectedProductCount || data?.imageCount !== expectedImageCount) {
    throw stageError("restore:rpc", new Error("Restore RPC returned an unexpected summary"));
  }
  await restoreCatalogV1Objects(supabase, snapshot);
  console.log(`[catalog:restore] products=${expectedProductCount} images=${expectedImageCount}`);
}

function safeErrorSummary(error) {
  let message = error instanceof Error ? error.message : String(error);
  for (const key of ["SUPABASE_SECRET_KEY", "SUPABASE_SERVICE_ROLE_KEY", "NEXT_PUBLIC_SUPABASE_URL"]) {
    const value = process.env[key];
    if (value) message = message.replaceAll(value, "[redacted]");
  }
  return message.replace(/[\r\n]+/g, " ").slice(0, 300);
}

async function run() {
  const { command, backupFile } = parseCatalogCommand(process.argv.slice(2));
  const supabase = createAdminClient();
  if (command === "backup") await backupCatalog(supabase);
  if (command === "apply") await applyCatalog(supabase);
  if (command === "restore") await restoreCatalog(supabase, backupFile);
}

const isMain = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isMain) {
  run().catch((error) => {
    const stage = error?.stage ?? "command";
    console.error(`[catalog:${stage}] ${safeErrorSummary(error)}`);
    process.exitCode = 1;
  });
}
