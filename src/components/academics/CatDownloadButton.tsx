import { useState } from "react";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { downloadStorageAttachment } from "@/lib/content-download";

export function CatDownloadButton({
  path,
  filename,
  name,
}: {
  path: string;
  filename: string;
  name: string;
}) {
  const [busy, setBusy] = useState(false);

  async function download() {
    setBusy(true);
    try {
      await downloadStorageAttachment("learning", path, filename);
    } catch (error) {
      toast.error("Could not download CAT file", {
        description: error instanceof Error ? error.message : "The file could not be downloaded.",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button type="button" variant="outline" disabled={busy} onClick={() => void download()}>
      <Download className="h-4 w-4" />
      {busy ? "Preparing…" : `Download ${name}`}
    </Button>
  );
}
