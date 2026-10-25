export async function downloadContentAttachment(url: string, filename: string) {
  const response = await fetch(url);
  if (!response.ok) throw new Error("Could not download this attachment.");

  const objectUrl = URL.createObjectURL(await response.blob());
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
}
