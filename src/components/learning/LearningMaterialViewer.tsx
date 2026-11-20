import { useEffect, useState } from "react";
import { BookOpen, Eye, FileText, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import {
  getGoogleBooksEmbedUrl,
  getGoogleBooksThumbnailUrl,
  getGoogleDriveEmbedUrl,
  getGoogleDriveThumbnailUrl,
  getYouTubeEmbedUrl,
} from "@/lib/content-format";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";

type LearningMaterialViewerProps = {
  title: string;
  materialType?: string | null;
  url?: string | null;
  filePath?: string | null;
  className?: string;
};

function getSafeUrl(value: string | null | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
  } catch {
    return null;
  }
}

function getExtension(value: string) {
  try {
    return new URL(value).pathname.split(".").pop()?.toLowerCase() ?? "";
  } catch {
    return "";
  }
}

export function LearningMaterialViewer({
  title,
  materialType,
  url,
  filePath,
  className,
}: LearningMaterialViewerProps) {
  const [open, setOpen] = useState(false);
  const [wordText, setWordText] = useState<string | null>(null);
  const [wordError, setWordError] = useState<string | null>(null);

  const fileQuery = useQuery({
    queryKey: ["learning-material-preview", filePath],
    enabled: Boolean(filePath) && open,
    queryFn: async () => {
      const { data, error } = await supabase.storage
        .from("learning")
        .createSignedUrl(filePath!, 300);
      if (error) throw error;
      return data.signedUrl;
    },
    staleTime: 4 * 60_000,
  });

  const source = getSafeUrl(filePath ? fileQuery.data : url);
  const youtubeEmbedUrl = url ? getYouTubeEmbedUrl(url) : null;
  const googleBooksEmbedUrl = url ? getGoogleBooksEmbedUrl(url) : null;
  const googleDriveEmbedUrl = url ? getGoogleDriveEmbedUrl(url) : null;
  const youtubeId = youtubeEmbedUrl?.split("/embed/")[1]?.split("?")[0];
  const extension = source ? getExtension(source) : "";
  const isVideo =
    ["mp4", "m4v", "webm", "mov", "ogg"].includes(extension) ||
    (materialType === "video" && !["mp3", "wav", "m4a", "oga"].includes(extension));
  const isAudio =
    ["mp3", "wav", "m4a", "oga"].includes(extension) ||
    (materialType === "audio" && !["mp4", "m4v", "webm", "mov", "ogg"].includes(extension));
  const isImage =
    ["jpg", "jpeg", "png", "gif", "webp"].includes(extension) || materialType === "image";
  const isWord = ["doc", "docx"].includes(extension);

  useEffect(() => {
    let active = true;
    if (!open || !source || extension !== "docx") {
      setWordText(null);
      setWordError(null);
      return;
    }

    void (async () => {
      try {
        const response = await fetch(source);
        if (!response.ok) throw new Error("Could not load this Word document.");
        const mammoth = await import("mammoth");
        const result = await mammoth.extractRawText({ arrayBuffer: await response.arrayBuffer() });
        if (active) setWordText(result.value);
      } catch (error) {
        if (active)
          setWordError(
            error instanceof Error ? error.message : "Could not preview this Word document.",
          );
      }
    })();

    return () => {
      active = false;
    };
  }, [extension, open, source]);

  const thumbnail = youtubeId
    ? `https://img.youtube.com/vi/${youtubeId}/hqdefault.jpg`
    : url
      ? (getGoogleBooksThumbnailUrl(url) ?? getGoogleDriveThumbnailUrl(url))
      : null;
  const resolvedThumbnail = thumbnail ?? (isImage ? source : null);
  const hasMaterial = Boolean(filePath || url);
  const fallbackUrl = youtubeEmbedUrl ? getSafeUrl(url) : source;

  return (
    <>
      <div className={cn("space-y-2", className)}>
        {hasMaterial && (
          <button
            type="button"
            className="group relative block aspect-video w-full max-w-sm overflow-hidden rounded-lg border bg-muted text-left"
            onClick={() => setOpen(true)}
            aria-label={`Preview ${title}`}
          >
            {resolvedThumbnail ? (
              <img
                src={resolvedThumbnail}
                alt={`${title} thumbnail`}
                className="h-full w-full object-cover"
                loading="lazy"
              />
            ) : (
              <span className="grid h-full place-items-center gap-2 text-center text-muted-foreground">
                {materialType === "video" ? (
                  <Play className="h-10 w-10" />
                ) : materialType === "document" ? (
                  <FileText className="h-10 w-10" />
                ) : (
                  <BookOpen className="h-10 w-10" />
                )}
                <span className="line-clamp-2 px-4 text-sm font-medium">{title}</span>
              </span>
            )}
            {youtubeId && (
              <span className="absolute inset-0 grid place-items-center bg-black/25 text-white transition group-hover:bg-black/40">
                <Play className="h-12 w-12 fill-current" />
              </span>
            )}
          </button>
        )}
        {hasMaterial ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={Boolean(filePath && fileQuery.isLoading)}
            onClick={() => setOpen(true)}
          >
            <Eye className="h-4 w-4" />
            {filePath && fileQuery.isLoading ? "Preparing preview…" : "Open in portal"}
          </Button>
        ) : (
          <span className="inline-flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
            {materialType === "document" ? (
              <FileText className="h-4 w-4" />
            ) : (
              <BookOpen className="h-4 w-4" />
            )}
            {title}
          </span>
        )}
        {fileQuery.error && (
          <p role="alert" className="text-xs text-destructive">
            Could not prepare material preview: {fileQuery.error.message}
          </p>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex h-[min(90vh,56rem)] max-w-5xl flex-col">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
          </DialogHeader>
          <div className="min-h-0 flex-1">
            {filePath && fileQuery.isLoading ? (
              <p className="text-sm text-muted-foreground">Preparing material preview…</p>
            ) : !hasMaterial || !source ? (
              <p className="text-sm text-muted-foreground">
                This material does not have a previewable link or uploaded file.
              </p>
            ) : youtubeEmbedUrl ? (
              <iframe
                src={youtubeEmbedUrl}
                title={title}
                className="h-full min-h-64 w-full rounded-md bg-black"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                referrerPolicy="strict-origin-when-cross-origin"
              />
            ) : googleBooksEmbedUrl || googleDriveEmbedUrl ? (
              <iframe
                src={googleBooksEmbedUrl ?? googleDriveEmbedUrl ?? undefined}
                title={title}
                className="h-full min-h-64 w-full rounded-md border"
                allowFullScreen
              />
            ) : isVideo ? (
              <video
                src={source}
                className="h-full max-h-full w-full rounded-md bg-black"
                controls
                playsInline
              />
            ) : isAudio ? (
              <div className="flex h-full items-center justify-center">
                <audio src={source} className="w-full" controls />
              </div>
            ) : isImage ? (
              <div className="grid h-full place-items-center overflow-auto">
                <img src={source} alt={title} className="max-h-full max-w-full object-contain" />
              </div>
            ) : isWord && wordText !== null ? (
              <article className="h-full overflow-auto whitespace-pre-wrap rounded-md border bg-card p-5 text-sm leading-7">
                {wordText || "This document contains no readable text."}
              </article>
            ) : isWord && !wordError ? (
              <p className="text-sm text-muted-foreground">Preparing Word document preview…</p>
            ) : (
              <iframe
                src={source}
                title={title}
                className="h-full min-h-64 w-full rounded-md border"
              />
            )}
          </div>
          {wordError && (
            <p role="alert" className="text-sm text-destructive">
              {wordError} The document may still be available in the embedded preview above.
            </p>
          )}
          {fallbackUrl && (
            <a
              className="text-sm font-medium text-primary underline"
              href={fallbackUrl}
              target="_blank"
              rel="noreferrer"
            >
              {youtubeEmbedUrl
                ? "If playback is unavailable, open this video on YouTube"
                : "Open original resource"}
            </a>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
