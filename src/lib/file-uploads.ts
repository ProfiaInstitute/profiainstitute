export const MAX_CONTENT_UPLOAD_SIZE = 100 * 1024 * 1024;

const contentTypesByExtension: Record<string, string> = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  mp4: "video/mp4",
  m4v: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
  ogg: "video/ogg",
  oga: "audio/ogg",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  m4a: "audio/mp4",
};

export function supportedContentType(file: File) {
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  const inferred = contentTypesByExtension[extension];
  if (!inferred) return null;
  if (!file.type) return inferred;
  if (file.type === inferred) return inferred;
  if (extension === "ogg" && ["application/ogg", "audio/ogg"].includes(file.type))
    return file.type === "audio/ogg" ? "audio/ogg" : "video/ogg";
  return null;
}

export function contentKind(contentType: string): "image" | "video" | "audio" | "document" {
  if (contentType.startsWith("image/")) return "image";
  if (contentType.startsWith("video/")) return "video";
  if (contentType.startsWith("audio/")) return "audio";
  return "document";
}

export function safeUploadFileName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-180);
}
