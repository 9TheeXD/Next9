// Shrinks a photo before upload: longest side at most maxRes, JPEG at 0.8, name ending in .jpg.
// The same steps the old building form ran, so uploads stay the size the server expects.
export function compressImage(file: File, maxRes = 1080): Promise<File> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      let { width, height } = img;
      if (width > height) {
        if (width > maxRes) {
          height *= maxRes / width;
          width = maxRes;
        }
      } else if (height > maxRes) {
        width *= maxRes / height;
        height = maxRes;
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      canvas.getContext("2d")!.drawImage(img, 0, 0, width, height);
      URL.revokeObjectURL(url);
      canvas.toBlob(
        (blob) => {
          if (!blob) return reject(new Error("Canvas toBlob failed"));
          resolve(new File([blob], file.name.replace(/\.[^/.]+$/, ".jpg"), { type: "image/jpeg", lastModified: Date.now() }));
        },
        "image/jpeg",
        0.8,
      );
    };
    img.onerror = (e) => {
      URL.revokeObjectURL(url);
      reject(e);
    };
    img.src = url;
  });
}
