import { useEffect, useState } from "react";
import { Download, Eye } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  downloadContentAttachment,
  downloadStorageAttachment,
  fetchStorageAttachment,
} from "@/lib/content-download";

const STORAGE_BUCKET = "course-fee-structures";

export function FeeStructureActions({
  path,
  url,
  filename,
  title,
}: {
  path: string | null;
  url?: string | null;
  filename: string;
  title: string;
}) {
  const [busy, setBusy] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  async function download() {
    setBusy(true);
    try {
      if (path) await downloadStorageAttachment(STORAGE_BUCKET, path, filename);
      else if (url) await downloadContentAttachment(url, filename);
      else throw new Error("This fee structure file is not available.");
    } catch (error) {
      toast.error("Could not download fee structure", {
        description: error instanceof Error ? error.message : "The file could not be downloaded.",
      });
    } finally {
      setBusy(false);
    }
  }

  async function view() {
    if (!path) {
      toast.info("Download this fee structure to view it.");
      return;
    }
    setBusy(true);
    try {
      const blob = await fetchStorageAttachment(STORAGE_BUCKET, path);
      if (blob.type && blob.type !== "application/pdf") {
        throw new Error("The uploaded fee structure is not a PDF.");
      }
      const nextUrl = URL.createObjectURL(new Blob([blob], { type: "application/pdf" }));
      setPreviewUrl((previousUrl) => {
        if (previousUrl) URL.revokeObjectURL(previousUrl);
        return nextUrl;
      });
    } catch (error) {
      toast.error("Could not open fee structure", {
        description: error instanceof Error ? error.message : "The PDF could not be opened.",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {path && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => void view()}
          >
            <Eye className="h-4 w-4" />
            View
          </Button>
        )}
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => void download()}
        >
          <Download className="h-4 w-4" />
          {busy ? "Preparing…" : "Download"}
        </Button>
      </div>
      <Dialog
        open={Boolean(previewUrl)}
        onOpenChange={(open) => {
          if (!open) {
            setPreviewUrl((previousUrl) => {
              if (previousUrl) URL.revokeObjectURL(previousUrl);
              return null;
            });
          }
        }}
      >
        <DialogContent className="flex h-[min(90vh,56rem)] max-w-5xl flex-col">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
          </DialogHeader>
          {previewUrl && (
            <iframe title={title} src={previewUrl} className="min-h-0 flex-1 rounded-md border" />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
