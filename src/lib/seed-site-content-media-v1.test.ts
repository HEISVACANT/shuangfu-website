import { describe, expect, it } from "vitest";

// The seed CLI is an executable ESM artifact and intentionally has no TypeScript declarations.
// @ts-expect-error Runtime script module has no declaration file.
import { formatSeedReportV1, resolveSeedEnvironmentV1, seedSiteContentMediaV1 } from "../../scripts/seed-site-content-media-v1.mjs";

type SeedAsset = {
  sectionKey: "home" | "about";
  storagePath: string;
  sourcePath: string;
};

const assets: SeedAsset[] = [
  {
    sectionKey: "home",
    storagePath: "site-content-v1/home/hero-products-placeholder-v1.png",
    sourcePath: "home.png"
  },
  {
    sectionKey: "about",
    storagePath: "site-content-v1/about/company-craft-placeholder-v1.png",
    sourcePath: "about.png"
  }
];

const mediaIds = [
  "30000000-0000-4000-8000-000000000001",
  "30000000-0000-4000-8000-000000000002"
];

function createSeedClient({
  existingObjects = [],
  existingMedia = [],
  rpcError = null
}: {
  existingObjects?: string[];
  existingMedia?: Array<{ id: string; storage_path: string }>;
  rpcError?: { message: string } | null;
} = {}) {
  const uploads: string[] = [];
  const mediaInserts: Array<Record<string, unknown>> = [];
  const rpcCalls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const mediaRows = [...existingMedia];
  const client = {
    storage: {
      from: () => ({
        list: async (folder: string) => ({
          data: existingObjects
            .filter((objectPath) => objectPath.startsWith(`${folder}/`))
            .map((objectPath) => ({ name: objectPath.slice(folder.length + 1) })),
          error: null
        }),
        upload: async (storagePath: string) => {
          uploads.push(storagePath);
          existingObjects.push(storagePath);
          return { data: { path: storagePath }, error: null };
        },
        getPublicUrl: (storagePath: string) => ({
          data: { publicUrl: `https://example.supabase.co/storage/v1/object/public/media/${storagePath}` }
        })
      })
    },
    from: (table: string) => {
      if (table !== "media") throw new Error(`Unexpected table ${table}`);
      return {
        select: () => ({
          eq: (_field: string, value: string) => ({
            maybeSingle: async () => ({
              data: mediaRows.find((row) => row.storage_path === value) ?? null,
              error: null
            })
          })
        }),
        insert: (value: Record<string, unknown>) => ({
          select: () => ({
            single: async () => {
              mediaInserts.push(value);
              const row = {
                id: mediaIds[mediaRows.length],
                storage_path: String(value.storage_path)
              };
              mediaRows.push(row);
              return { data: row, error: null };
            }
          })
        })
      };
    },
    rpc: async (name: string, args: Record<string, unknown>) => {
      rpcCalls.push({ name, args });
      return { data: rpcError ? null : "2026-07-30T00:00:00.000Z", error: rpcError };
    }
  };

  return { client, uploads, mediaInserts, rpcCalls };
}

describe("site content media seed", () => {
  it("reuses existing objects/rows and binds both sections through one atomic RPC", async () => {
    const publicUrls = assets.map(
      (asset) => `https://example.supabase.co/storage/v1/object/public/media/${asset.storagePath}`
    );
    const fixture = createSeedClient({
      existingObjects: assets.map((asset) => asset.storagePath),
      existingMedia: publicUrls.map((storage_path, index) => ({
        id: mediaIds[index],
        storage_path
      }))
    });

    const result = await seedSiteContentMediaV1(fixture.client, {
      assets,
      readAsset: async () => {
        throw new Error("existing media must not read source assets");
      }
    });

    expect(fixture.uploads).toEqual([]);
    expect(fixture.mediaInserts).toEqual([]);
    expect(fixture.rpcCalls).toEqual([{
      name: "set_site_content_seed_media_v1",
      args: {
        p_home_media_id: mediaIds[0],
        p_home_public_url: publicUrls[0],
        p_about_media_id: mediaIds[1],
        p_about_public_url: publicUrls[1]
      }
    }]);
    expect(result).toEqual([
      { section: "home", ready: true, uploaded: false, mediaInserted: false },
      { section: "about", ready: true, uploaded: false, mediaInserted: false }
    ]);
  });

  it("uploads missing objects, inserts media rows, then calls the atomic binding RPC once", async () => {
    const fixture = createSeedClient();

    await seedSiteContentMediaV1(fixture.client, {
      assets,
      readAsset: async (sourcePath: string) => ({
        body: Buffer.from(sourcePath),
        byteSize: sourcePath.length,
        width: 1600,
        height: 900,
        mimeType: "image/png"
      })
    });

    expect(fixture.uploads).toEqual(assets.map((asset) => asset.storagePath));
    expect(fixture.mediaInserts).toHaveLength(2);
    expect(fixture.mediaInserts[0]).toMatchObject({
      mime_type: "image/png",
      width: 1600,
      height: 900,
      variants: {}
    });
    expect(fixture.rpcCalls).toHaveLength(1);
  });

  it("surfaces an atomic binding failure instead of attempting per-section updates", async () => {
    const fixture = createSeedClient({ rpcError: { message: "site_content_seed_media_invalid" } });

    await expect(seedSiteContentMediaV1(fixture.client, {
      assets,
      readAsset: async () => ({
        body: Buffer.from("image"), byteSize: 5, width: 10, height: 10, mimeType: "image/png"
      })
    })).rejects.toThrow(/site_content_seed_media_invalid/i);
    expect(fixture.rpcCalls).toHaveLength(1);
  });

  it("falls back from blank preferred server keys to trimmed legacy keys", () => {
    expect(resolveSeedEnvironmentV1({
      NEXT_PUBLIC_SUPABASE_URL: " https://example.supabase.co ",
      SUPABASE_SECRET_KEY: "   ",
      SUPABASE_SERVICE_ROLE_KEY: " legacy-service-role "
    })).toEqual({
      url: "https://example.supabase.co",
      secret: "legacy-service-role"
    });
  });

  it("formats only bounded section status booleans", () => {
    const secret = "secret-key-must-not-leak";
    const payload = { mediaUrl: "https://example.test/full-payload.png" };
    const output = formatSeedReportV1([
      { section: "home", ready: true, uploaded: false, mediaInserted: false, secret, payload }
    ]).join("\n");

    expect(output).toBe("home ready=true uploaded=false mediaInserted=false");
    expect(output).not.toContain(secret);
    expect(output).not.toContain(payload.mediaUrl);
  });
});
