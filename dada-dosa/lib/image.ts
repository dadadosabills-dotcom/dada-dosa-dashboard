/**
 * Shrinks phone photos before upload (max 1600 px on the long side, JPEG ~80%).
 * A 4–6 MB camera photo becomes roughly 200–400 KB, which keeps storage small
 * and uploads fast. PDFs, non-images and already-small files are returned untouched.
 */
export async function compressImage(file: File, maxSide = 1600, quality = 0.8): Promise<File> {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size < 300 * 1024) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * scale), h = Math.round(bitmap.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, w, h);
    ctx.drawImage(bitmap, 0, 0, w, h);
    const blob: Blob | null = await new Promise(res => canvas.toBlob(res, "image/jpeg", quality));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch {
    return file; // if anything goes wrong, upload the original
  }
}
