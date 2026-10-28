import { supabase } from "@/integrations/supabase/client";

export async function downloadContentAttachment(url: string, filename: string) {
  const response = await fetch(url);
  if (!response.ok) throw new Error("Could not download this attachment.");

  await saveBlob(await response.blob(), filename);
}

export async function fetchStorageAttachment(bucket: string, path: string) {
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 300);
  if (error) throw error;

  const response = await fetch(data.signedUrl);
  if (!response.ok) throw new Error("Could not download this attachment.");
  return response.blob();
}

export async function downloadStorageAttachment(bucket: string, path: string, filename: string) {
  await saveBlob(await fetchStorageAttachment(bucket, path), filename);
}

async function saveBlob(blob: Blob, filename: string) {
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
}
