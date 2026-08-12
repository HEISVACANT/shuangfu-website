declare module "sharp" {
  type Metadata = { width?: number; height?: number };
  type ResizeOptions = { width: number; withoutEnlargement?: boolean };
  type WebpOptions = { quality?: number };
  interface SharpInstance {
    metadata(): Promise<Metadata>;
    resize(options: ResizeOptions): SharpInstance;
    rotate(): SharpInstance;
    toBuffer(): Promise<Buffer>;
    webp(options?: WebpOptions): SharpInstance;
  }
  export default function sharp(input: Buffer | Uint8Array): SharpInstance;
}
