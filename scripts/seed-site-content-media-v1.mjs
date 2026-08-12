import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";

const { loadEnvConfig } = nextEnv;
const PROJECT_ROOT = process.cwd();
const MEDIA_BUCKET = "media";

export const siteContentMediaSeedsV1 = [
  {
    sectionKey: "home",
    storagePath: "site-content-v1/home/hero-products-placeholder-v1.png",
    sourcePath: path.join(PROJECT_ROOT, "public/images/hero-products-placeholder-v1.png")
  },
  {
    sectionKey: "about",
    storagePath: "site-content-v1/about/company-craft-placeholder-v1.png",
    sourcePath: path.join(PROJECT_ROOT, "public/images/company-craft-placeholder-v1.png")
  }
];

function stageError(stage, error) {
  const message = error instanceof Error
    ? error.message
    : error && typeof error === "object" && typeof error.message === "string"
      ? error.message
      : String(error);
  const wrapped = new Error(message);
  wrapped.stage = stage;
  return wrapped;
}

async function readSeedAssetV1(sourcePath) {
  const [body, file] = await Promise.all([readFile(sourcePath), stat(sourcePath)]);
  const metadata = await sharp(body).metadata();
  if (!metadata.width || !metadata.height || file.size <= 0) {
    throw new Error("site_content_seed_image_invalid");
  }
  return {
    body,
    byteSize: file.size,
    width: metadata.width,
    height: metadata.height,
    mimeType: "image/png"
  };
}

async function storageObjectExistsV1(client, storagePath) {
  const folder = path.posix.dirname(storagePath);
  const fileName = path.posix.basename(storagePath);
  const { data, error } = await client.storage.from(MEDIA_BUCKET).list(folder, {
    limit: 100,
    offset: 0,
    search: fileName
  });
  if (error) throw stageError(`storage:list:${storagePath}`, error);
  return Array.isArray(data) && data.some((item) => item?.name === fileName);
}

async function findMediaRowV1(client, publicUrl) {
  const { data, error } = await client
    .from("media")
    .select("id, storage_path")
    .eq("storage_path", publicUrl)
    .maybeSingle();
  if (error) throw stageError("media:read", error);
  return data;
}

async function insertMediaRowV1(client, asset, publicUrl, source) {
  const { data, error } = await client
    .from("media")
    .insert({
      storage_path: publicUrl,
      mime_type: source.mimeType,
      byte_size: source.byteSize,
      width: source.width,
      height: source.height,
      variants: {}
    })
    .select("id, storage_path")
    .single();
  if (error) throw stageError(`media:insert:${asset.sectionKey}`, error);
  if (!data?.id || data.storage_path !== publicUrl) {
    throw new Error("site_content_seed_media_row_invalid");
  }
  return data;
}

async function prepareMediaV1(client, asset, readAsset) {
  const bucket = client.storage.from(MEDIA_BUCKET);
  const publicUrl = bucket.getPublicUrl(asset.storagePath).data?.publicUrl;
  if (typeof publicUrl !== "string" || publicUrl.length === 0) {
    throw new Error("site_content_seed_public_url_invalid");
  }

  const [objectExists, existingMedia] = await Promise.all([
    storageObjectExistsV1(client, asset.storagePath),
    findMediaRowV1(client, publicUrl)
  ]);
  let source;
  let uploaded = false;
  if (!objectExists) {
    source = await readAsset(asset.sourcePath);
    const { error } = await bucket.upload(asset.storagePath, source.body, {
      contentType: source.mimeType,
      cacheControl: "31536000",
      upsert: false
    });
    if (error) throw stageError(`storage:upload:${asset.sectionKey}`, error);
    uploaded = true;
  }

  let media = existingMedia;
  let mediaInserted = false;
  if (!media) {
    source ??= await readAsset(asset.sourcePath);
    media = await insertMediaRowV1(client, asset, publicUrl, source);
    mediaInserted = true;
  }
  return { asset, media, publicUrl, uploaded, mediaInserted };
}

async function bindSectionMediaV1(client, prepared) {
  const home = prepared.find((item) => item.asset.sectionKey === "home");
  const about = prepared.find((item) => item.asset.sectionKey === "about");
  if (!home || !about || prepared.length !== 2) {
    throw new Error("site_content_seed_assets_invalid");
  }
  const { data, error } = await client.rpc("set_site_content_seed_media_v1", {
    p_home_media_id: home.media.id,
    p_home_public_url: home.publicUrl,
    p_about_media_id: about.media.id,
    p_about_public_url: about.publicUrl
  });
  if (error) throw stageError("sections:bind-media", error);
  if (typeof data !== "string" || Number.isNaN(new Date(data).getTime())) {
    throw new Error("site_content_seed_binding_result_invalid");
  }
}

export async function seedSiteContentMediaV1(client, {
  assets = siteContentMediaSeedsV1,
  readAsset = readSeedAssetV1
} = {}) {
  if (!client) throw new Error("site_content_seed_client_required");
  const prepared = [];
  for (const asset of assets) {
    prepared.push(await prepareMediaV1(client, asset, readAsset));
  }
  await bindSectionMediaV1(client, prepared);
  return prepared.map((item) => ({
    section: item.asset.sectionKey,
    ready: true,
    uploaded: item.uploaded,
    mediaInserted: item.mediaInserted
  }));
}

export function formatSeedReportV1(result) {
  return result.map((item) => (
    `${item.section} ready=${Boolean(item.ready)} uploaded=${Boolean(item.uploaded)} mediaInserted=${Boolean(item.mediaInserted)}`
  ));
}

function firstNonEmptyV1(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim().length > 0) return value.trim();
  }
  return undefined;
}

export function resolveSeedEnvironmentV1(environment = process.env) {
  return {
    url: firstNonEmptyV1(environment.NEXT_PUBLIC_SUPABASE_URL),
    secret: firstNonEmptyV1(
      environment.SUPABASE_SECRET_KEY,
      environment.SUPABASE_SERVICE_ROLE_KEY
    )
  };
}

function createAdminClientV1() {
  loadEnvConfig(PROJECT_ROOT);
  const { url, secret } = resolveSeedEnvironmentV1();
  if (!url || !secret) throw new Error("Supabase server environment is incomplete");
  return createClient(url, secret, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
}

async function main() {
  const result = await seedSiteContentMediaV1(createAdminClientV1());
  for (const line of formatSeedReportV1(result)) console.log(line);
}

const isMain = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isMain) {
  main().catch(() => {
    console.error("site-content-media-seed-failed");
    process.exitCode = 1;
  });
}
