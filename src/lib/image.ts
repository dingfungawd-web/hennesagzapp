const MAX_EDGE = 1600;

function isHeic(file: File) {
  const name = file.name.toLowerCase();
  return (
    file.type === "image/heic" ||
    file.type === "image/heif" ||
    name.endsWith(".heic") ||
    name.endsWith(".heif")
  );
}

function readAsDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("讀取檔案失敗"));
    reader.readAsDataURL(blob);
  });
}

async function downscale(dataUrl: string): Promise<string> {
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("圖片解碼失敗"));
      el.src = dataUrl;
    });
    const scale = Math.min(1, MAX_EDGE / Math.max(img.width, img.height));
    if (scale >= 1) return dataUrl;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return dataUrl;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.85);
  } catch {
    return dataUrl;
  }
}

/** Converts any uploaded image (including iPhone HEIC/HEIF) to a downscaled JPEG/PNG data URL. */
export async function fileToImageDataUrl(file: File): Promise<string> {
  if (isHeic(file)) {
    const { heicTo } = await import("heic-to");
    const jpeg = await heicTo({ blob: file, type: "image/jpeg", quality: 0.9 });
    return downscale(await readAsDataUrl(jpeg));
  }
  return downscale(await readAsDataUrl(file));
}
