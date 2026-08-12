import { mkdtemp, mkdir, readFile, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import sharpModule from "sharp";
import { describe, expect, it } from "vitest";

// The extraction scripts are executable ESM artifacts and intentionally have no TypeScript declarations.
// @ts-expect-error Runtime script module has no declaration file.
import { catalogCropsV1 } from "./product-catalog-crops-v1.mjs";
// @ts-expect-error Runtime script module has no declaration file.
import { extractCatalogAssetsV1 } from "./extract-product-catalog-v1.mjs";

type CatalogCrop = { slug: string; page: number; left: number; top: number; width: number; height: number; fileName: string };

const crops = catalogCropsV1 as CatalogCrop[];
const sharp = sharpModule as unknown as (input: unknown) => {
  jpeg: () => { toFile: (outputPath: string) => Promise<unknown> };
  metadata: () => Promise<{ format?: string; width?: number; height?: number }>;
};
const pageNumbers = [2, 3, 4, 5];

async function createSourcePages(inputDir: string, width: number, height: number) {
  await mkdir(inputDir, { recursive: true });
  await Promise.all(pageNumbers.map((page) => sharp({
    create: { width, height, channels: 3, background: { r: 234, g: 234, b: 234 } }
  }).jpeg().toFile(path.join(inputDir, `page-${page}.jpg`))));
}

async function withFixture<T>(width: number, height: number, callback: (paths: { inputDir: string; outputDir: string }) => Promise<T>) {
  const root = await mkdtemp(path.join(os.tmpdir(), "catalog-assets-v1-"));
  const paths = { inputDir: path.join(root, "input"), outputDir: path.join(root, "output") };
  try {
    await createSourcePages(paths.inputDir, width, height);
    return await callback(paths);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

describe("catalog crop manifest v1", () => {
  it("contains eleven safe crop regions for ten products", () => {
    expect(crops).toHaveLength(11);
    expect(crops.filter((crop) => crop.slug === "integrated-cup-pad")).toHaveLength(2);
    for (const crop of crops) {
      expect(crop.left).toBeGreaterThanOrEqual(0);
      expect(crop.top).toBeGreaterThanOrEqual(0);
      expect(crop.width).toBeGreaterThan(250);
      expect(crop.height).toBeGreaterThan(180);
      expect(crop.left + crop.width).toBeLessThanOrEqual(1818);
      expect(crop.top + crop.height).toBeLessThanOrEqual(1234);
    }
  });
});

describe("extractCatalogAssetsV1", () => {
  it.each([[1818, 1234], [1819, 1235]])("accepts a %ix%i source image and writes valid WebP assets", async (width, height) => {
    await withFixture(width, height, async ({ inputDir, outputDir }) => {
      const outputPaths = await extractCatalogAssetsV1({ inputDir, outputDir });
      expect(outputPaths.map((outputPath: string) => path.basename(outputPath))).toEqual(crops.map((crop) => crop.fileName));
      await Promise.all(outputPaths.map(async (outputPath: string) => {
        expect((await stat(outputPath)).size).toBeGreaterThan(0);
        const metadata = await sharp(outputPath).metadata();
        expect(metadata.format).toBe("webp");
        expect(metadata.width).toBeGreaterThan(0);
        expect(metadata.height).toBeGreaterThan(0);
      }));
    });
  });

  it("rejects source pages smaller than the established crop coordinate space", async () => {
    await withFixture(1817, 1234, async ({ inputDir, outputDir }) => {
      await expect(extractCatalogAssetsV1({ inputDir, outputDir })).rejects.toThrow(
        "expected at least 1818x1234"
      );
    });
  });

  it("keeps every catalog JSON image reference backed by a readable generated asset", async () => {
    const catalog = JSON.parse(await readFile(path.join(process.cwd(), "data/product-catalog-v1.json"), "utf8")) as {
      products: Array<{ images: Array<{ fileName: string }> }>;
    };
    const referencedFileNames = catalog.products.flatMap((product) => product.images.map((image) => image.fileName)).sort();
    expect(referencedFileNames).toEqual(crops.map((crop) => crop.fileName).sort());

    await Promise.all(referencedFileNames.map(async (fileName) => {
      const filePath = path.join(process.cwd(), "public/images/products/catalog-v1", fileName);
      expect((await stat(filePath)).size).toBeGreaterThan(0);
      const metadata = await sharp(filePath).metadata();
      expect(metadata.format).toBe("webp");
      expect(metadata.width).toBeGreaterThan(0);
      expect(metadata.height).toBeGreaterThan(0);
    }));
  });
});
