import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  BookOpen,
  CalendarDays,
  Layers3,
  LogOut,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { CourseLevelsManager } from "@/components/admin/CourseLevelsManager";
import { can, useRoles, useUser } from "@/lib/auth";
import type { Enums, Tables, TablesInsert, TablesUpdate } from "@/integrations/supabase/types";

type Course = Tables<"courses">;
type Intake = Tables<"intakes">;
type CourseDraft = Pick<
  Course,
  | "application_enabled"
  | "course_code"
  | "description"
  | "duration"
  | "featured"
  | "fees"
  | "image_url"
  | "published"
  | "requirements"
  | "school_id"
  | "study_mode"
  | "title"
>;
type IntakeDraft = Pick<
  Intake,
  "application_deadline" | "is_open" | "name" | "notes" | "start_date"
>;

const emptyCourse: CourseDraft = {
  application_enabled: true,
  course_code: "",
  description: "",
  duration: "",
  featured: false,
  fees: null,
  image_url: "",
  published: true,
  requirements: "",
  school_id: "",
  study_mode: "full_time",
  title: "",
};

const emptyIntake: IntakeDraft = {
  application_deadline: "",
  is_open: true,
  name: "",
  notes: "",
  start_date: "",
};

export function ManagementPanel() {
  const { user, loading: userLoading } = useUser();
  const rolesQuery = useRoles(user?.id);
  const roles = rolesQuery.data;
  const canManageCourses = can(roles, ["academic_admin"]);
  const canManageIntakes = can(roles, ["admissions_admin", "academic_admin"]);
  const [section, setSection] = useState<"courses" | "levels" | "intakes">("courses");

  useEffect(() => {
    if (!canManageCourses && canManageIntakes) setSection("intakes");
  }, [canManageCourses, canManageIntakes]);

  if (userLoading || (user && rolesQuery.isLoading)) {
    return <AdminMessage title="Checking your account…" />;
  }

  if (!user) return <AdminSignIn />;

  if (rolesQuery.error) {
    return (
      <AdminMessage
        title="Could not verify your admin access"
        detail={rolesQuery.error.message}
        retry={() => rolesQuery.refetch()}
      />
    );
  }

  if (!canManageCourses && !canManageIntakes) {
    return (
      <AdminMessage
        title="Admin access required"
        detail="Your account does not have permission to manage courses or intakes."
      />
    );
  }

  return (
    <div className="min-h-screen bg-muted/40">
      <header className="border-b bg-brand text-brand-foreground">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
              Profia Institute
            </p>
            <h1 className="mt-1 text-xl font-bold">Academic management</h1>
          </div>
          <div className="flex items-center gap-2">
            <Button asChild variant="heroOutline" size="sm">
              <a href="/">
                {" "}
                <ArrowLeft /> Public website
              </a>
            </Button>
            <Button
              variant="heroOutline"
              size="sm"
              onClick={async () => {
                const { error } = await supabase.auth.signOut();
                if (error) toast.error("Could not sign out", { description: error.message });
                else toast.success("Signed out");
              }}
            >
              <LogOut /> <span className="hidden sm:inline">Sign out</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <div className="grid gap-6 lg:grid-cols-[230px_minmax(0,1fr)]">
          <aside className="h-fit rounded-xl border bg-card p-3 shadow-card">
            <p className="px-3 pb-2 pt-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Management
            </p>
            {canManageCourses && (
              <NavButton
                active={section === "courses"}
                onClick={() => setSection("courses")}
                icon={<BookOpen />}
              >
                Courses
              </NavButton>
            )}
            {canManageCourses && (
              <NavButton
                active={section === "levels"}
                onClick={() => setSection("levels")}
                icon={<Layers3 />}
              >
                Course levels & units
              </NavButton>
            )}
            {canManageIntakes && (
              <NavButton
                active={section === "intakes"}
                onClick={() => setSection("intakes")}
                icon={<CalendarDays />}
              >
                Admissions & intakes
              </NavButton>
            )}
          </aside>
          {section === "courses" && canManageCourses ? (
            <CoursesManager />
          ) : section === "levels" && canManageCourses ? (
            <CourseLevelsManager />
          ) : (
            <IntakesManager />
          )}
        </div>
      </main>
    </div>
  );
}

function AdminSignIn() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    setSubmitting(false);
    if (signInError) {
      setError(signInError.message);
      return;
    }
    toast.success("Signed in");
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 px-4 py-10">
      <form
        onSubmit={submit}
        className="w-full max-w-md space-y-5 rounded-2xl border bg-card p-6 shadow-card sm:p-8"
      >
        <a href="/" className="text-sm font-medium text-primary hover:underline">
          ← Profia Institute website
        </a>
        <div>
          <p className="eyebrow">Secure staff access</p>
          <h1 className="mt-2 text-2xl font-bold text-brand">Admin sign in</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Sign in with your Supabase staff account. Access is granted by your assigned role.
          </p>
        </div>
        <Field label="Email">
          <Input
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </Field>
        <Field label="Password">
          <Input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </Field>
        {error && <ErrorBox message={error} />}
        <Button type="submit" className="w-full" disabled={submitting}>
          {submitting ? "Signing in…" : "Sign in"}
        </Button>
      </form>
    </div>
  );
}

function CoursesManager() {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<Course | null>(null);
  const [draft, setDraft] = useState<CourseDraft>(emptyCourse);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const schoolsQuery = useQuery({
    queryKey: ["admin", "schools"],
    queryFn: async () => {
      const { data, error } = await supabase.from("schools").select("id,name").order("name");
      if (error) throw error;
      return data;
    },
  });
  const coursesQuery = useQuery({
    queryKey: ["admin", "courses"],
    queryFn: async () => {
      const { data, error } = await supabase.from("courses").select("*").order("title");
      if (error) throw error;
      return data;
    },
  });
  const saveCourse = useMutation({
    mutationFn: async (input: {
      id?: string;
      values: TablesInsert<"courses"> | TablesUpdate<"courses">;
      imageFile?: File | null;
    }) => {
      let uploadedPath: string | null = null;
      let values = input.values;
      if (input.imageFile) {
        if (
          !["image/jpeg", "image/png", "image/webp", "image/gif"].includes(input.imageFile.type) ||
          input.imageFile.size > 100 * 1024 * 1024
        ) {
          throw new Error("Choose a JPG, PNG, GIF, or WebP image up to 100 MB.");
        }
        const safeName = input.imageFile.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        uploadedPath = `courses/${crypto.randomUUID()}/${crypto.randomUUID()}-${safeName}`;
        const { error: uploadError } = await supabase.storage
          .from("media")
          .upload(uploadedPath, input.imageFile, {
            contentType: input.imageFile.type,
            upsert: false,
          });
        if (uploadError) throw uploadError;
        values = {
          ...input.values,
          image_url: supabase.storage.from("media").getPublicUrl(uploadedPath).data.publicUrl,
        };
      }
      const request = input.id
        ? supabase.from("courses").update(values).eq("id", input.id).select("id,image_url").single()
        : supabase
            .from("courses")
            .insert(values as TablesInsert<"courses">)
            .select("id,image_url")
            .single();
      const { data, error } = await request;
      if (error) {
        if (uploadedPath) {
          const { error: cleanupError } = await supabase.storage
            .from("media")
            .remove([uploadedPath]);
          if (cleanupError) {
            throw new Error(
              `${error.message}. The unused uploaded image could not be removed: ${cleanupError.message}`,
            );
          }
        }
        throw error;
      }
      if (uploadedPath && data.image_url) {
        const previousPath = data.image_url.split("/storage/v1/object/public/media/")[1];
        if (previousPath?.startsWith("courses/")) {
          const { error: removeError } = await supabase.storage
            .from("media")
            .remove([decodeURIComponent(previousPath)]);
          if (removeError) {
            toast.error("Old course image could not be removed", {
              description: removeError.message,
            });
          }
        }
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["admin", "courses"] });
      await queryClient.invalidateQueries({ queryKey: ["courses"] });
      await queryClient.invalidateQueries({ queryKey: ["admin", "course-levels"] });
      toast.success(editing ? "Course updated" : "Course added");
      setEditing(null);
      setDraft(emptyCourse);
      setImageFile(null);
    },
    onError: (error) => {
      void queryClient.invalidateQueries({ queryKey: ["admin", "courses"] });
      toast.error("Could not save course", { description: error.message });
    },
  });
  const archiveCourse = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase
        .from("courses")
        .update({ application_enabled: false, available_online: false, published: false })
        .eq("id", id)
        .select("id")
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("The course was not archived. Refresh the list and try again.");
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["admin", "courses"] }),
        queryClient.invalidateQueries({ queryKey: ["admin", "lms-courses"] }),
        queryClient.invalidateQueries({ queryKey: ["courses"] }),
        queryClient.invalidateQueries({ queryKey: ["public-online-courses"] }),
        queryClient.invalidateQueries({ queryKey: ["admin", "students"] }),
        queryClient.invalidateQueries({ queryKey: ["admin", "student-course-enrollments"] }),
      ]);
      toast.success("Course archived", {
        description:
          "It is hidden from public catalogues while existing student records are preserved.",
      });
    },
    onError: (error) => toast.error("Could not archive course", { description: error.message }),
  });

  function editCourse(course: Course) {
    setEditing(course);
    setImageFile(null);
    setDraft({
      application_enabled: course.application_enabled,
      course_code: course.course_code ?? "",
      description: course.description ?? "",
      duration: course.duration ?? "",
      featured: course.featured,
      fees: course.fees,
      image_url: course.image_url ?? "",
      published: course.published,
      requirements: course.requirements ?? "",
      school_id: course.school_id,
      study_mode: course.study_mode,
      title: course.title,
    });
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      imageFile &&
      (!["image/jpeg", "image/png", "image/webp", "image/gif"].includes(imageFile.type) ||
        imageFile.size > 100 * 1024 * 1024)
    ) {
      toast.error("Choose a JPG, PNG, GIF, or WebP image up to 100 MB.");
      return;
    }
    if (!draft.school_id) {
      toast.error("Choose a school before saving this course.");
      return;
    }
    const slug = draft.title
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    if (!slug) {
      toast.error("Enter a course name.");
      return;
    }
    const values = {
      ...draft,
      course_code: draft.course_code?.trim().toUpperCase() || null,
      description: draft.description?.trim() || null,
      duration: draft.duration?.trim() || null,
      fees: draft.fees === null || Number.isNaN(Number(draft.fees)) ? null : Number(draft.fees),
      image_url: draft.image_url?.trim() || null,
      requirements: draft.requirements?.trim() || null,
      available_online: draft.study_mode === "online",
      slug,
      summary: draft.description?.trim() || null,
    };
    saveCourse.mutate(editing ? { id: editing.id, values, imageFile } : { values, imageFile });
  }

  if (coursesQuery.error || schoolsQuery.error) {
    return (
      <AdminMessage
        title="Could not load course management"
        detail={(coursesQuery.error ?? schoolsQuery.error)?.message ?? "Please try again."}
        retry={() => {
          void coursesQuery.refetch();
          void schoolsQuery.refetch();
        }}
      />
    );
  }

  return (
    <section className="space-y-6">
      <SectionHeading
        eyebrow="Academic catalogue"
        title="Course management"
        description="Manage course details and control which programmes are visible and accepting applications."
        count={coursesQuery.data?.length ?? 0}
      />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.85fr)]">
        <div className="space-y-3">
          {coursesQuery.isLoading ? (
            <LoadingCard />
          ) : coursesQuery.data?.length ? (
            coursesQuery.data.map((course) => (
              <article
                key={course.id}
                className="flex flex-col gap-4 rounded-xl border bg-card p-4 shadow-card sm:flex-row sm:items-center"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold text-brand">{course.title}</h3>
                    <Badge variant={course.published ? "default" : "secondary"}>
                      {course.published ? "Active" : "Inactive"}
                    </Badge>
                    {course.featured && <Badge variant="outline">Featured</Badge>}
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {schoolsQuery.data?.find((school) => school.id === course.school_id)?.name ??
                      "Unknown school"}
                    {course.course_code ? ` · ${course.course_code}` : ""}
                    {course.study_mode ? ` · ${course.study_mode.replace("_", " ")}` : ""}
                  </p>
                  <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">
                    {course.description || "No description added."}
                  </p>
                  {!course.application_enabled && (
                    <p className="mt-2 text-xs font-medium text-warning">Applications disabled</p>
                  )}
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => editCourse(course)}
                  >
                    <Pencil /> Edit
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={archiveCourse.isPending}
                    onClick={() => {
                      if (
                        window.confirm(
                          `Archive ${course.title}? It will be hidden from public course lists, while existing student records are preserved.`,
                        )
                      )
                        archiveCourse.mutate(course.id);
                    }}
                  >
                    Archive
                  </Button>
                </div>
              </article>
            ))
          ) : (
            <EmptyCard title="No courses yet" detail="Add your first course using the form." />
          )}
        </div>
        <form
          onSubmit={submit}
          className="h-fit space-y-4 rounded-xl border bg-card p-5 shadow-card"
        >
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-semibold text-brand">{editing ? "Edit course" : "Add a course"}</h2>
            {editing && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => {
                  setEditing(null);
                  setDraft(emptyCourse);
                  setImageFile(null);
                }}
              >
                <X /> Cancel
              </Button>
            )}
          </div>
          <Field label="Course name">
            <Input
              required
              value={draft.title}
              onChange={(event) => setDraft({ ...draft, title: event.target.value })}
            />
          </Field>
          <Field label="School">
            <select
              required
              className={controlClass}
              value={draft.school_id}
              onChange={(event) => setDraft({ ...draft, school_id: event.target.value })}
            >
              <option value="">Select a school</option>
              {schoolsQuery.data?.map((school) => (
                <option key={school.id} value={school.id}>
                  {school.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Description">
            <Textarea
              rows={3}
              value={draft.description ?? ""}
              onChange={(event) => setDraft({ ...draft, description: event.target.value })}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Course code">
              <Input
                required
                value={draft.course_code ?? ""}
                onChange={(event) => setDraft({ ...draft, course_code: event.target.value })}
              />
            </Field>
            <Field label="Duration">
              <Input
                value={draft.duration ?? ""}
                onChange={(event) => setDraft({ ...draft, duration: event.target.value })}
                placeholder="e.g. 2 years"
              />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Fees (KES)">
              <Input
                type="number"
                min="0"
                step="0.01"
                value={draft.fees ?? ""}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    fees: event.target.value === "" ? null : Number(event.target.value),
                  })
                }
              />
            </Field>
            <Field label="Study mode">
              <select
                className={controlClass}
                value={draft.study_mode}
                onChange={(event) =>
                  setDraft({ ...draft, study_mode: event.target.value as Enums<"study_mode"> })
                }
              >
                <option value="full_time">Full time</option>
                <option value="part_time">Part time</option>
                <option value="online">Online</option>
              </select>
            </Field>
          </div>
          <Field label="Requirements">
            <Textarea
              rows={2}
              value={draft.requirements ?? ""}
              onChange={(event) => setDraft({ ...draft, requirements: event.target.value })}
            />
          </Field>
          <Field label="Course image URL (optional)">
            <Input
              type="url"
              value={draft.image_url ?? ""}
              onChange={(event) => setDraft({ ...draft, image_url: event.target.value })}
              placeholder="https://…"
            />
          </Field>
          <Field label="Or upload a local image">
            <Input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              onChange={(event) => setImageFile(event.target.files?.[0] ?? null)}
            />
            <span className="text-xs text-muted-foreground">
              JPG, PNG, GIF, or WebP · up to 100 MB{imageFile ? ` · ${imageFile.name}` : ""}
            </span>
          </Field>
          <div className="space-y-2 rounded-lg bg-muted/50 p-3">
            <CheckField
              label="Active — visible on the public website"
              checked={draft.published}
              onChange={(published) => setDraft({ ...draft, published })}
            />
            <CheckField
              label="Featured course"
              checked={draft.featured}
              onChange={(featured) => setDraft({ ...draft, featured })}
            />
            <CheckField
              label="Applications enabled"
              checked={draft.application_enabled}
              onChange={(application_enabled) => setDraft({ ...draft, application_enabled })}
            />
          </div>
          <Button
            className="w-full"
            type="submit"
            disabled={saveCourse.isPending || schoolsQuery.isLoading || !schoolsQuery.data?.length}
          >
            <Save /> {saveCourse.isPending ? "Saving…" : editing ? "Save changes" : "Add course"}
          </Button>
          {!schoolsQuery.isLoading && !schoolsQuery.data?.length && (
            <p className="text-sm text-destructive">Create a school before adding courses.</p>
          )}
        </form>
      </div>
    </section>
  );
}

function IntakesManager() {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<Intake | null>(null);
  const [draft, setDraft] = useState<IntakeDraft>(emptyIntake);
  const intakesQuery = useQuery({
    queryKey: ["admin", "intakes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("intakes")
        .select("*")
        .order("start_date", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return data;
    },
  });
  const saveIntake = useMutation({
    mutationFn: async (input: {
      id?: string;
      values: TablesInsert<"intakes"> | TablesUpdate<"intakes">;
    }) => {
      const request = input.id
        ? supabase.from("intakes").update(input.values).eq("id", input.id).select("id").single()
        : supabase
            .from("intakes")
            .insert(input.values as TablesInsert<"intakes">)
            .select("id")
            .single();
      const { error } = await request;
      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["admin", "intakes"] });
      await queryClient.invalidateQueries({ queryKey: ["active-intake"] });
      toast.success("Intake saved");
      setEditing(null);
      setDraft(emptyIntake);
    },
    onError: (error) => toast.error("Could not save intake", { description: error.message }),
  });
  const deleteIntake = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("intakes").delete().eq("id", id).select("id").single();
      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["admin", "intakes"] });
      await queryClient.invalidateQueries({ queryKey: ["active-intake"] });
      toast.success("Intake deleted");
    },
    onError: (error) => toast.error("Could not delete intake", { description: error.message }),
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values: TablesInsert<"intakes"> = {
      ...draft,
      application_deadline: draft.application_deadline || null,
      name: draft.name.trim(),
      notes: draft.notes?.trim() || null,
      start_date: draft.start_date || null,
    };
    saveIntake.mutate(editing ? { id: editing.id, values } : { values });
  }

  if (intakesQuery.error) {
    return (
      <AdminMessage
        title="Could not load intake management"
        detail={intakesQuery.error.message}
        retry={() => intakesQuery.refetch()}
      />
    );
  }

  return (
    <section className="space-y-6">
      <SectionHeading
        eyebrow="Admissions"
        title="Intake management"
        description="Set application dates and control which open intake is shown to prospective students."
        count={intakesQuery.data?.length ?? 0}
      />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.85fr)]">
        <div className="space-y-3">
          {intakesQuery.isLoading ? (
            <LoadingCard />
          ) : intakesQuery.data?.length ? (
            intakesQuery.data.map((intake) => (
              <article key={intake.id} className="rounded-xl border bg-card p-4 shadow-card">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold text-brand">{intake.name}</h3>
                      <Badge variant={intake.is_open ? "default" : "secondary"}>
                        {intake.is_open ? "Active" : "Inactive"}
                      </Badge>
                    </div>
                    <p className="mt-2 text-sm text-muted-foreground">
                      Starts {formatDate(intake.start_date)} · Applications close{" "}
                      {formatDate(intake.application_deadline)}
                    </p>
                    {intake.notes && (
                      <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">
                        {intake.notes}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setEditing(intake);
                        setDraft({
                          application_deadline: intake.application_deadline ?? "",
                          is_open: intake.is_open,
                          name: intake.name,
                          notes: intake.notes ?? "",
                          start_date: intake.start_date ?? "",
                        });
                      }}
                    >
                      <Pencil /> Edit
                    </Button>
                    <Button
                      type="button"
                      variant={intake.is_open ? "secondary" : "outline"}
                      size="sm"
                      disabled={saveIntake.isPending}
                      onClick={() => {
                        saveIntake.mutate({ id: intake.id, values: { is_open: !intake.is_open } });
                      }}
                    >
                      {intake.is_open ? "Deactivate" : "Activate"}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={deleteIntake.isPending}
                      onClick={() => {
                        if (
                          window.confirm(
                            `Delete the ${intake.name} intake? This action cannot be undone.`,
                          )
                        )
                          deleteIntake.mutate(intake.id);
                      }}
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              </article>
            ))
          ) : (
            <EmptyCard
              title="No intakes yet"
              detail="Add an intake to show admissions information on the public website."
            />
          )}
        </div>
        <form
          onSubmit={submit}
          className="h-fit space-y-4 rounded-xl border bg-card p-5 shadow-card"
        >
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-semibold text-brand">
              {editing ? "Edit intake" : "Add an intake"}
            </h2>
            {editing && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => {
                  setEditing(null);
                  setDraft(emptyIntake);
                }}
              >
                <X /> Cancel
              </Button>
            )}
          </div>
          <Field label="Intake name">
            <Input
              required
              value={draft.name}
              onChange={(event) => setDraft({ ...draft, name: event.target.value })}
              placeholder="e.g. September 2026"
            />
          </Field>
          <Field label="Start date">
            <Input
              required
              type="date"
              value={draft.start_date ?? ""}
              onChange={(event) => setDraft({ ...draft, start_date: event.target.value })}
            />
          </Field>
          <Field label="Application deadline">
            <Input
              required
              type="date"
              value={draft.application_deadline ?? ""}
              onChange={(event) => setDraft({ ...draft, application_deadline: event.target.value })}
            />
          </Field>
          <Field label="Description">
            <Textarea
              rows={4}
              value={draft.notes ?? ""}
              onChange={(event) => setDraft({ ...draft, notes: event.target.value })}
            />
          </Field>
          <CheckField
            label="Active — show this intake on the public website"
            checked={draft.is_open}
            onChange={(is_open) => setDraft({ ...draft, is_open })}
          />
          <Button className="w-full" type="submit" disabled={saveIntake.isPending}>
            <Save /> {saveIntake.isPending ? "Saving…" : editing ? "Save changes" : "Add intake"}
          </Button>
        </form>
      </div>
    </section>
  );
}

const controlClass =
  "flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-1.5 text-sm font-medium">
      {label}
      {children}
    </label>
  );
}

function CheckField({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm">
      <input
        type="checkbox"
        className="h-4 w-4 accent-primary"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      {label}
    </label>
  );
}

function NavButton({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition ${active ? "bg-brand text-brand-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
    >
      {icon}
      {children}
    </button>
  );
}

function SectionHeading({
  eyebrow,
  title,
  description,
  count,
}: {
  eyebrow: string;
  title: string;
  description: string;
  count: number;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h2 className="mt-1 text-2xl font-bold text-brand">{title}</h2>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{description}</p>
      </div>
      <Badge variant="outline">
        {count} {count === 1 ? "record" : "records"}
      </Badge>
    </div>
  );
}

function AdminMessage({
  title,
  detail,
  retry,
}: {
  title: string;
  detail?: string;
  retry?: () => void;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/40 px-4 py-10">
      <div className="w-full max-w-lg space-y-4 rounded-xl border bg-card p-6 shadow-card">
        <h1 className="text-xl font-bold text-brand">{title}</h1>
        {detail && <ErrorBox message={detail} />}
        {retry && (
          <Button variant="outline" onClick={retry}>
            <RefreshCw /> Retry
          </Button>
        )}
      </div>
    </main>
  );
}

function ErrorBox({ message }: { message: string }) {
  return (
    <p
      role="alert"
      className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
    >
      {message}
    </p>
  );
}

function LoadingCard() {
  return (
    <div className="animate-pulse rounded-xl border bg-card p-6 text-sm text-muted-foreground">
      Loading records…
    </div>
  );
}

function EmptyCard({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="rounded-xl border border-dashed bg-card p-8 text-center">
      <Plus className="mx-auto h-6 w-6 text-primary" />
      <h3 className="mt-3 font-semibold text-brand">{title}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{detail}</p>
    </div>
  );
}

function formatDate(value: string | null) {
  return value
    ? new Date(`${value}T00:00:00`).toLocaleDateString("en-KE", { dateStyle: "medium" })
    : "Not set";
}
