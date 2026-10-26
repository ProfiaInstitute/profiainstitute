import { useEffect, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ImagePlus, Pencil, Save, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useUser } from "@/lib/auth";
import {
  MAX_CONTENT_UPLOAD_SIZE,
  safeUploadFileName,
  supportedContentType,
} from "@/lib/file-uploads";
import type { Tables } from "@/integrations/supabase/types";

type SiteMedia = Tables<"media">;
type MediaCategory = "hero" | "page-banner" | "homepage" | "partners";

const categoryLabels: Record<MediaCategory, string> = {
  hero: "Homepage slideshow",
  "page-banner": "Page banner",
  homepage: "Homepage gallery",
  partners: "Partners",
};

const pageOptions = [
  ["/about", "About"],
  ["/academics", "Academics"],
  ["/admission", "Admissions"],
  ["/contact", "Contact"],
  ["/business", "School of Business"],
  ["/ict", "School of ICT"],
  ["/hospitality", "School of Hospitality"],
  ["/engineering", "School of Engineering"],
  ["/cosmetology", "School of Beauty & Cosmetology"],
  ["/tech-hub", "Tech Hub"],
  ["/online-courses", "Online courses"],
] as const;

export function SiteMediaManager() {
  const queryClient = useQueryClient();
  const { user } = useUser();
  const [editing, setEditing] = useState<SiteMedia | null>(null);
  const [category, setCategory] = useState<MediaCategory>("hero");
  const [slot, setSlot] = useState("/");
  const [caption, setCaption] = useState("");
  const [alt, setAlt] = useState("");
  const [url, setUrl] = useState("");
  const [sortOrder, setSortOrder] = useState("0");
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const mediaQuery = useQuery({
    queryKey: ["admin", "site-media"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("media")
        .select("*")
        .order("category")
        .order("sort_order");
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return;
    }
    const objectUrl = URL.createObjectURL(file);
    setPreviewUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);

  function resetForm() {
    setEditing(null);
    setCategory("hero");
    setSlot("/");
    setCaption("");
    setAlt("");
    setUrl("");
    setSortOrder("0");
    setFile(null);
  }

  function editItem(item: SiteMedia) {
    if (!isMediaCategory(item.category)) {
      toast.error("This media category is not supported in the editor.");
      return;
    }
    setEditing(item);
    setCategory(item.category);
    setSlot(item.slot || "/");
    setCaption(item.caption ?? "");
    setAlt(item.alt ?? "");
    setUrl(item.url);
    setSortOrder(String(item.sort_order));
    setFile(null);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const order = Number(sortOrder);
    if (!Number.isInteger(order) || order < 0) {
      toast.error("Display order must be a non-negative whole number.");
      return;
    }
    if (category === "page-banner" && !pageOptions.some(([path]) => path === slot)) {
      toast.error("Choose the page that should use this banner.");
      return;
    }
    if (category === "page-banner" && mediaQuery.isLoading) {
      toast.error("Wait for the existing site media to load before adding a page banner.");
      return;
    }
    if (
      category === "page-banner" &&
      mediaQuery.data?.some(
        (item) => item.category === "page-banner" && item.slot === slot && item.id !== editing?.id,
      )
    ) {
      toast.error("That page already has a banner. Edit its existing banner instead.");
      return;
    }
    const contentType = file ? supportedContentType(file) : null;
    if (file && (!contentType?.startsWith("image/") || file.size > MAX_CONTENT_UPLOAD_SIZE)) {
      toast.error(
        !contentType?.startsWith("image/")
          ? "Choose a supported image file (JPG, PNG, GIF, or WebP)."
          : "The image must be 100 MB or smaller.",
      );
      return;
    }
    if (!file && !url.trim()) {
      toast.error("Choose an image file or enter an image URL.");
      return;
    }

    setSaving(true);
    let uploadedPath: string | null = null;
    const previousFilePath = editing?.file_path ?? null;
    try {
      let imageUrl = url.trim();
      let filePath = editing && url.trim() !== editing.url ? null : (editing?.file_path ?? null);
      if (file && contentType) {
        uploadedPath = `site/${crypto.randomUUID()}-${safeUploadFileName(file.name)}`;
        const { error } = await supabase.storage.from("media").upload(uploadedPath, file, {
          contentType,
          upsert: false,
        });
        if (error) throw error;
        imageUrl = supabase.storage.from("media").getPublicUrl(uploadedPath).data.publicUrl;
        filePath = uploadedPath;
      }

      const values = {
        url: imageUrl,
        file_path: filePath,
        category,
        slot: category === "page-banner" ? slot : null,
        caption: caption.trim() || null,
        alt: alt.trim() || null,
        sort_order: order,
        ...(editing ? {} : { uploaded_by: user?.id ?? null, published: true }),
      };
      const result = editing
        ? await supabase.from("media").update(values).eq("id", editing.id)
        : await supabase.from("media").insert(values);
      if (result.error) throw result.error;

      if (previousFilePath && previousFilePath !== filePath) {
        const { error } = await supabase.storage.from("media").remove([previousFilePath]);
        if (error)
          toast.error("Image updated, but the previous image could not be removed.", {
            description: error.message,
          });
      }
      toast.success(editing ? "Site media updated" : "Site media added");
      resetForm();
      await refreshMedia(queryClient);
    } catch (error) {
      if (uploadedPath) {
        const { error: cleanupError } = await supabase.storage.from("media").remove([uploadedPath]);
        if (cleanupError)
          toast.error("Could not clean up the uploaded image.", {
            description: cleanupError.message,
          });
      }
      toast.error("Could not save site media.", {
        description: error instanceof Error ? error.message : "An unexpected error occurred.",
      });
    } finally {
      setSaving(false);
    }
  }

  const visibilityMutation = useMutation({
    mutationFn: async (item: SiteMedia) => {
      const { error } = await supabase
        .from("media")
        .update({ published: !item.published })
        .eq("id", item.id);
      if (error) throw error;
      return item;
    },
    onSuccess: async (item) => {
      toast.success(item.published ? "Media hidden from the site" : "Media published");
      await refreshMedia(queryClient);
    },
    onError: (error: Error) =>
      toast.error("Could not update media visibility.", { description: error.message }),
  });

  async function deleteItem(item: SiteMedia) {
    if (
      !window.confirm(`Delete this ${categoryLabels[categoryFor(item.category)] ?? "media"} item?`)
    )
      return;
    const { error } = await supabase.from("media").delete().eq("id", item.id);
    if (error) {
      toast.error("Could not delete media.", { description: error.message });
      return;
    }
    if (item.file_path) {
      const { error: storageError } = await supabase.storage.from("media").remove([item.file_path]);
      if (storageError)
        toast.error("Media record deleted, but its image file could not be removed.", {
          description: storageError.message,
        });
    }
    toast.success("Media deleted");
    if (editing?.id === item.id) resetForm();
    await refreshMedia(queryClient);
  }

  const items = mediaQuery.data ?? [];
  return (
    <section className="space-y-6 rounded-xl border bg-card p-5 shadow-card sm:p-6">
      <div>
        <p className="eyebrow">Website content</p>
        <h2 className="mt-1 text-xl font-bold text-brand sm:text-2xl">Site media & banners</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
          Upload and arrange homepage slides, page banners, gallery images and partner logos. Only
          published images appear on the public site. Use wide landscape images for hero slides and
          page banners.
        </p>
      </div>

      <form
        onSubmit={(event) => void save(event)}
        className="grid gap-4 rounded-xl bg-muted/40 p-4 sm:p-5"
      >
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-semibold text-brand">
            {editing ? "Edit site media" : "Add site media"}
          </h3>
          {editing && (
            <Button type="button" size="sm" variant="ghost" onClick={resetForm}>
              <X className="h-4 w-4" /> Cancel edit
            </Button>
          )}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="grid gap-1.5 text-sm font-medium">
            Placement
            <select
              className={fieldClass}
              value={category}
              onChange={(event) => setCategory(event.target.value as MediaCategory)}
            >
              {Object.entries(categoryLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          {category === "page-banner" ? (
            <label className="grid gap-1.5 text-sm font-medium">
              Page
              <select
                className={fieldClass}
                value={slot}
                onChange={(event) => setSlot(event.target.value)}
              >
                {pageOptions.map(([path, label]) => (
                  <option key={path} value={path}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <label className="grid gap-1.5 text-sm font-medium">
              Display order
              <Input
                type="number"
                min="0"
                step="1"
                required
                value={sortOrder}
                onChange={(event) => setSortOrder(event.target.value)}
              />
            </label>
          )}
          <label className="grid gap-1.5 text-sm font-medium sm:col-span-2">
            Image file
            <Input
              type="file"
              accept="image/jpeg,image/png,image/gif,image/webp"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            />
            <span className="text-xs font-normal text-muted-foreground">
              JPG, PNG, GIF or WebP; up to 100 MB. Upload a replacement or use the URL field.
            </span>
          </label>
          <label className="grid gap-1.5 text-sm font-medium sm:col-span-2">
            Or image URL
            <Input
              type="url"
              placeholder="https://example.com/image.jpg"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
            />
          </label>
          <label className="grid gap-1.5 text-sm font-medium sm:col-span-2">
            {category === "hero" ? "Slide heading (optional)" : "Caption (optional)"}
            <Input
              value={caption}
              onChange={(event) => setCaption(event.target.value)}
              placeholder="Short heading or caption"
            />
          </label>
          <label className="grid gap-1.5 text-sm font-medium sm:col-span-2">
            Accessible image description
            <Input
              value={alt}
              onChange={(event) => setAlt(event.target.value)}
              placeholder="Describe what the image shows"
            />
          </label>
          {category === "page-banner" && (
            <label className="grid gap-1.5 text-sm font-medium">
              Display order
              <Input
                type="number"
                min="0"
                step="1"
                required
                value={sortOrder}
                onChange={(event) => setSortOrder(event.target.value)}
              />
            </label>
          )}
        </div>
        {(previewUrl || (!file && url)) && (
          <img
            src={previewUrl || url}
            alt={alt || "Selected site media preview"}
            className="max-h-56 w-full rounded-lg border bg-background object-cover"
          />
        )}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={saving}>
            {editing ? <Save /> : <ImagePlus />}
            {saving ? "Saving…" : editing ? "Save media" : "Add media"}
          </Button>
          {file && (
            <Button type="button" variant="outline" onClick={() => setFile(null)}>
              Remove selected file
            </Button>
          )}
        </div>
      </form>

      {mediaQuery.isLoading ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Loading site media…</p>
      ) : mediaQuery.error ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          <p>Could not load site media: {mediaQuery.error.message}</p>
          <Button
            className="mt-3"
            size="sm"
            variant="outline"
            onClick={() => void mediaQuery.refetch()}
          >
            Retry
          </Button>
        </div>
      ) : items.length ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((item) => (
            <article key={item.id} className="overflow-hidden rounded-xl border bg-background">
              <div className="relative aspect-[16/9] bg-muted">
                <img
                  src={item.url}
                  alt={item.alt ?? ""}
                  loading="lazy"
                  className="h-full w-full object-cover"
                />
                <span
                  className={`absolute left-3 top-3 rounded-full px-2.5 py-1 text-xs font-semibold ${item.published ? "bg-emerald-600 text-white" : "bg-background/90 text-muted-foreground"}`}
                >
                  {item.published ? "Published" : "Hidden"}
                </span>
              </div>
              <div className="space-y-3 p-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-primary">
                    {categoryLabels[categoryFor(item.category)] ?? item.category}
                    {item.slot ? ` · ${pageLabel(item.slot)}` : ""}
                  </p>
                  <h4 className="mt-1 font-semibold text-brand">
                    {item.caption || item.alt || "Untitled image"}
                  </h4>
                  <p className="mt-1 text-xs text-muted-foreground">Order {item.sort_order}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={visibilityMutation.isPending}
                    onClick={() => visibilityMutation.mutate(item)}
                  >
                    {item.published ? "Hide" : "Publish"}
                  </Button>
                  <Button type="button" size="sm" variant="outline" onClick={() => editItem(item)}>
                    <Pencil className="h-4 w-4" /> Edit
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    onClick={() => void deleteItem(item)}
                  >
                    <Trash2 className="h-4 w-4" /> Delete
                  </Button>
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed p-8 text-center">
          <ImagePlus className="mx-auto h-8 w-8 text-primary" />
          <p className="mt-3 font-semibold text-brand">No site media yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Add the first hero slide, page banner, gallery image or partner logo above.
          </p>
        </div>
      )}
    </section>
  );
}

async function refreshMedia(queryClient: ReturnType<typeof useQueryClient>) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ["admin", "site-media"] }),
    queryClient.invalidateQueries({ queryKey: ["media"] }),
  ]);
}

function isMediaCategory(value: string): value is MediaCategory {
  return value in categoryLabels;
}

function categoryFor(value: string): MediaCategory {
  return isMediaCategory(value) ? value : "homepage";
}

function pageLabel(path: string) {
  return pageOptions.find(([option]) => option === path)?.[1] ?? path;
}

const fieldClass =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";
