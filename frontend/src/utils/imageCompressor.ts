/**
 * High-performance client-side image compression utility.
 * Resizes large images (up to 15MB) and converts them to modern WebP (or fallback JPEG)
 * reducing file size by >95% while maintaining sharp avatar quality.
 */

export interface CompressImageResult {
  dataUrl: string;
  format: "webp" | "jpeg";
  originalSizeBytes: number;
  compressedSizeBytes: number;
  originalSizeFormatted: string;
  compressedSizeFormatted: string;
  reductionPercent: number;
}

export const MAX_IMAGE_FILE_SIZE_BYTES = 15 * 1024 * 1024; // 15 MB

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export async function compressGroupImage(
  file: File,
  maxWidth = 512,
  maxHeight = 512,
  quality = 0.82
): Promise<CompressImageResult> {
  if (file.size > MAX_IMAGE_FILE_SIZE_BYTES) {
    throw new Error(
      `File size (${formatBytes(file.size)}) exceeds the maximum allowed limit of 15MB.`
    );
  }

  if (!file.type.startsWith("image/")) {
    throw new Error("Please select a valid image file (JPEG, PNG, WebP, etc.).");
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Failed to read image file."));
    reader.onload = (event) => {
      const src = event.target?.result;
      if (typeof src !== "string") {
        return reject(new Error("Invalid image data."));
      }

      const img = new Image();
      img.onerror = () => reject(new Error("Failed to load image for processing."));
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        if (width > maxWidth || height > maxHeight) {
          if (width > height) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          } else {
            width = Math.round((width * maxHeight) / height);
            height = maxHeight;
          }
        }

        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, width);
        canvas.height = Math.max(1, height);

        const ctx = canvas.getContext("2d", { alpha: true });
        if (!ctx) {
          return reject(new Error("Canvas 2D context unavailable."));
        }

        // Apply high quality smoothing
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(img, 0, 0, width, height);

        // Try modern WebP first
        let dataUrl = canvas.toDataURL("image/webp", quality);
        let format: "webp" | "jpeg" = "webp";

        if (!dataUrl.startsWith("data:image/webp")) {
          // Fallback to JPEG if WebP export is unsupported
          dataUrl = canvas.toDataURL("image/jpeg", quality);
          format = "jpeg";
        }

        // Calculate compressed size in bytes from base64
        const headIndex = dataUrl.indexOf(",");
        const base64Data = headIndex !== -1 ? dataUrl.slice(headIndex + 1) : dataUrl;
        const compressedSizeBytes = Math.round((base64Data.length * 3) / 4);

        const originalSizeBytes = file.size;
        const reductionPercent = Math.max(
          0,
          Math.round(((originalSizeBytes - compressedSizeBytes) / originalSizeBytes) * 100)
        );

        resolve({
          dataUrl,
          format,
          originalSizeBytes,
          compressedSizeBytes,
          originalSizeFormatted: formatBytes(originalSizeBytes),
          compressedSizeFormatted: formatBytes(compressedSizeBytes),
          reductionPercent,
        });
      };

      img.src = src;
    };

    reader.readAsDataURL(file);
  });
}
