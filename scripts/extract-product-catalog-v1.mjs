import { mkdir } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

import { catalogCropsV1 } from "./product-catalog-crops-v1.mjs";

const expectedSourceSize = { width: 1818, height: 1234 };

export async function extractCatalogAssetsV1({ inputDir, outputDir }) {
  await mkdir(outputDir, { recursive: true });

  const outputPaths = await Promise.all(catalogCropsV1.map(async (crop) => {
    const sourcePath = path.join(inputDir, `page-${crop.page}.jpg`);
    const image = sharp(sourcePath);
    const metadata = await image.metadata();

    if (metadata.width < expectedSourceSize.width || metadata.height < expectedSourceSize.height) {
      throw new Error(
        `Unexpected source dimensions for ${sourcePath}: ${metadata.width}x${metadata.height}; expected at least ${expectedSourceSize.width}x${expectedSourceSize.height}`
      );
    }

    const outputPath = path.join(outputDir, crop.fileName);
    await image.extract({ left: crop.left, top: crop.top, width: crop.width, height: crop.height })
      .webp({ quality: 86 })
      .toFile(outputPath);
    return outputPath;
  }));

  return outputPaths;
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename);

if (isDirectRun) {
  const outputPaths = await extractCatalogAssetsV1({
    inputDir: path.resolve("tmp/pdfs/shuangfu-catalog-v1"),
    outputDir: path.resolve("public/images/products/catalog-v1")
  });
  console.log(`Extracted ${outputPaths.length} product catalog assets.`);
}
