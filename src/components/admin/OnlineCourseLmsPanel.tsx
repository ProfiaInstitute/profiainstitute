import { useEffect, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpen, Pencil, Plus, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { formatKES } from "@/lib/site";
import {
  MAX_CONTENT_UPLOAD_SIZE,
  safeUploadFileName,
  supportedContentType,
} from "@/lib/file-uploads";

type Course = Tables<"courses">;
type Lesson = Tables<"online_course_lessons">;
type LessonDraft = {
  title: string;
  section_title: string;
  description: string;
  notes: string;
  video_url: string;
  duration_minutes: string;
  sort_order: string;
  is_preview: boolean;
  published: boolean;
  file: File | null;
};

const emptyLesson: LessonDraft = {
  title: "",
  section_title: "Course lessons",
  description: "",
  notes: "",
  video_url: "",
  duration_minutes: "0",
  sort_order: "0",
  is_preview: false,
  published: false,
  file: null,
};

export function OnlineCourseLmsPanel() {
  const queryClient = useQueryClient();
  const [courseId, setCourseId] = useState("");
  const [editingLesson, setEditingLesson] = useState<Lesson | null>(null);
  const [lessonDraft, setLessonDraft] = useState(emptyLesson);
  const coursesQuery = useQuery({
    queryKey: ["admin", "lms-courses"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("courses")
        .select(
          "id,title,fees,duration,available_online,published,online_syllabus,online_intro_video_url,online_lecturer_name,online_lecturer_email,online_lecturer_phone,online_certificate_fee,online_exam_fee",
        )
        .order("title");
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    const currentCourses = coursesQuery.data ?? [];
    if (!currentCourses.some((course) => course.id === courseId))
      setCourseId(currentCourses.find((course) => course.available_online)?.id ?? "");
  }, [courseId, coursesQuery.data]);

  const activeCourse = coursesQuery.data?.find((course) => course.id === courseId);
  const lessonsQuery = useQuery({
    queryKey: ["admin", "lms-lessons", courseId],
    enabled: !!courseId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("online_course_lessons")
        .select("*")
        .eq("course_id", courseId)
        .order("sort_order")
        .order("created_at");
      if (error) throw error;
      return data;
    },
  });

  const saveCourse = useMutation({
    mutationFn: async (form: FormData) => {
      if (!courseId) throw new Error("Select a course.");
      const tuition = Number(form.get("fees"));
      const certificateFee = Number(form.get("certificateFee"));
      const examFee = Number(form.get("examFee"));
      if (
        ![tuition, certificateFee, examFee].every((value) => Number.isFinite(value) && value >= 0)
      )
        throw new Error("Course and assessment fees must be zero or greater.");
      const { error } = await supabase
        .from("courses")
        .update({
          available_online: form.get("availableOnline") === "on",
          fees: tuition,
          online_certificate_fee: certificateFee,
          online_exam_fee: examFee,
          online_intro_video_url: String(form.get("introVideo") ?? "").trim() || null,
          online_lecturer_email: String(form.get("lecturerEmail") ?? "").trim() || null,
          online_lecturer_name: String(form.get("lecturerName") ?? "").trim() || null,
          online_lecturer_phone: String(form.get("lecturerPhone") ?? "").trim() || null,
          online_syllabus: String(form.get("syllabus") ?? "").trim() || null,
        })
        .eq("id", courseId);
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("LMS course details saved");
      await queryClient.invalidateQueries({ queryKey: ["admin", "lms-courses"] });
      await queryClient.invalidateQueries({ queryKey: ["public-online-courses"] });
    },
    onError: (error) => toast.error("Could not save LMS course", { description: error.message }),
  });

  const removeOnlineCourse = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase
        .from("courses")
        .update({ available_online: false })
        .eq("id", id)
        .select("id")
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("The course was not removed. Refresh the LMS and try again.");
    },
    onSuccess: async () => {
      queryClient.setQueryData<Course[]>(["public-online-courses"], (current) =>
        current?.filter((course) => course.id !== courseId),
      );
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["admin", "lms-courses"] }),
        queryClient.invalidateQueries({ queryKey: ["public-online-courses"] }),
        queryClient.invalidateQueries({ queryKey: ["courses"] }),
      ]);
      toast.success("Course removed from the public online catalogue");
    },
    onError: (error) =>
      toast.error("Could not remove online course", { description: error.message }),
  });

  const saveLesson = useMutation({
    mutationFn: async () => {
      if (!courseId) throw new Error("Select a course.");
      const durationMinutes = Number(lessonDraft.duration_minutes);
      const sortOrder = Number(lessonDraft.sort_order);
      if (!lessonDraft.title.trim()) throw new Error("Enter a lesson title.");
      if (!Number.isInteger(durationMinutes) || durationMinutes < 0)
        throw new Error("Lesson duration must be a whole number of minutes.");
      if (!Number.isInteger(sortOrder) || sortOrder < 0)
        throw new Error("Lesson order must be a whole number of zero or greater.");

      const lessonId = editingLesson?.id ?? crypto.randomUUID();
      let filePath = editingLesson?.file_path ?? null;
      let fileType = editingLesson?.file_type ?? null;
      let uploadedPath: string | null = null;
      if (lessonDraft.file) {
        const type = supportedContentType(lessonDraft.file);
        if (
          !type ||
          (!type.startsWith("video/") &&
            !type.startsWith("application/pdf") &&
            !type.startsWith("image/"))
        )
          throw new Error("Upload a video, PDF, or image file.");
        if (lessonDraft.file.size > MAX_CONTENT_UPLOAD_SIZE)
          throw new Error("Lesson files must be 100 MB or smaller.");
        uploadedPath = `online/${courseId}/${lessonId}/${safeUploadFileName(lessonDraft.file.name)}`;
        const { error: uploadError } = await supabase.storage
          .from("learning")
          .upload(uploadedPath, lessonDraft.file, { contentType: type, upsert: false });
        if (uploadError) throw uploadError;
        filePath = uploadedPath;
        fileType = type;
      }

      const values = {
        course_id: courseId,
        section_title: lessonDraft.section_title.trim() || "Course lessons",
        title: lessonDraft.title.trim(),
        description: lessonDraft.description.trim() || null,
        notes: lessonDraft.notes.trim() || null,
        video_url: lessonDraft.video_url.trim() || null,
        file_path: filePath,
        file_type: fileType,
        duration_seconds: durationMinutes * 60,
        is_preview: lessonDraft.is_preview,
        published: lessonDraft.published,
        sort_order: sortOrder,
      };
      const request = editingLesson
        ? supabase.from("online_course_lessons").update(values).eq("id", lessonId)
        : supabase.from("online_course_lessons").insert({ ...values, id: lessonId });
      const { error } = await request;
      if (error) {
        if (uploadedPath) await supabase.storage.from("learning").remove([uploadedPath]);
        throw error;
      }
    },
    onSuccess: async () => {
      toast.success(editingLesson ? "Lesson updated" : "Lesson added");
      setEditingLesson(null);
      setLessonDraft(emptyLesson);
      await queryClient.invalidateQueries({ queryKey: ["admin", "lms-lessons", courseId] });
    },
    onError: (error) => toast.error("Could not save lesson", { description: error.message }),
  });

  const deleteLesson = useMutation({
    mutationFn: async (lesson: Lesson) => {
      const { data, error } = await supabase
        .from("online_course_lessons")
        .delete()
        .eq("id", lesson.id)
        .select("id")
        .maybeSingle();
      if (error) throw error;
      if (!data)
        throw new Error("The lesson was not deleted. Refresh the course list and try again.");

      if (lesson.file_path) {
        const { error: storageError } = await supabase.storage
          .from("learning")
          .remove([lesson.file_path]);
        return { storageCleanupError: storageError };
      }
      return { storageCleanupError: null };
    },
    onSuccess: async ({ storageCleanupError }, lesson) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["admin", "lms-lessons", lesson.course_id] }),
        queryClient.invalidateQueries({
          queryKey: ["public-online-course-lessons", lesson.course_id],
        }),
        queryClient.invalidateQueries({
          queryKey: ["student", "online-lessons", lesson.course_id],
        }),
      ]);
      if (storageCleanupError) {
        toast.error("Lesson deleted, but its uploaded file could not be removed", {
          description: storageCleanupError.message,
        });
        return;
      }
      toast.success("Lesson deleted");
    },
    onError: (error) => toast.error("Could not delete lesson", { description: error.message }),
  });

  function editLesson(lesson: Lesson) {
    setEditingLesson(lesson);
    setLessonDraft({
      title: lesson.title,
      section_title: lesson.section_title,
      description: lesson.description ?? "",
      notes: lesson.notes ?? "",
      video_url: lesson.video_url ?? "",
      duration_minutes: String(Math.ceil(lesson.duration_seconds / 60)),
      sort_order: String(lesson.sort_order),
      is_preview: lesson.is_preview,
      published: lesson.published,
      file: null,
    });
  }

  if (coursesQuery.error)
    return (
      <LmsError detail={coursesQuery.error.message} retry={() => void coursesQuery.refetch()} />
    );
  if (coursesQuery.isLoading) return <p role="status">Loading LMS courses…</p>;
  if (!coursesQuery.data?.length)
    return (
      <LmsEmpty
        title="No courses yet"
        detail="Create a course in Course Management first, then return here to add its online content."
      />
    );

  return (
    <div className="space-y-6">
      <section className="space-y-4 rounded-xl border bg-card p-5 shadow-card">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-semibold text-brand">Online course setup</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Set tuition, free previews, lecturer contact, syllabus, and separate examination and
              certificate fees.
            </p>
          </div>
          <label className="min-w-64 space-y-1.5 text-sm font-medium">
            Choose course
            <select
              className={controlClass}
              value={courseId}
              onChange={(event) => {
                setCourseId(event.target.value);
                setEditingLesson(null);
                setLessonDraft(emptyLesson);
              }}
            >
              <option value="">Select a course</option>
              {coursesQuery.data.map((course) => (
                <option key={course.id} value={course.id}>
                  {course.title}
                </option>
              ))}
            </select>
          </label>
        </div>
        {activeCourse && (
          <form
            key={activeCourse.id}
            action={(form) => saveCourse.mutate(form)}
            className="grid gap-4 sm:grid-cols-2"
          >
            <label className="space-y-1.5 text-sm font-medium">
              Tuition fee (KES)
              <Input
                name="fees"
                type="number"
                min="0"
                step="1"
                defaultValue={activeCourse.fees ?? 0}
              />
              <span className="text-xs font-normal text-muted-foreground">
                30% unlocks the first 30% of non-preview lesson time; the remaining tuition unlocks
                the rest.
              </span>
            </label>
            <label className="space-y-1.5 text-sm font-medium">
              Certificate fee (KES)
              <Input
                name="certificateFee"
                type="number"
                min="0"
                step="1"
                defaultValue={activeCourse.online_certificate_fee}
              />
            </label>
            <label className="space-y-1.5 text-sm font-medium">
              Examination fee (KES)
              <Input
                name="examFee"
                type="number"
                min="0"
                step="1"
                defaultValue={activeCourse.online_exam_fee}
              />
            </label>
            <label className="space-y-1.5 text-sm font-medium">
              Course duration
              <Input
                readOnly
                value={activeCourse.duration ?? "Set duration in Course Management"}
              />
            </label>
            <label className="space-y-1.5 text-sm font-medium">
              Lecturer name
              <Input
                name="lecturerName"
                defaultValue={activeCourse.online_lecturer_name ?? ""}
                maxLength={120}
              />
            </label>
            <label className="space-y-1.5 text-sm font-medium">
              Lecturer email
              <Input
                name="lecturerEmail"
                type="email"
                defaultValue={activeCourse.online_lecturer_email ?? ""}
                maxLength={255}
              />
            </label>
            <label className="space-y-1.5 text-sm font-medium">
              Lecturer phone
              <Input
                name="lecturerPhone"
                type="tel"
                defaultValue={activeCourse.online_lecturer_phone ?? ""}
                maxLength={20}
              />
            </label>
            <label className="space-y-1.5 text-sm font-medium sm:col-span-2">
              Intro video URL (free)
              <Input
                name="introVideo"
                type="url"
                defaultValue={activeCourse.online_intro_video_url ?? ""}
                placeholder="https://…"
              />
            </label>
            <label className="space-y-1.5 text-sm font-medium sm:col-span-2">
              Syllabus (free)
              <Textarea
                name="syllabus"
                rows={5}
                defaultValue={activeCourse.online_syllabus ?? ""}
                placeholder="Topics, learning outcomes, and assessment outline"
              />
            </label>
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <input
                name="availableOnline"
                type="checkbox"
                defaultChecked={activeCourse.available_online}
              />
              List this course in the public online catalogue
            </label>
            <Button
              type="submit"
              disabled={saveCourse.isPending}
              loading={saveCourse.isPending}
              className="sm:col-span-2"
            >
              {saveCourse.isPending ? "Saving…" : "Save online course"}
            </Button>
            {activeCourse.available_online && (
              <Button
                type="button"
                variant="outline"
                className="sm:col-span-2"
                disabled={removeOnlineCourse.isPending}
                onClick={() => {
                  if (
                    window.confirm(
                      `Remove ${activeCourse.title} from the public online catalogue? Existing student enrollments and lessons will be preserved.`,
                    )
                  )
                    removeOnlineCourse.mutate(activeCourse.id);
                }}
              >
                {removeOnlineCourse.isPending
                  ? "Removing from catalogue…"
                  : "Remove from public online catalogue"}
              </Button>
            )}
          </form>
        )}
      </section>

      {activeCourse && (
        <section className="grid gap-6 xl:grid-cols-2">
          <div className="space-y-4 rounded-xl border bg-card p-5 shadow-card">
            <div className="flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-primary" />
              <h2 className="font-semibold text-brand">Course outline and lessons</h2>
            </div>
            {lessonsQuery.error ? (
              <LmsError
                detail={lessonsQuery.error.message}
                retry={() => void lessonsQuery.refetch()}
              />
            ) : lessonsQuery.isLoading ? (
              <p role="status">Loading lessons…</p>
            ) : lessonsQuery.data?.length ? (
              <div className="divide-y">
                {lessonsQuery.data.map((lesson) => (
                  <article key={lesson.id} className="flex items-start justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <p className="font-medium">
                        {lesson.sort_order + 1}. {lesson.title}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {lesson.section_title} · {lesson.duration_seconds} sec
                      </p>
                      <div className="mt-1 flex gap-2">
                        <Badge variant={lesson.published ? "default" : "secondary"}>
                          {lesson.published ? "Published" : "Draft"}
                        </Badge>
                        {lesson.is_preview && <Badge variant="outline">Free preview</Badge>}
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        aria-label="Edit lesson"
                        onClick={() => editLesson(lesson)}
                      >
                        <Pencil />
                      </Button>
                      <Button
                        type="button"
                        variant="destructive"
                        size="icon"
                        aria-label="Delete lesson"
                        disabled={deleteLesson.isPending}
                        onClick={() => {
                          if (window.confirm(`Delete “${lesson.title}”?`))
                            deleteLesson.mutate(lesson);
                        }}
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <LmsEmpty
                title="No lessons added"
                detail="Add the syllabus outline and at least one free preview lesson."
              />
            )}
          </div>

          <form
            onSubmit={(event: FormEvent<HTMLFormElement>) => {
              event.preventDefault();
              saveLesson.mutate();
            }}
            className="space-y-4 rounded-xl border bg-card p-5 shadow-card"
          >
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-semibold text-brand">
                {editingLesson ? "Edit lesson" : "Add lesson"}
              </h2>
              {editingLesson && (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setEditingLesson(null);
                    setLessonDraft(emptyLesson);
                  }}
                >
                  Cancel
                </Button>
              )}
            </div>
            <Field label="Section / module">
              <Input
                value={lessonDraft.section_title}
                onChange={(event) =>
                  setLessonDraft({ ...lessonDraft, section_title: event.target.value })
                }
                maxLength={120}
              />
            </Field>
            <Field label="Lesson title">
              <Input
                required
                value={lessonDraft.title}
                onChange={(event) => setLessonDraft({ ...lessonDraft, title: event.target.value })}
                maxLength={160}
              />
            </Field>
            <Field label="Description">
              <Input
                value={lessonDraft.description}
                onChange={(event) =>
                  setLessonDraft({ ...lessonDraft, description: event.target.value })
                }
                maxLength={500}
              />
            </Field>
            <Field label="Lesson notes">
              <Textarea
                rows={5}
                value={lessonDraft.notes}
                onChange={(event) => setLessonDraft({ ...lessonDraft, notes: event.target.value })}
              />
            </Field>
            <Field label="Video URL (optional)">
              <Input
                type="url"
                value={lessonDraft.video_url}
                onChange={(event) =>
                  setLessonDraft({ ...lessonDraft, video_url: event.target.value })
                }
                placeholder="https://…"
              />
            </Field>
            <Field label="Upload video, PDF, or image (max 100 MB)">
              <Input
                type="file"
                accept="video/*,application/pdf,image/*"
                onChange={(event) =>
                  setLessonDraft({ ...lessonDraft, file: event.target.files?.[0] ?? null })
                }
              />
              {editingLesson?.file_path && !lessonDraft.file && (
                <span className="text-xs text-muted-foreground">An uploaded file is attached.</span>
              )}
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Video / lesson duration (minutes)">
                <Input
                  type="number"
                  min="0"
                  step="1"
                  value={lessonDraft.duration_minutes}
                  onChange={(event) =>
                    setLessonDraft({ ...lessonDraft, duration_minutes: event.target.value })
                  }
                />
              </Field>
              <Field label="Lesson order (starting at 0)">
                <Input
                  type="number"
                  min="0"
                  step="1"
                  value={lessonDraft.sort_order}
                  onChange={(event) =>
                    setLessonDraft({ ...lessonDraft, sort_order: event.target.value })
                  }
                />
              </Field>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={lessonDraft.is_preview}
                onChange={(event) =>
                  setLessonDraft({ ...lessonDraft, is_preview: event.target.checked })
                }
              />
              Free preview (available before payment)
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={lessonDraft.published}
                onChange={(event) =>
                  setLessonDraft({ ...lessonDraft, published: event.target.checked })
                }
              />
              Publish lesson and include it in the course outline
            </label>
            <Button type="submit" disabled={saveLesson.isPending} loading={saveLesson.isPending}>
              <Upload />{" "}
              {saveLesson.isPending ? "Saving…" : editingLesson ? "Save lesson" : "Add lesson"}
            </Button>
          </form>
        </section>
      )}
      {activeCourse && (
        <p className="text-sm text-muted-foreground">
          Current tuition: {formatKES(Number(activeCourse.fees ?? 0))} · learners see published
          courses and previews, then get full access only from confirmed PayHero payments.
        </p>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5 text-sm font-medium">
      {label}
      {children}
    </label>
  );
}

function LmsError({ detail, retry }: { detail: string; retry: () => void }) {
  return (
    <div className="rounded-lg border border-destructive/30 p-4">
      <p role="alert" className="text-sm text-destructive">
        {detail}
      </p>
      <Button className="mt-3" variant="outline" onClick={retry}>
        Retry
      </Button>
    </div>
  );
}

function LmsEmpty({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="rounded-lg border border-dashed p-5">
      <p className="font-medium">{title}</p>
      <p className="mt-1 text-sm text-muted-foreground">{detail}</p>
    </div>
  );
}

const controlClass = "h-10 w-full rounded-md border border-input bg-background px-3 text-sm";
