import { useState } from "react";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { downloadStorageAttachment } from "@/lib/content-download";

export function SubmissionFileDownloads({ paths }: { paths: string[] }) {
  const [downloadingPath, setDownloadingPath] = useState<string | null>(null);

  async function download(path: string) {
    setDownloadingPath(path);
    try {
      const storedName = path.split("/").pop() ?? "submission";
      const filename = storedName.replace(/^[0-9a-f-]{36}-/i, "") || "submission";
      await downloadStorageAttachment("submissions", path, filename);
    } catch (error) {
      toast.error("Could not download submission file", {
        description: error instanceof Error ? error.message : "The file could not be downloaded.",
      });
    } finally {
      setDownloadingPath(null);
    }
  }

  if (!paths.length) return null;
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {paths.map((path, index) => (
        <Button
          key={path}
          type="button"
          size="sm"
          variant="outline"
          disabled={downloadingPath !== null}
          onClick={() => void download(path)}
        >
          <Download className="h-4 w-4" />
          {downloadingPath === path
            ? "Preparing…"
            : `Download ${paths.length > 1 ? `file ${index + 1}` : "file"}`}
        </Button>
      ))}
    </div>
  );
}
