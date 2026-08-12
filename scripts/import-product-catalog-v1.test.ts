import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

// The import CLI is an executable ESM artifact and intentionally has no TypeScript declarations.
// @ts-expect-error Runtime script module has no declaration file.
import { applyCatalog, backupCatalog, buildBackupFileName, buildImportPayload, cleanupCatalogV1Objects, parseCatalogCommand, resolveImportCategoryMapV1, restoreCatalog, restoreCatalogV1Objects, validateCatalogSnapshotStorage } from "./import-product-catalog-v1.mjs";

type RpcCall = { name: string; args?: unknown };

const arbitrarySnapshot = {
  version: "1.0",
  capturedAt: "2026-07-29T03:04:05.000Z",
  products: [{ id: "10000000-0000-4000-8000-000000000001", slug: "legacy-product", category: "custom-development", category_id: "b8c8fe47-2268-4f88-bf2a-3d751c2fa003", status: "draft", sort_order: 41, version: 7, deleted_at: null, created_at: "2025-01-01T00:00:00.000Z", updated_at: "2026-01-01T00:00:00.000Z" }],
  translations: [],
  media: [],
  productImages: [],
  specifications: [],
  storageObjects: []
};

const referencedStorageObject = {
  path: "catalog-v1/referenced.webp",
  contentType: "image/webp",
  dataBase64: Buffer.from("referenced-bytes").toString("base64")
};

const referencedStorageSnapshot = {
  ...arbitrarySnapshot,
  media: [{
    storage_path: "https://example.supabase.co/storage/v1/object/public/media/catalog-v1/referenced.webp",
    variants: {
      storagePath: "catalog-v1/referenced.webp",
      publicUrl: "https://example.supabase.co/storage/v1/object/public/media/catalog-v1/referenced.webp"
    }
  }],
  storageObjects: [referencedStorageObject]
};

async function withTempDirectory<T>(callback: (directory: string) => Promise<T>) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "product-import-v1-"));
  try {
    return await callback(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

describe("product catalog import CLI", () => {
  it("resolves every source slug to an enabled database category before any write", async () => {
    const effects: string[] = [];
    const supabase = {
      from: () => ({
        select: () => ({
          in: async () => ({
            data: [{ id: "b8c8fe47-2268-4f88-bf2a-3d751c2fa001", slug: "bra-pads", is_enabled: true }],
            error: null
          })
        })
      }),
      rpc: async () => { effects.push("rpc"); throw new Error("must not write"); },
      storage: { from: () => ({ upload: async () => { effects.push("upload"); throw new Error("must not write"); } }) }
    };

    await expect(resolveImportCategoryMapV1(supabase, ["bra-pads", "cups"]))
      .rejects.toThrow(/unknown product category slug: cups/i);
    expect(effects).toEqual([]);
  });

  it("accepts only backup, apply, and restore commands", () => {
    expect(parseCatalogCommand(["backup"])).toEqual({ command: "backup", backupFile: undefined });
    expect(parseCatalogCommand(["apply"])).toEqual({ command: "apply", backupFile: undefined });
    expect(parseCatalogCommand(["restore", "backup.json"])).toEqual({ command: "restore", backupFile: "backup.json" });
    expect(() => parseCatalogCommand(["remove"])).toThrow(/backup\|apply\|restore/);
    expect(() => parseCatalogCommand([])).toThrow(/backup\|apply\|restore/);
  });

  it("normalizes the v1 source catalog into a 1.0 payload with 10 products and 11 images", async () => {
    const payload = await buildImportPayload({
      categoryIdsBySlug: new Map([
        ["bra-pads", "b8c8fe47-2268-4f88-bf2a-3d751c2fa001"],
        ["cups", "b8c8fe47-2268-4f88-bf2a-3d751c2fa002"]
      ]),
      getPublicUrl: (storagePath: string) => `https://example.supabase.co/storage/v1/object/public/media/${storagePath}`
    }) as {
      version: string;
      products: Array<{ categoryId: string; categorySlug: string; images: Array<{
        storagePath: string;
        publicUrl: string;
        mimeType: string;
        byteSize: number;
        width: number;
        height: number;
      }> }>;
    };

    expect(payload.version).toBe("1.0");
    expect(payload.products).toHaveLength(10);
    expect(payload.products[0]).toMatchObject({
      categoryId: "b8c8fe47-2268-4f88-bf2a-3d751c2fa001",
      categorySlug: "bra-pads"
    });
    expect(payload.products.flatMap((product) => product.images)).toHaveLength(11);
    expect(payload.products[0].images[0]).toMatchObject({
      storagePath: "catalog-v1/teardrop-cup-pad-01.webp",
      mimeType: "image/webp"
    });
    expect(payload.products[0].images[0].publicUrl).toContain("/media/catalog-v1/teardrop-cup-pad-01.webp");
    expect(payload.products[0].images[0].byteSize).toBeGreaterThan(0);
    expect(payload.products[0].images[0].width).toBeGreaterThan(0);
    expect(payload.products[0].images[0].height).toBeGreaterThan(0);
  });

  it("builds a timestamped local rollback filename", () => {
    const fileName = buildBackupFileName(new Date("2026-07-29T03:04:05.000Z"));

    expect(fileName).toBe("product-catalog-before-v1.0-20260729-030405.json");
    expect(fileName).toMatch(/^product-catalog-before-v1\.0-\d{8}-\d{6}\.json$/);
  });

  it("backs up through one export snapshot RPC without table REST reads", async () => {
    await withTempDirectory(async (backupDirectory) => {
      const calls: RpcCall[] = [];
      const supabase = {
        rpc: async (name: string, args?: unknown) => {
          calls.push({ name, args });
          return { data: arbitrarySnapshot, error: null };
        },
        from: () => { throw new Error("backup must not use table REST reads"); },
        storage: { from: () => ({ list: async () => ({ data: [], error: null }) }) }
      };

      const result = await backupCatalog(supabase, {
        backupDirectory,
        now: new Date("2026-07-29T03:04:05.000Z")
      });

      expect(calls).toEqual([{ name: "export_product_catalog_snapshot_v1", args: undefined }]);
      expect(JSON.parse(await readFile(result.filePath, "utf8"))).toEqual(arbitrarySnapshot);
    });
  });

  it("backs up before any apply upload or replacement RPC", async () => {
    await withTempDirectory(async (backupDirectory) => {
      const events: string[] = [];
      const published = Array.from({ length: 10 }, (_, index) => ({
        payload: { images: Array.from({ length: index === 0 ? 2 : 1 }, () => ({ id: "image" })) }
      }));
      const supabase = {
        from: () => ({ select: () => ({ in: async () => ({ data: [
          { id: "b8c8fe47-2268-4f88-bf2a-3d751c2fa001", slug: "bra-pads", is_enabled: true },
          { id: "b8c8fe47-2268-4f88-bf2a-3d751c2fa002", slug: "cups", is_enabled: true }
        ], error: null }) }) }),
        rpc: async (name: string, args?: unknown) => {
          events.push(`rpc:${name}`);
          if (name === "export_product_catalog_snapshot_v1") return { data: arbitrarySnapshot, error: null };
          if (name === "replace_product_catalog_v1") return { data: { version: "1.0", productCount: 10, imageCount: 11 }, error: null };
          if (name === "list_published_products") {
            const category = (args as { p_category: string }).p_category;
            return { data: category.endsWith("a001") ? published.slice(0, 5) : published.slice(5), error: null };
          }
          throw new Error(`Unexpected RPC ${name}`);
        },
        storage: {
          from: () => ({
            list: async () => ({ data: [], error: null }),
            upload: async (storagePath: string) => { events.push(`upload:${storagePath}`); return { error: null }; },
            getPublicUrl: (storagePath: string) => ({ data: { publicUrl: `https://example.invalid/media/${storagePath}` } })
          })
        }
      };

      const result = await applyCatalog(supabase, {
        backupDirectory,
        now: new Date("2026-07-29T03:04:05.000Z")
      }) as { backupFile: string; reportFile: string };

      expect(events[0]).toBe("rpc:export_product_catalog_snapshot_v1");
      expect(events.filter((event) => event.startsWith("upload:"))).toHaveLength(11);
      expect(events.indexOf("rpc:replace_product_catalog_v1")).toBeGreaterThan(events.findLastIndex((event) => event.startsWith("upload:")));
      expect(path.basename(result.backupFile)).toBe("product-catalog-before-v1.0-20260729-030405.json");
      expect(path.basename(result.reportFile)).toBe("product-catalog-import-v1.0-20260729-030405.json");
      expect(JSON.parse(await readFile(result.reportFile, "utf8"))).toEqual({
        version: "1.0",
        operation: "apply",
        completedAt: "2026-07-29T03:04:05.000Z",
        backupFile: path.relative(process.cwd(), result.backupFile),
        productCount: 10,
        imageCount: 11
      });
    });
  });

  it("restores an arbitrary snapshot through the dedicated RPC after backing up current state", async () => {
    await withTempDirectory(async (backupDirectory) => {
      const backupFile = path.join(backupDirectory, "restore-source.json");
      await writeFile(backupFile, JSON.stringify(arbitrarySnapshot), "utf8");
      const calls: RpcCall[] = [];
      const supabase = {
        rpc: async (name: string, args?: unknown) => {
          calls.push({ name, args });
          if (name === "export_product_catalog_snapshot_v1") return { data: { ...arbitrarySnapshot, products: [] }, error: null };
          if (name === "restore_product_catalog_snapshot_v1") return { data: { version: "1.0", productCount: 1, imageCount: 0 }, error: null };
          throw new Error(`Unexpected RPC ${name}`);
        },
        storage: { from: () => ({ list: async () => ({ data: [], error: null }), remove: async () => ({ error: null }) }) }
      };

      await restoreCatalog(supabase, backupFile, {
        backupDirectory,
        now: new Date("2026-07-29T03:04:06.000Z")
      });

      expect(calls.map((call) => call.name)).toEqual([
        "export_product_catalog_snapshot_v1",
        "restore_product_catalog_snapshot_v1"
      ]);
      expect(calls[1].args).toEqual({ p_snapshot: arbitrarySnapshot });
    });
  });

  it("cleans only unreferenced catalog-v1 Storage objects through the Storage API", async () => {
    const removed: string[][] = [];
    const supabase = {
      storage: {
        from: () => ({
          list: async () => ({ data: [{ name: "keep.webp" }, { name: "remove.webp" }], error: null }),
          remove: async (paths: string[]) => { removed.push(paths); return { error: null }; }
        })
      }
    };
    const snapshot = {
      ...arbitrarySnapshot,
      storageObjects: [{ path: "catalog-v1/keep.webp", contentType: "image/webp", dataBase64: "" }]
    };

    await cleanupCatalogV1Objects(supabase, snapshot);

    expect(removed).toEqual([["catalog-v1/remove.webp"]]);
  });

  it("stores catalog-v1 object bytes in the local rollback JSON", async () => {
    await withTempDirectory(async (backupDirectory) => {
      const supabase = {
        rpc: async () => ({
          data: {
            ...arbitrarySnapshot,
            media: [{ storage_path: "catalog-v1/existing.webp", variants: {} }]
          },
          error: null
        }),
        storage: {
          from: () => ({
            list: async () => ({ data: [{ name: "existing.webp", metadata: { mimetype: "image/webp" } }], error: null }),
            download: async () => ({ data: new Blob(["original-bytes"], { type: "image/webp" }), error: null })
          })
        }
      };

      const result = await backupCatalog(supabase, {
        backupDirectory,
        now: new Date("2026-07-29T03:04:07.000Z")
      });
      const saved = JSON.parse(await readFile(result.filePath, "utf8")) as {
        storageObjects: Array<{ path: string; contentType: string; dataBase64: string }>;
      };

      expect(saved.storageObjects).toEqual([{
        path: "catalog-v1/existing.webp",
        contentType: "image/webp",
        dataBase64: Buffer.from("original-bytes").toString("base64")
      }]);
    });
  });

  it("restores saved Storage bytes before removing objects absent from the snapshot", async () => {
    const events: string[] = [];
    const supabase = {
      storage: {
        from: () => ({
          upload: async (storagePath: string, body: Uint8Array, options: { contentType: string; upsert: boolean }) => {
            events.push(`upload:${storagePath}:${Buffer.from(body).toString("utf8")}:${options.contentType}:${options.upsert}`);
            return { error: null };
          },
          list: async () => ({ data: [{ name: "existing.webp" }, { name: "extra.webp" }], error: null }),
          remove: async (paths: string[]) => { events.push(`remove:${paths.join(",")}`); return { error: null }; }
        })
      }
    };
    const snapshot = {
      ...arbitrarySnapshot,
      media: [{ storage_path: "catalog-v1/existing.webp", variants: {} }],
      storageObjects: [{
        path: "catalog-v1/existing.webp",
        contentType: "image/webp",
        dataBase64: Buffer.from("original-bytes").toString("base64")
      }]
    };

    await restoreCatalogV1Objects(supabase, snapshot);

    expect(events).toEqual([
      "upload:catalog-v1/existing.webp:original-bytes:image/webp:true",
      "remove:catalog-v1/extra.webp"
    ]);
  });

  it("requires every normalized catalog-v1 media reference while allowing unique extra objects", () => {
    expect(() => validateCatalogSnapshotStorage(referencedStorageSnapshot)).not.toThrow();
    expect(() => validateCatalogSnapshotStorage({
      ...referencedStorageSnapshot,
      storageObjects: []
    })).toThrow(/missing.*catalog-v1\/referenced\.webp/i);
    expect(() => validateCatalogSnapshotStorage({
      ...referencedStorageSnapshot,
      storageObjects: [referencedStorageObject, referencedStorageObject]
    })).toThrow(/duplicate.*catalog-v1\/referenced\.webp/i);
    expect(() => validateCatalogSnapshotStorage({
      ...referencedStorageSnapshot,
      storageObjects: [
        referencedStorageObject,
        { ...referencedStorageObject, path: "catalog-v1/extra.webp" }
      ]
    })).not.toThrow();
  });

  it("backs up and restores after uploads succeed but the replacement RPC fails", async () => {
    await withTempDirectory(async (backupDirectory) => {
      const legacyPath = "catalog-v1/legacy.webp";
      const databaseSnapshot = {
        ...arbitrarySnapshot,
        media: [{ storage_path: legacyPath, variants: {} }]
      };
      const storageObjects = new Map<string, { bytes: Buffer; contentType: string }>([[
        legacyPath,
        { bytes: Buffer.from("legacy-bytes"), contentType: "image/webp" }
      ]]);
      const uploadedPaths: string[] = [];
      const removedPaths: string[] = [];
      const rpcCalls: string[] = [];
      const supabase = {
        from: () => ({ select: () => ({ in: async () => ({ data: [
          { id: "b8c8fe47-2268-4f88-bf2a-3d751c2fa001", slug: "bra-pads", is_enabled: true },
          { id: "b8c8fe47-2268-4f88-bf2a-3d751c2fa002", slug: "cups", is_enabled: true }
        ], error: null }) }) }),
        rpc: async (name: string) => {
          rpcCalls.push(name);
          if (name === "export_product_catalog_snapshot_v1") return { data: databaseSnapshot, error: null };
          if (name === "replace_product_catalog_v1") return { data: null, error: new Error("replacement failed") };
          if (name === "restore_product_catalog_snapshot_v1") {
            return { data: { version: "1.0", productCount: 1, imageCount: 0 }, error: null };
          }
          throw new Error(`Unexpected RPC ${name}`);
        },
        storage: {
          from: () => ({
            list: async () => ({
              data: [...storageObjects.entries()].map(([storagePath, object]) => ({
                name: storagePath.slice("catalog-v1/".length),
                metadata: { mimetype: object.contentType }
              })),
              error: null
            }),
            download: async (storagePath: string) => {
              const object = storageObjects.get(storagePath);
              return object
                ? { data: new Blob([new Uint8Array(object.bytes)], { type: object.contentType }), error: null }
                : { data: null, error: new Error("missing object") };
            },
            upload: async (storagePath: string, body: Uint8Array, options: { contentType: string }) => {
              if (storagePath !== legacyPath) uploadedPaths.push(storagePath);
              storageObjects.set(storagePath, {
                bytes: Buffer.from(body),
                contentType: options.contentType
              });
              return { error: null };
            },
            remove: async (paths: string[]) => {
              removedPaths.push(...paths);
              for (const storagePath of paths) storageObjects.delete(storagePath);
              return { error: null };
            },
            getPublicUrl: (storagePath: string) => ({
              data: { publicUrl: `https://example.supabase.co/storage/v1/object/public/media/${storagePath}` }
            })
          })
        }
      };

      await expect(applyCatalog(supabase, {
        backupDirectory,
        now: new Date("2026-07-29T03:04:11.000Z")
      })).rejects.toThrow(/replacement failed/i);
      expect(uploadedPaths).toHaveLength(11);

      const originalBackup = path.join(backupDirectory, "product-catalog-before-v1.0-20260729-030411.json");
      const recoveryBackup = await backupCatalog(supabase, {
        backupDirectory,
        now: new Date("2026-07-29T03:04:12.000Z")
      });
      const recoverySnapshot = JSON.parse(await readFile(recoveryBackup.filePath, "utf8")) as {
        storageObjects: Array<{ path: string; dataBase64: string }>;
      };
      expect(recoverySnapshot.storageObjects).toHaveLength(12);
      expect(recoverySnapshot.storageObjects.every((object) => object.dataBase64.length > 0)).toBe(true);
      await restoreCatalog(supabase, originalBackup, {
        backupDirectory,
        now: new Date("2026-07-29T03:04:13.000Z")
      });

      expect([...storageObjects.keys()]).toEqual([legacyPath]);
      expect(removedPaths.sort()).toEqual(uploadedPaths.sort());
      expect(rpcCalls).toEqual([
        "export_product_catalog_snapshot_v1",
        "replace_product_catalog_v1",
        "export_product_catalog_snapshot_v1",
        "export_product_catalog_snapshot_v1",
        "restore_product_catalog_snapshot_v1"
      ]);
      expect(await readdir(backupDirectory)).toHaveLength(3);
    });
  });

  it("refuses an incomplete backup before writing a local JSON file", async () => {
    await withTempDirectory(async (backupDirectory) => {
      const supabase = {
        rpc: async () => ({
          data: { ...referencedStorageSnapshot, storageObjects: undefined },
          error: null
        }),
        storage: { from: () => ({ list: async () => ({ data: [], error: null }) }) }
      };

      await expect(backupCatalog(supabase, {
        backupDirectory,
        now: new Date("2026-07-29T03:04:08.000Z")
      })).rejects.toThrow(/missing.*catalog-v1\/referenced\.webp/i);
      expect(await readdir(backupDirectory)).toEqual([]);
    });
  });

  it("rejects an incomplete restore before any RPC, Storage write, or new backup file", async () => {
    await withTempDirectory(async (directory) => {
      const backupFile = path.join(directory, "restore-source.json");
      await writeFile(backupFile, JSON.stringify({
        ...referencedStorageSnapshot,
        storageObjects: []
      }), "utf8");
      const effects = { rpc: 0, upload: 0, remove: 0, list: 0 };
      const supabase = {
        rpc: async () => { effects.rpc += 1; throw new Error("RPC must not run"); },
        storage: {
          from: () => ({
            list: async () => { effects.list += 1; throw new Error("Storage list must not run"); },
            upload: async () => { effects.upload += 1; throw new Error("Storage upload must not run"); },
            remove: async () => { effects.remove += 1; throw new Error("Storage remove must not run"); }
          })
        }
      };

      await expect(restoreCatalog(supabase, backupFile, {
        backupDirectory: path.join(directory, "current-backups"),
        now: new Date("2026-07-29T03:04:09.000Z")
      })).rejects.toThrow(/missing.*catalog-v1\/referenced\.webp/i);
      expect(effects).toEqual({ rpc: 0, upload: 0, remove: 0, list: 0 });
      expect(await readdir(directory)).toEqual(["restore-source.json"]);
    });
  });

  it("rejects non-canonical Base64 before any restore side effect", async () => {
    await withTempDirectory(async (directory) => {
      const backupFile = path.join(directory, "restore-source.json");
      await writeFile(backupFile, JSON.stringify({
        ...referencedStorageSnapshot,
        storageObjects: [{ ...referencedStorageObject, dataBase64: "cmVmZXJlbmNlZC1ieXRlcw==garbage" }]
      }), "utf8");
      const effects = { rpc: 0, upload: 0, remove: 0, list: 0 };
      const supabase = {
        rpc: async () => { effects.rpc += 1; throw new Error("RPC must not run"); },
        storage: {
          from: () => ({
            list: async () => { effects.list += 1; throw new Error("Storage list must not run"); },
            upload: async () => { effects.upload += 1; throw new Error("Storage upload must not run"); },
            remove: async () => { effects.remove += 1; throw new Error("Storage remove must not run"); }
          })
        }
      };

      await expect(restoreCatalog(supabase, backupFile, {
        backupDirectory: path.join(directory, "current-backups"),
        now: new Date("2026-07-29T03:04:10.000Z")
      })).rejects.toThrow(/invalid Storage object data/i);
      expect(effects).toEqual({ rpc: 0, upload: 0, remove: 0, list: 0 });
      expect(await readdir(directory)).toEqual(["restore-source.json"]);
    });
  });

  it("rejects a duplicate Storage path before any restore side effect", async () => {
    await withTempDirectory(async (directory) => {
      const backupFile = path.join(directory, "restore-source.json");
      await writeFile(backupFile, JSON.stringify({
        ...referencedStorageSnapshot,
        storageObjects: [referencedStorageObject, referencedStorageObject]
      }), "utf8");
      const effects = { rpc: 0, upload: 0, remove: 0, list: 0 };
      const supabase = {
        rpc: async () => { effects.rpc += 1; throw new Error("RPC must not run"); },
        storage: {
          from: () => ({
            list: async () => { effects.list += 1; throw new Error("Storage list must not run"); },
            upload: async () => { effects.upload += 1; throw new Error("Storage upload must not run"); },
            remove: async () => { effects.remove += 1; throw new Error("Storage remove must not run"); }
          })
        }
      };

      await expect(restoreCatalog(supabase, backupFile, {
        backupDirectory: path.join(directory, "current-backups"),
        now: new Date("2026-07-29T03:04:14.000Z")
      })).rejects.toThrow(/duplicate.*catalog-v1\/referenced\.webp/i);
      expect(effects).toEqual({ rpc: 0, upload: 0, remove: 0, list: 0 });
      expect(await readdir(directory)).toEqual(["restore-source.json"]);
    });
  });
});
