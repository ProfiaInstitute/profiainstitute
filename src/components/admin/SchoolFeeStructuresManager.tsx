import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileUp, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

type FeeStructure = Tables<"school_fee_structures">;
type FeeStructureDraft = Pick<FeeStructure, "description" | "published" | "title">;

const emptyDraft: FeeStructureDraft = {
  description: "",
  published: true,
  title: "",
};

const STORAGE_BUCKET = "course-fee-structures";

function safeFilename(filename: string) {
  return filename.replace(/[^a-zA-Z0-9._-]/g, "_");
}

export function SchoolFeeStructuresManager() {
  const queryClient = useQueryClient();
  const [schoolId, setSchoolId] = useState("");
  const [editing, setEditing] = useState<FeeStructure | null>(null);
  const [draft, setDraft] = useState(emptyDraft);
  const [file, setFile] = useState<File | null>(null);

  const schools = useQuery({
    queryKey: ["admin", "fee-structure-schools"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("schools")
        .select("id,name")
        .order("sort_order")
        .order("name");
      if (error) throw error;
      return data;
    },
  });
  const structures = useQuery({
    queryKey: ["admin", "school-fee-structures", schoolId],
    enabled: Boolean(schoolId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("school_fee_structures")
        .select("*")
        .eq("school_id", schoolId)
        .order("sort_order")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  function resetForm() {
    setEditing(null);
    setDraft(emptyDraft);
    setFile(null);
  }

  function editStructure(structure: FeeStructure) {
    setEditing(structure);
    setDraft({
      description: structure.description ?? "",
      published: structure.published,
      title: structure.title,
    });
    setFile(null);
  }

  const save = useMutation({
    mutationFn: async () => {
      if (!schoolId) throw new Error("Choose a school first.");
      const title = draft.title.trim();
      if (!title) throw new Error("Enter a title for the fee structure.");
      if (!editing && !file) throw new Error("Upload a PDF fee structure.");
      if (file && (file.type !== "application/pdf" || file.size > 10 * 1024 * 1024)) {
        throw new Error("Choose a PDF fee structure no larger than 10 MB.");
      }

      let uploadedPath: string | null = null;
      if (file) {
        const documentId = editing?.id ?? crypto.randomUUID();
        uploadedPath = `${schoolId}/${documentId}/${crypto.randomUUID()}-${safeFilename(file.name)}`;
        const { error } = await supabase.storage
          .from(STORAGE_BUCKET)
          .upload(uploadedPath, file, { contentType: "application/pdf", upsert: false });
        if (error) throw error;
      }

      const values = {
        school_id: schoolId,
        title,
        description: draft.description?.trim() || null,
        published: draft.published,
        ...(uploadedPath && file ? { file_path: uploadedPath, file_name: file.name } : {}),
      };
      const request = editing
        ? supabase.from("school_fee_structures").update(values).eq("id", editing.id)
        : supabase.from("school_fee_structures").insert({
            ...values,
            file_path: uploadedPath!,
            file_name: file!.name,
            sort_order: (structures.data?.length ?? 0) + 1,
          });
      const { error } = await request;
      if (error) {
        if (uploadedPath) {
          const { error: cleanupError } = await supabase.storage
            .from(STORAGE_BUCKET)
            .remove([uploadedPath]);
          if (cleanupError) {
            throw new Error(
              `Fee structure could not be saved: ${error.message}. The unused upload could not be removed: ${cleanupError.message}`,
            );
          }
        }
        throw error;
      }

      if (uploadedPath && editing) {
        const { error: removeError } = await supabase.storage
          .from(STORAGE_BUCKET)
          .remove([editing.file_path]);
        if (removeError) {
          toast.error("New fee structure saved, but old file could not be removed", {
            description: removeError.message,
          });
        }
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["admin", "school-fee-structures", schoolId],
      });
      await queryClient.invalidateQueries({ queryKey: ["school-fee-structures"] });
      resetForm();
      toast.success(editing ? "Fee structure updated" : "Fee structure added");
    },
    onError: (error) => toast.error("Could not save fee structure", { description: error.message }),
  });

  const remove = useMutation({
    mutationFn: async (structure: FeeStructure) => {
      const { error } = await supabase
        .from("school_fee_structures")
        .delete()
        .eq("id", structure.id);
      if (error) throw error;
      const { error: storageError } = await supabase.storage
        .from(STORAGE_BUCKET)
        .remove([structure.file_path]);
      if (storageError) {
        throw new Error(
          `Fee structure record was deleted, but its file could not be removed: ${storageError.message}`,
        );
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["admin", "school-fee-structures", schoolId],
      });
      await queryClient.invalidateQueries({ queryKey: ["school-fee-structures"] });
      if (editing) resetForm();
      toast.success("Fee structure deleted");
    },
    onError: (error) =>
      toast.error("Could not delete fee structure", { description: error.message }),
  });

  return (
    <section className="space-y-6">
      <header>
        <p className="eyebrow">Academic catalogue</p>
        <h2 className="mt-1 text-2xl font-bold text-brand">School fee structures</h2>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
          Upload and publish PDF fee schedules for each school. Visitors can view or download
          published files from the Academics page.
        </p>
      </header>
      {schools.error ? (
        <p
          role="alert"
          className="rounded-lg border border-destructive/30 p-4 text-sm text-destructive"
        >
          Could not load schools: {schools.error.message}
        </p>
      ) : (
        <label className="block max-w-xl space-y-2 text-sm font-medium">
          School
          <select
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2"
            value={schoolId}
            onChange={(event) => {
              setSchoolId(event.target.value);
              resetForm();
            }}
          >
            <option value="">Choose a school</option>
            {schools.data?.map((school) => (
              <option key={school.id} value={school.id}>
                {school.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {schoolId && (
        <div className="grid gap-6 xl:grid-cols-[minmax(280px,0.8fr)_minmax(0,1.2fr)]">
          <div className="space-y-3">
            <h3 className="font-semibold text-brand">Published and draft files</h3>
            {structures.error && (
              <p role="alert" className="text-sm text-destructive">
                Could not load fee structures: {structures.error.message}
              </p>
            )}
            {structures.data?.map((structure) => (
              <article key={structure.id} className="rounded-xl border bg-card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h4 className="font-semibold text-brand">{structure.title}</h4>
                    <p className="mt-1 break-all text-xs text-muted-foreground">
                      {structure.file_name}
                    </p>
                  </div>
                  <Badge variant={structure.published ? "default" : "secondary"}>
                    {structure.published ? "Published" : "Hidden"}
                  </Badge>
                </div>
                <div className="mt-3 flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => editStructure(structure)}
                  >
                    <Pencil className="h-4 w-4" /> Edit
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={remove.isPending}
                    onClick={() => {
                      if (window.confirm(`Delete "${structure.title}"?`)) {
                        remove.mutate(structure);
                      }
                    }}
                  >
                    <Trash2 className="h-4 w-4" /> Delete
                  </Button>
                </div>
              </article>
            ))}
            {!structures.isLoading && !structures.error && !structures.data?.length && (
              <p className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">
                No fee structures have been added for this school.
              </p>
            )}
          </div>
          <form
            className="space-y-4 rounded-xl border bg-card p-5"
            onSubmit={(event) => {
              event.preventDefault();
              save.mutate();
            }}
          >
            <div className="flex items-center justify-between gap-3">
              <h3 className="font-semibold text-brand">
                {editing ? "Edit fee structure" : "Add fee structure"}
              </h3>
              {!editing && (
                <Button type="button" size="sm" variant="outline" onClick={resetForm}>
                  <Plus className="h-4 w-4" /> New
                </Button>
              )}
            </div>
            <Input
              required
              placeholder="Title (for example, 2025 Diploma Fee Schedule)"
              value={draft.title}
              onChange={(event) => setDraft({ ...draft, title: event.target.value })}
            />
            <Textarea
              placeholder="Optional description"
              value={draft.description ?? ""}
              onChange={(event) => setDraft({ ...draft, description: event.target.value })}
            />
            <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
              <FileUp className="h-4 w-4 shrink-0" />
              <span className="truncate">
                {file?.name ??
                  (editing
                    ? `Replace PDF · current file: ${editing.file_name}`
                    : "Upload a PDF (max 10 MB)")}
              </span>
              <input
                type="file"
                accept="application/pdf,.pdf"
                className="sr-only"
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              />
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={draft.published}
                onChange={(event) => setDraft({ ...draft, published: event.target.checked })}
              />
              Published on the public Academics page
            </label>
            <div className="flex gap-2">
              <Button type="submit" disabled={save.isPending} loading={save.isPending}>
                {save.isPending ? "Saving…" : editing ? "Save changes" : "Add fee structure"}
              </Button>
              {editing && (
                <Button type="button" variant="outline" onClick={resetForm}>
                  Cancel
                </Button>
              )}
            </div>
          </form>
        </div>
      )}
    </section>
  );
}
