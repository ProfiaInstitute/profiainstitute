import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpen, FileUp, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import type { Json, Tables } from "@/integrations/supabase/types";
import { formatKES } from "@/lib/site";

type Level = Tables<"course_levels">;
type Unit = Tables<"course_units">;
type FeeLine = { label: string; amount: string };

const emptyDraft = {
  name: "",
  code: "",
  description: "",
  total_fee: "0",
  fee_structure_url: "",
  published: true,
};

function feeLines(value: Json): FeeLine[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (typeof item !== "object" || item === null || Array.isArray(item)) return [];
    const label = item["label"];
    const amount = item["amount"];
    if (typeof label !== "string" || typeof amount !== "number") return [];
    return [{ label, amount: String(amount) }];
  });
}

export function CourseLevelsManager() {
  const queryClient = useQueryClient();
  const [courseId, setCourseId] = useState("");
  const [levelId, setLevelId] = useState("");
  const [editingLevel, setEditingLevel] = useState<Level | null>(null);
  const [draft, setDraft] = useState(emptyDraft);
  const [feeItems, setFeeItems] = useState<FeeLine[]>([]);
  const [feeFile, setFeeFile] = useState<File | null>(null);
  const [unitDraft, setUnitDraft] = useState({ id: "", code: "", title: "", semester: "" });

  const courses = useQuery({
    queryKey: ["admin", "courses"],
    queryFn: async () => {
      const { data, error } = await supabase.from("courses").select("id,title").order("title");
      if (error) throw error;
      return data;
    },
  });
  const courseLevels = useQuery({
    queryKey: ["admin", "course-levels", courseId],
    enabled: Boolean(courseId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("course_levels")
        .select("*")
        .eq("course_id", courseId)
        .order("sort_order")
        .order("name");
      if (error) throw error;
      return data;
    },
  });
  const selectedLevel = courseLevels.data?.find((level) => level.id === levelId) ?? null;
  const units = useQuery({
    queryKey: ["admin", "course-level-units", levelId],
    enabled: Boolean(levelId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("course_units")
        .select("*")
        .eq("level_id", levelId)
        .order("sort_order")
        .order("title");
      if (error) throw error;
      return data;
    },
  });

  function resetLevelForm() {
    setEditingLevel(null);
    setDraft(emptyDraft);
    setFeeItems([]);
    setFeeFile(null);
    setUnitDraft({ id: "", code: "", title: "", semester: "" });
  }

  function editLevel(level: Level) {
    setEditingLevel(level);
    setLevelId(level.id);
    setDraft({
      name: level.name,
      code: level.code ?? "",
      description: level.description ?? "",
      total_fee: String(level.total_fee),
      fee_structure_url: level.fee_structure_url ?? "",
      published: level.published,
    });
    setFeeItems(feeLines(level.fee_items));
    setFeeFile(null);
  }

  const saveLevel = useMutation({
    mutationFn: async () => {
      if (!courseId) throw new Error("Choose a course first.");
      const name = draft.name.trim();
      if (!name) throw new Error("Enter a level name.");
      const totalFee = Number(draft.total_fee);
      if (!Number.isFinite(totalFee) || totalFee < 0) throw new Error("Enter a valid total fee.");
      if (feeFile && (feeFile.type !== "application/pdf" || feeFile.size > 10 * 1024 * 1024)) {
        throw new Error("Choose a PDF fee structure no larger than 10 MB.");
      }
      if (feeItems.some((item) => Boolean(item.label.trim()) !== Boolean(item.amount.trim()))) {
        throw new Error("Complete both the label and amount for each fee item.");
      }
      const feeItemsData = feeItems
        .filter((item) => item.label.trim() && item.amount.trim())
        .map((item) => ({ label: item.label.trim(), amount: Number(item.amount) }));
      if (feeItemsData.some((item) => !Number.isFinite(item.amount) || item.amount < 0)) {
        throw new Error("Fee line amounts must be valid non-negative numbers.");
      }
      const values = {
        course_id: courseId,
        name,
        code: draft.code.trim() || null,
        description: draft.description.trim() || null,
        total_fee: totalFee,
        fee_items: feeItemsData as Json,
        fee_structure_url: draft.fee_structure_url.trim() || null,
        fee_structure_path: editingLevel?.fee_structure_path ?? null,
        published: draft.published,
        sort_order: editingLevel?.sort_order ?? (courseLevels.data?.length ?? 0) + 1,
      };
      const request = editingLevel
        ? supabase
            .from("course_levels")
            .update(values)
            .eq("id", editingLevel.id)
            .select("*")
            .single()
        : supabase.from("course_levels").insert(values).select("*").single();
      const { data, error } = await request;
      if (error) throw error;
      if (feeFile) {
        const path = `${courseId}/${data.id}/${crypto.randomUUID()}-${feeFile.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
        const { error: uploadError } = await supabase.storage
          .from("course-fee-structures")
          .upload(path, feeFile, { contentType: "application/pdf", upsert: false });
        if (uploadError) {
          throw new Error(
            `Level was saved, but the fee PDF could not be uploaded: ${uploadError.message}`,
          );
        }
        const { data: publicUrl } = supabase.storage
          .from("course-fee-structures")
          .getPublicUrl(path);
        const { error: fileUpdateError } = await supabase
          .from("course_levels")
          .update({ fee_structure_url: publicUrl.publicUrl, fee_structure_path: path })
          .eq("id", data.id);
        if (fileUpdateError) {
          const { error: cleanupError } = await supabase.storage
            .from("course-fee-structures")
            .remove([path]);
          throw new Error(
            cleanupError
              ? `Fee PDF could not be linked: ${fileUpdateError.message}. The unused upload could not be removed: ${cleanupError.message}`
              : `Fee PDF uploaded but could not be linked to the level: ${fileUpdateError.message}`,
          );
        }
        if (editingLevel?.fee_structure_path) {
          const { error: removeError } = await supabase.storage
            .from("course-fee-structures")
            .remove([editingLevel.fee_structure_path]);
          if (removeError)
            toast.error("Old fee PDF could not be removed", { description: removeError.message });
        }
      } else if (
        editingLevel?.fee_structure_path &&
        values.fee_structure_url !== editingLevel.fee_structure_url
      ) {
        const { error: removeError } = await supabase.storage
          .from("course-fee-structures")
          .remove([editingLevel.fee_structure_path]);
        if (removeError)
          toast.error("Old fee PDF could not be removed", { description: removeError.message });
        const { error: clearPathError } = await supabase
          .from("course_levels")
          .update({ fee_structure_path: null })
          .eq("id", data.id);
        if (clearPathError) throw clearPathError;
      }
      return data;
    },
    onSuccess: async (level) => {
      await queryClient.invalidateQueries({ queryKey: ["admin", "course-levels", courseId] });
      await queryClient.invalidateQueries({ queryKey: ["course-levels"] });
      await queryClient.invalidateQueries({ queryKey: ["application-course-levels", courseId] });
      setLevelId(level.id);
      resetLevelForm();
      toast.success(editingLevel ? "Course level updated" : "Course level added");
    },
    onError: (error) => {
      void queryClient.invalidateQueries({ queryKey: ["admin", "course-levels", courseId] });
      toast.error("Could not save course level", { description: error.message });
    },
  });

  const deleteLevel = useMutation({
    mutationFn: async (level: Level) => {
      const { error } = await supabase.from("course_levels").delete().eq("id", level.id);
      if (error) throw error;
      if (level.fee_structure_path) {
        const { error: storageError } = await supabase.storage
          .from("course-fee-structures")
          .remove([level.fee_structure_path]);
        if (storageError) throw storageError;
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["admin", "course-levels", courseId] });
      await queryClient.invalidateQueries({ queryKey: ["course-levels"] });
      setLevelId("");
      resetLevelForm();
      toast.success("Course level deleted");
    },
    onError: (error) => {
      void queryClient.invalidateQueries({ queryKey: ["admin", "course-levels", courseId] });
      toast.error("Could not delete course level", { description: error.message });
    },
  });

  const saveUnit = useMutation({
    mutationFn: async () => {
      if (!selectedLevel) throw new Error("Select a level first.");
      if (!unitDraft.title.trim()) throw new Error("Enter a unit title.");
      const values = {
        course_id: courseId,
        level_id: selectedLevel.id,
        code: unitDraft.code.trim() || null,
        title: unitDraft.title.trim(),
        semester: unitDraft.semester.trim() || null,
      };
      const request = unitDraft.id
        ? supabase.from("course_units").update(values).eq("id", unitDraft.id)
        : supabase.from("course_units").insert({
            ...values,
            sort_order: units.data?.length ?? 0,
          });
      const { error } = await request;
      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["admin", "course-level-units", levelId] });
      await queryClient.invalidateQueries({ queryKey: ["course-level-units", levelId] });
      await queryClient.invalidateQueries({ queryKey: ["application-level-units", levelId] });
      setUnitDraft({ id: "", code: "", title: "", semester: "" });
      toast.success("Unit saved");
    },
    onError: (error) => toast.error("Could not save unit", { description: error.message }),
  });
  const deleteUnit = useMutation({
    mutationFn: async (unit: Unit) => {
      const { error } = await supabase.from("course_units").delete().eq("id", unit.id);
      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["admin", "course-level-units", levelId] });
      await queryClient.invalidateQueries({ queryKey: ["course-level-units", levelId] });
      await queryClient.invalidateQueries({ queryKey: ["application-level-units", levelId] });
      toast.success("Unit deleted");
    },
    onError: (error) => toast.error("Could not delete unit", { description: error.message }),
  });

  return (
    <section className="space-y-6">
      <header>
        <p className="eyebrow">Academic catalogue</p>
        <h2 className="mt-1 text-2xl font-bold text-brand">Course levels, units & fees</h2>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
          Publish course levels with their unit lists, fee breakdowns, and downloadable fee
          schedules. Students will choose a level when applying.
        </p>
      </header>
      {courses.error ? (
        <p
          role="alert"
          className="rounded-lg border border-destructive/30 p-4 text-sm text-destructive"
        >
          Could not load courses: {courses.error.message}
        </p>
      ) : (
        <label className="block max-w-xl space-y-2 text-sm font-medium">
          Course
          <select
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2"
            value={courseId}
            onChange={(event) => {
              setCourseId(event.target.value);
              setLevelId("");
              resetLevelForm();
            }}
          >
            <option value="">Choose a course</option>
            {courses.data?.map((course) => (
              <option key={course.id} value={course.id}>
                {course.title}
              </option>
            ))}
          </select>
        </label>
      )}
      {courseId && (
        <div className="grid gap-6 xl:grid-cols-[minmax(280px,0.8fr)_minmax(0,1.2fr)]">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-brand">Levels</h3>
              <Button type="button" size="sm" variant="outline" onClick={resetLevelForm}>
                <Plus className="h-4 w-4" /> Add level
              </Button>
            </div>
            {courseLevels.error && (
              <p role="alert" className="text-sm text-destructive">
                Could not load levels: {courseLevels.error.message}
              </p>
            )}
            {courseLevels.data?.map((level) => (
              <div
                key={level.id}
                className={`rounded-xl border bg-card p-4 ${level.id === levelId ? "border-primary ring-1 ring-primary" : ""}`}
              >
                <button
                  type="button"
                  className="w-full text-left"
                  onClick={() => {
                    setLevelId(level.id);
                    resetLevelForm();
                  }}
                >
                  <span className="flex items-center justify-between gap-2 font-semibold text-brand">
                    {level.name}
                    <Badge variant={level.published ? "default" : "secondary"}>
                      {level.published ? "Published" : "Hidden"}
                    </Badge>
                  </span>
                  <span className="mt-1 block text-sm text-muted-foreground">
                    {formatKES(level.total_fee)} in fees
                  </span>
                </button>
                <div className="mt-3 flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => editLevel(level)}>
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      if (window.confirm(`Delete ${level.name} and its assigned units?`)) {
                        deleteLevel.mutate(level);
                      }
                    }}
                  >
                    <Trash2 className="h-4 w-4" /> Delete
                  </Button>
                </div>
              </div>
            ))}
            {!courseLevels.isLoading && !courseLevels.data?.length && (
              <p className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">
                No levels yet. Add the first level to organize this course.
              </p>
            )}
            <form
              className="space-y-4 rounded-xl border bg-card p-4"
              onSubmit={(event) => {
                event.preventDefault();
                saveLevel.mutate();
              }}
            >
              <h3 className="font-semibold text-brand">
                {editingLevel ? "Edit level" : "New level"}
              </h3>
              <Input
                required
                placeholder="Level name (for example, Level 1)"
                value={draft.name}
                onChange={(event) => setDraft({ ...draft, name: event.target.value })}
              />
              <Input
                placeholder="Short code (optional)"
                value={draft.code}
                onChange={(event) => setDraft({ ...draft, code: event.target.value })}
              />
              <Textarea
                placeholder="Level description"
                value={draft.description}
                onChange={(event) => setDraft({ ...draft, description: event.target.value })}
              />
              <Input
                type="number"
                min="0"
                step="0.01"
                required
                placeholder="Total level fee (KES)"
                value={draft.total_fee}
                onChange={(event) => setDraft({ ...draft, total_fee: event.target.value })}
              />
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">Fee breakdown</p>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setFeeItems([...feeItems, { label: "", amount: "" }])}
                  >
                    <Plus className="h-4 w-4" /> Add fee
                  </Button>
                </div>
                {feeItems.map((item, index) => (
                  <div key={index} className="flex gap-2">
                    <Input
                      aria-label="Fee item name"
                      placeholder="Tuition, exams, etc."
                      value={item.label}
                      onChange={(event) =>
                        setFeeItems(
                          feeItems.map((line, i) =>
                            i === index ? { ...line, label: event.target.value } : line,
                          ),
                        )
                      }
                    />
                    <Input
                      aria-label="Fee item amount"
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="KES"
                      value={item.amount}
                      onChange={(event) =>
                        setFeeItems(
                          feeItems.map((line, i) =>
                            i === index ? { ...line, amount: event.target.value } : line,
                          ),
                        )
                      }
                    />
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      aria-label="Remove fee item"
                      onClick={() => setFeeItems(feeItems.filter((_, i) => i !== index))}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="fee-structure-url">
                  Fee structure link (optional)
                </label>
                <Input
                  id="fee-structure-url"
                  type="url"
                  placeholder="https://…"
                  value={draft.fee_structure_url}
                  onChange={(event) =>
                    setDraft({ ...draft, fee_structure_url: event.target.value })
                  }
                />
                <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
                  <FileUp className="h-4 w-4" />
                  {feeFile?.name ?? "Or upload a PDF from this device (max 10 MB)"}
                  <input
                    type="file"
                    accept="application/pdf,.pdf"
                    className="sr-only"
                    onChange={(event) => setFeeFile(event.target.files?.[0] ?? null)}
                  />
                </label>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={draft.published}
                  onChange={(event) => setDraft({ ...draft, published: event.target.checked })}
                />
                Published and available to students
              </label>
              <div className="flex gap-2">
                <Button type="submit" disabled={saveLevel.isPending}>
                  {saveLevel.isPending ? "Saving…" : "Save level"}
                </Button>
                {editingLevel && (
                  <Button type="button" variant="outline" onClick={resetLevelForm}>
                    Cancel
                  </Button>
                )}
              </div>
            </form>
          </div>
          <section className="space-y-4 rounded-xl border bg-card p-5">
            <header className="flex items-center gap-3">
              <BookOpen className="h-5 w-5 text-primary" />
              <div>
                <h3 className="font-semibold text-brand">
                  {selectedLevel ? `${selectedLevel.name} units` : "Units"}
                </h3>
                <p className="text-sm text-muted-foreground">
                  Units are assigned to the selected level and shown to applicants.
                </p>
              </div>
            </header>
            {!selectedLevel ? (
              <p className="rounded-lg bg-muted/40 p-4 text-sm text-muted-foreground">
                Select a level to manage its units.
              </p>
            ) : (
              <>
                <div className="space-y-2">
                  {units.data?.map((unit) => (
                    <div
                      key={unit.id}
                      className="flex items-center justify-between gap-3 rounded-lg border p-3"
                    >
                      <div>
                        <p className="font-medium">
                          {unit.code ? `${unit.code} · ` : ""}
                          {unit.title}
                        </p>
                        {unit.semester && (
                          <p className="text-xs text-muted-foreground">{unit.semester}</p>
                        )}
                      </div>
                      <div className="flex gap-1">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            setUnitDraft({
                              id: unit.id,
                              code: unit.code ?? "",
                              title: unit.title,
                              semester: unit.semester ?? "",
                            })
                          }
                        >
                          Edit
                        </Button>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          aria-label="Delete unit"
                          onClick={() => {
                            if (window.confirm(`Delete unit ${unit.title}?`))
                              deleteUnit.mutate(unit);
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                  {!units.isLoading && !units.data?.length && (
                    <p className="text-sm text-muted-foreground">
                      No units have been added to this level.
                    </p>
                  )}
                </div>
                <form
                  className="grid gap-3 border-t pt-4 sm:grid-cols-2"
                  onSubmit={(event) => {
                    event.preventDefault();
                    saveUnit.mutate();
                  }}
                >
                  <Input
                    required
                    placeholder="Unit title"
                    value={unitDraft.title}
                    onChange={(event) => setUnitDraft({ ...unitDraft, title: event.target.value })}
                  />
                  <Input
                    placeholder="Unit code"
                    value={unitDraft.code}
                    onChange={(event) => setUnitDraft({ ...unitDraft, code: event.target.value })}
                  />
                  <Input
                    placeholder="Semester or term"
                    value={unitDraft.semester}
                    onChange={(event) =>
                      setUnitDraft({ ...unitDraft, semester: event.target.value })
                    }
                  />
                  <div className="flex gap-2">
                    <Button type="submit" disabled={saveUnit.isPending}>
                      {unitDraft.id ? "Update unit" : "Add unit"}
                    </Button>
                    {unitDraft.id && (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setUnitDraft({ id: "", code: "", title: "", semester: "" })}
                      >
                        Cancel
                      </Button>
                    )}
                  </div>
                </form>
              </>
            )}
          </section>
        </div>
      )}
    </section>
  );
}
