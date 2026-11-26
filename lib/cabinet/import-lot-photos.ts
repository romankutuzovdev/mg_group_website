export type ImportLotPhotoProgress = (index: number, saved: boolean) => void;

export type ImportLotPhotosOptions = {
  concurrency?: number;
  retries?: number;
  retryDelayMs?: number;
};

/** Import auction photos as deal media, retrying transient source/proxy errors. */
export async function importLotPhotos(
  dealId: number,
  rawUrls: string[],
  upload: (dealId: number, url: string, index: number) => Promise<unknown>,
  onProgress: ImportLotPhotoProgress = () => {},
  options: ImportLotPhotosOptions = {},
): Promise<{ images: string[]; total: number; failedIndices: number[] }> {
  const images = Array.from(new Set(rawUrls.map((url) => (url || "").trim()).filter(Boolean)));
  const retries = Math.max(0, Math.floor(options.retries ?? 2));
  const retryDelayMs = Math.max(0, options.retryDelayMs ?? 700);
  const concurrency = Math.max(1, Math.floor(options.concurrency ?? 3));
  const failed = new Array<boolean>(images.length).fill(false);
  let next = 0;

  const worker = async () => {
    while (next < images.length) {
      const index = next++;
      let saved = false;
      for (let attempt = 0; attempt <= retries; attempt += 1) {
        try {
          await upload(dealId, images[index], index);
          saved = true;
          break;
        } catch {
          if (attempt < retries && retryDelayMs) {
            await new Promise((resolve) => setTimeout(resolve, retryDelayMs * (attempt + 1)));
          }
        }
      }
      failed[index] = !saved;
      onProgress(index, saved);
    }
  };

  await Promise.all(Array.from({ length: Math.min(concurrency, images.length) }, worker));
  return { images, total: images.length, failedIndices: failed.flatMap((value, index) => value ? [index] : []) };
}
