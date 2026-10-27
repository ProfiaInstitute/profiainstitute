import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpen, Eye, EyeOff, FileText, LogOut, Plus, Video } from "lucide-react";
import { toast } from "sonner";
import { PasswordResetPage } from "@/components/auth/PasswordResetPage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useRoles, useUser } from "@/lib/auth";
import {
  contentKind,
  MAX_CONTENT_UPLOAD_SIZE,
  safeUploadFileName,
  supportedContentType,
} from "@/lib/file-uploads";

type Permission = {
  active: boolean;
  can_manage_assignments: boolean;
  can_manage_cats: boolean;
  can_manage_materials: boolean;
  can_manage_results: boolean;
};

type FacilitatorUnit = {
  id: string;
  unit_id: string;
  active: boolean;
  can_manage_assignments: boolean;
  can_manage_cats: boolean;
  can_manage_materials: boolean;
  can_manage_results: boolean;
  unit: {
    id: string;
    course_id: string;
    title: string;
    level_id: string | null;
    semester: string | null;
  };
  course: { id: string; title: string };
};

const initialQuestion = () => ({
  prompt: "",
  option_a: "",
  option_b: "",
  option_c: "",
  option_d: "",
  correct_option: "A",
  points: 1,
});

export function FacilitatorPortal() {
  const { user, loading, error: sessionError } = useUser();
  const rolesQuery = useRoles(user?.id);
  const [resetMode, setResetMode] = useState(
    () =>
      typeof window !== "undefined" &&
      ["1"].includes(new URLSearchParams(window.location.search).get("resetPassword") ?? ""),
  );
  const [setupMode, setSetupMode] = useState(
    () =>
      typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).get("setupPassword") === "1",
  );
  if (resetMode || setupMode) {
    return (
      <PasswordResetPage
        destination="/facilitator"
        onComplete={() => {
          window.history.replaceState({}, "", "/facilitator");
          setResetMode(false);
          setSetupMode(false);
        }}
      />
    );
  }
  if (loading || (user && rolesQuery.isLoading))
    return <PortalMessage>Loading facilitator portal…</PortalMessage>;
  if (sessionError)
    return <PortalMessage error={sessionError.message} retry={() => window.location.reload()} />;
  if (!user) return <FacilitatorSignIn />;
  if (rolesQuery.error)
    return (
      <PortalMessage error={rolesQuery.error.message} retry={() => void rolesQuery.refetch()} />
    );
  if (!rolesQuery.data?.includes("facilitator"))
    return (
      <PortalMessage error="Facilitator access is not assigned to this account. Contact the Institute administrator." />
    );
  return <FacilitatorWorkspace userId={user.id} email={user.email ?? ""} />;
}

function FacilitatorSignIn() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [forgotBusy, setForgotBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });
    setBusy(false);
    if (signInError) setError(signInError.message);
    else toast.success("Signed in to the facilitator portal");
  }

  async function recoverPassword() {
    if (!email.trim()) {
      setError("Enter your email address first.");
      return;
    }
    setForgotBusy(true);
    setError("");
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(
      email.trim().toLowerCase(),
      { redirectTo: `${window.location.origin}/facilitator?resetPassword=1` },
    );
    setForgotBusy(false);
    if (resetError) setError(resetError.message);
    else
      toast.success("Password reset email sent", {
        description: "Check your inbox for the reset link.",
      });
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/40 px-4 py-10">
      <form
        onSubmit={submit}
        className="w-full max-w-md space-y-5 rounded-2xl border bg-card p-7 shadow-card"
      >
        <p className="eyebrow">Profia Institute · Teaching staff</p>
        <div>
          <h1 className="text-2xl font-bold text-brand">Facilitator sign in</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Sign in to view your assigned units, students, and enabled teaching tools.
          </p>
        </div>
        <label className="grid gap-1.5 text-sm font-medium">
          Email
          <Input
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>
        <label className="grid gap-1.5 text-sm font-medium">
          Password
          <span className="relative">
            <Input
              type={visible ? "text" : "password"}
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="pr-11"
            />
            <button
              type="button"
              className="absolute inset-y-0 right-0 grid w-11 place-items-center"
              aria-label={visible ? "Hide password" : "Show password"}
              onClick={() => setVisible(!visible)}
            >
              {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </span>
        </label>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <button
          type="button"
          className="text-sm font-semibold text-primary underline"
          disabled={forgotBusy}
          onClick={() => void recoverPassword()}
        >
          {forgotBusy ? "Sending reset link…" : "Forgot password?"}
        </button>
        <Button className="w-full" disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </Button>
      </form>
    </main>
  );
}

function FacilitatorWorkspace({ userId, email }: { userId: string; email: string }) {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState("");
  const [studentId, setStudentId] = useState("");
  const unitsQuery = useQuery({
    queryKey: ["facilitator", "units", userId],
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data: assignments, error } = await supabase
        .from("facilitator_unit_assignments")
        .select(
          "id,unit_id,active,can_manage_materials,can_manage_assignments,can_manage_cats,can_manage_results",
        )
        .eq("facilitator_id", userId)
        .eq("active", true);
      if (error) throw error;
      const unitIds = [...new Set(assignments.map((item) => item.unit_id))];
      if (!unitIds.length) return [];
      const { data: units, error: unitError } = await supabase
        .from("course_units")
        .select("id,course_id,title,level_id,semester")
        .in("id", unitIds);
      if (unitError) throw unitError;
      const courseIds = [...new Set(units.map((unit) => unit.course_id))];
      const { data: courses, error: courseError } = await supabase
        .from("courses")
        .select("id,title")
        .in("id", courseIds);
      if (courseError) throw courseError;
      const courseById = new Map(courses.map((course) => [course.id, course]));
      const unitById = new Map(units.map((unit) => [unit.id, unit]));
      return assignments.flatMap((assignment) => {
        const unit = unitById.get(assignment.unit_id);
        const course = unit ? courseById.get(unit.course_id) : undefined;
        return unit && course ? [{ ...assignment, unit, course }] : [];
      }) as FacilitatorUnit[];
    },
  });
  const activeUnit =
    unitsQuery.data?.find((unit) => unit.id === selectedId) ?? unitsQuery.data?.[0];
  const studentsQuery = useQuery({
    queryKey: ["facilitator", "students", activeUnit?.unit_id],
    enabled: Boolean(activeUnit),
    queryFn: async () => {
      if (!activeUnit) return [];
      let request = supabase
        .from("students")
        .select("id,student_number,first_name,last_name,email,phone,status,level_id")
        .eq("course_id", activeUnit.unit.course_id)
        .eq("status", "active")
        .order("last_name");
      if (activeUnit.unit.level_id) request = request.eq("level_id", activeUnit.unit.level_id);
      const { data, error } = await request;
      if (error) throw error;
      return data;
    },
  });
  const assignmentsQuery = useQuery({
    queryKey: ["facilitator", "assignments", activeUnit?.unit_id],
    enabled: Boolean(activeUnit?.can_manage_assignments),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("assignments")
        .select("id,title,instructions,due_date,published,created_at")
        .eq("unit_id", activeUnit!.unit_id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
  const materialsQuery = useQuery({
    queryKey: ["facilitator", "materials", activeUnit?.unit_id],
    enabled: Boolean(activeUnit?.can_manage_materials),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("learning_materials")
        .select("id,title,description,material_type,file_path,external_url,created_at")
        .eq("unit_id", activeUnit!.unit_id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
  const resultQuery = useQuery({
    queryKey: ["facilitator", "results", activeUnit?.unit_id],
    enabled: Boolean(activeUnit?.can_manage_results),
    queryFn: async () => {
      const studentIds = studentsQuery.data?.map((student) => student.id) ?? [];
      if (!studentIds.length) return [];
      const { data, error } = await supabase
        .from("results")
        .select("id,student_id,unit_name,score,grade,published,academic_year,created_at")
        .eq("unit_id", activeUnit!.unit_id)
        .in("student_id", studentIds)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
  const [assignmentDraft, setAssignmentDraft] = useState({
    title: "",
    instructions: "",
    dueDate: "",
  });
  const [materialDraft, setMaterialDraft] = useState({
    title: "",
    description: "",
    videoUrl: "",
    file: null as File | null,
  });
  const [resultDraft, setResultDraft] = useState({
    studentId: "",
    score: "",
    grade: "",
    academicYear: "",
  });
  const [catDraft, setCatDraft] = useState({
    title: "",
    instructions: "",
    duration: "30",
    opensAt: "",
    closesAt: "",
  });
  const [questions, setQuestions] = useState([initialQuestion()]);
  const [busy, setBusy] = useState(false);

  async function createAssignment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activeUnit) return;
    setBusy(true);
    const { error } = await supabase.from("assignments").insert({
      course_id: activeUnit.unit.course_id,
      unit_id: activeUnit.unit_id,
      title: assignmentDraft.title.trim(),
      instructions: assignmentDraft.instructions.trim() || null,
      due_date: assignmentDraft.dueDate ? new Date(assignmentDraft.dueDate).toISOString() : null,
      published: true,
      created_by: userId,
    });
    setBusy(false);
    if (error) {
      toast.error("Could not create assignment", { description: error.message });
      return;
    }
    toast.success("Assignment published to the class");
    setAssignmentDraft({ title: "", instructions: "", dueDate: "" });
    await queryClient.invalidateQueries({
      queryKey: ["facilitator", "assignments", activeUnit.unit_id],
    });
  }

  async function createMaterial(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activeUnit) return;
    if (!materialDraft.file && !materialDraft.videoUrl.trim()) {
      toast.error("Choose a file or enter a video/resource link.");
      return;
    }
    const contentType = materialDraft.file ? supportedContentType(materialDraft.file) : null;
    if (materialDraft.file && (!contentType || materialDraft.file.size > MAX_CONTENT_UPLOAD_SIZE)) {
      toast.error(
        !contentType ? "Choose a supported learning file." : "Files must be 100 MB or smaller.",
      );
      return;
    }
    setBusy(true);
    let filePath: string | null = null;
    if (materialDraft.file && contentType) {
      filePath = `${activeUnit.unit.course_id}/${activeUnit.unit_id}/${crypto.randomUUID()}-${safeUploadFileName(materialDraft.file.name)}`;
      const { error: uploadError } = await supabase.storage
        .from("learning")
        .upload(filePath, materialDraft.file, { contentType, upsert: false });
      if (uploadError) {
        setBusy(false);
        toast.error("Could not upload learning material", { description: uploadError.message });
        return;
      }
    }
    const { error } = await supabase.from("learning_materials").insert({
      course_id: activeUnit.unit.course_id,
      unit_id: activeUnit.unit_id,
      title: materialDraft.title.trim(),
      description: materialDraft.description.trim() || null,
      material_type: materialDraft.file
        ? contentKind(contentType!)
        : materialDraft.videoUrl.trim()
          ? "video"
          : "link",
      file_path: filePath,
      external_url: materialDraft.videoUrl.trim() || null,
      published: true,
      uploaded_by: userId,
    });
    setBusy(false);
    if (error) {
      if (filePath) {
        const { error: cleanupError } = await supabase.storage.from("learning").remove([filePath]);
        if (cleanupError)
          toast.error("Could not remove the failed upload", { description: cleanupError.message });
      }
      toast.error("Could not save learning material", { description: error.message });
      return;
    }
    toast.success("Learning material published");
    setMaterialDraft({ title: "", description: "", videoUrl: "", file: null });
    await queryClient.invalidateQueries({
      queryKey: ["facilitator", "materials", activeUnit.unit_id],
    });
  }

  async function createResult(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activeUnit) return;
    const score = Number(resultDraft.score);
    if (!resultDraft.studentId || !Number.isFinite(score) || score < 0 || score > 100) {
      toast.error("Select a student and enter a score from 0 to 100.");
      return;
    }
    setBusy(true);
    const { error } = await supabase.from("results").insert({
      student_id: resultDraft.studentId,
      unit_id: activeUnit.unit_id,
      unit_name: activeUnit.unit.title,
      score,
      grade: resultDraft.grade.trim() || null,
      semester: activeUnit.unit.semester,
      academic_year: resultDraft.academicYear.trim() || null,
      published: true,
    });
    setBusy(false);
    if (error) {
      toast.error("Could not publish result", { description: error.message });
      return;
    }
    toast.success("Result published to the student portal");
    setResultDraft({ studentId: "", score: "", grade: "", academicYear: "" });
    await queryClient.invalidateQueries({
      queryKey: ["facilitator", "results", activeUnit.unit_id],
    });
  }

  async function createCat(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activeUnit) return;
    const opensAt = new Date(catDraft.opensAt);
    const closesAt = new Date(catDraft.closesAt);
    if (
      Number.isNaN(opensAt.getTime()) ||
      Number.isNaN(closesAt.getTime()) ||
      closesAt <= opensAt
    ) {
      toast.error("Choose valid CAT opening and closing times.");
      return;
    }
    if (
      questions.some(
        (question) =>
          !question.prompt.trim() ||
          !question.option_a.trim() ||
          !question.option_b.trim() ||
          !question.option_c.trim() ||
          !question.option_d.trim(),
      )
    ) {
      toast.error("Complete each question and all four answer options.");
      return;
    }
    setBusy(true);
    const { error } = await supabase.rpc("create_facilitator_cat", {
      _unit_id: activeUnit.unit_id,
      _title: catDraft.title.trim(),
      _instructions: catDraft.instructions.trim() || null,
      _duration_minutes: Number(catDraft.duration),
      _opens_at: opensAt.toISOString(),
      _closes_at: closesAt.toISOString(),
      _questions: questions,
    });
    setBusy(false);
    if (error) {
      toast.error("Could not create CAT", { description: error.message });
      return;
    }
    toast.success("CAT scheduled for the assigned unit");
    setCatDraft({ title: "", instructions: "", duration: "30", opensAt: "", closesAt: "" });
    setQuestions([initialQuestion()]);
  }

  async function signOut() {
    const { error } = await supabase.auth.signOut();
    if (error) toast.error("Could not sign out", { description: error.message });
  }

  if (unitsQuery.isLoading) return <PortalMessage>Loading assigned course units…</PortalMessage>;
  if (unitsQuery.error)
    return (
      <PortalMessage error={unitsQuery.error.message} retry={() => void unitsQuery.refetch()} />
    );
  if (!unitsQuery.data?.length) {
    return (
      <PortalMessage>
        <div className="space-y-3">
          <p>No active teaching units are assigned to your account yet.</p>
          <p className="text-sm text-muted-foreground">
            Contact the academic administration to be assigned to a course unit.
          </p>
          <Button variant="outline" onClick={() => void signOut()}>
            <LogOut className="mr-2 h-4 w-4" />
            Sign out
          </Button>
        </div>
      </PortalMessage>
    );
  }
  if (!activeUnit)
    return <PortalMessage error="The assigned course unit is no longer available." />;
  const permissions: Permission = activeUnit!;
  const studentById = new Map((studentsQuery.data ?? []).map((student) => [student.id, student]));
  return (
    <div className="min-h-screen bg-muted/40">
      <header className="sticky top-0 z-30 flex flex-wrap items-center justify-between gap-3 border-b bg-background px-4 py-3 shadow-sm sm:px-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-primary">
            Profia Institute
          </p>
          <h1 className="font-bold text-brand">Facilitator portal</h1>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span className="hidden text-muted-foreground sm:inline">{email}</span>
          <Button size="sm" variant="outline" onClick={() => void signOut()}>
            <LogOut className="mr-2 h-4 w-4" />
            Sign out
          </Button>
        </div>
      </header>
      <main className="mx-auto max-w-7xl space-y-5 px-4 py-6 sm:px-6">
        <label className="grid max-w-xl gap-1.5 text-sm font-medium">
          Assigned teaching unit
          <select
            className="h-10 rounded-md border bg-background px-3"
            value={activeUnit.id}
            onChange={(event) => {
              setSelectedId(event.target.value);
              setStudentId("");
            }}
          >
            {unitsQuery.data.map((unit) => (
              <option key={unit.id} value={unit.id}>
                {unit.course.title} · {unit.unit.title}
              </option>
            ))}
          </select>
        </label>
        <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="space-y-5">
            <section className="rounded-xl border bg-card p-5 shadow-card">
              <div className="flex flex-wrap justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-brand">
                    {activeUnit.course.title} · {activeUnit.unit.title}
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {studentsQuery.data?.length ?? 0} enrolled student(s) in this unit’s course
                    level
                  </p>
                </div>
                <BookOpen className="h-5 w-5 text-primary" />
              </div>
              {studentsQuery.error && (
                <p role="alert" className="mt-3 text-sm text-destructive">
                  {studentsQuery.error.message}
                </p>
              )}
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[640px] text-left text-sm">
                  <thead>
                    <tr className="border-b text-xs uppercase text-muted-foreground">
                      <th className="px-2 py-2">Student</th>
                      <th className="px-2 py-2">Student number</th>
                      <th className="px-2 py-2">Email / phone</th>
                      <th className="px-2 py-2">Records</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(studentsQuery.data ?? []).map((student) => (
                      <tr key={student.id} className="border-b last:border-0">
                        <td className="px-2 py-3 font-medium">
                          {student.first_name} {student.last_name}
                        </td>
                        <td className="px-2 py-3">{student.student_number}</td>
                        <td className="px-2 py-3">
                          {student.email}
                          <br />
                          <span className="text-xs text-muted-foreground">{student.phone}</span>
                        </td>
                        <td className="px-2 py-3">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setStudentId(student.id)}
                          >
                            View academic record
                          </Button>
                        </td>
                      </tr>
                    ))}
                    {!studentsQuery.isLoading && !studentsQuery.data?.length && (
                      <tr>
                        <td className="px-2 py-6 text-muted-foreground" colSpan={4}>
                          No active students are enrolled in this unit level.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
            {studentId && studentById.has(studentId) && (
              <StudentAcademicRecord
                student={studentById.get(studentId)!}
                unitId={activeUnit.unit_id}
              />
            )}
            {permissions.can_manage_assignments && (
              <section className="rounded-xl border bg-card p-5 shadow-card">
                <h2 className="font-semibold text-brand">Assignments and marking</h2>
                <form
                  className="mt-3 grid gap-3"
                  onSubmit={(event) => void createAssignment(event)}
                >
                  <Input
                    required
                    maxLength={160}
                    placeholder="Assignment title"
                    value={assignmentDraft.title}
                    onChange={(event) =>
                      setAssignmentDraft({ ...assignmentDraft, title: event.target.value })
                    }
                  />
                  <Textarea
                    rows={3}
                    placeholder="Instructions"
                    value={assignmentDraft.instructions}
                    onChange={(event) =>
                      setAssignmentDraft({ ...assignmentDraft, instructions: event.target.value })
                    }
                  />
                  <label className="grid max-w-sm gap-1 text-sm font-medium">
                    Due date
                    <Input
                      type="datetime-local"
                      value={assignmentDraft.dueDate}
                      onChange={(event) =>
                        setAssignmentDraft({ ...assignmentDraft, dueDate: event.target.value })
                      }
                    />
                  </label>
                  <Button className="justify-self-start" disabled={busy}>
                    {busy ? "Publishing…" : "Publish assignment"}
                  </Button>
                </form>
                <ul className="mt-4 divide-y">
                  {(assignmentsQuery.data ?? []).map((assignment) => (
                    <li
                      key={assignment.id}
                      className="flex flex-wrap justify-between gap-2 py-3 text-sm"
                    >
                      <span className="font-medium">
                        {assignment.title}
                        <span className="ml-2 text-xs text-muted-foreground">
                          {assignment.due_date
                            ? new Date(assignment.due_date).toLocaleString("en-KE")
                            : "No due date"}
                        </span>
                      </span>
                      <span>{assignment.published ? "Published" : "Draft"}</span>
                    </li>
                  ))}
                </ul>
                {assignmentsQuery.error && (
                  <p role="alert" className="mt-2 text-sm text-destructive">
                    {assignmentsQuery.error.message}
                  </p>
                )}
                <SubmissionsList assignments={assignmentsQuery.data ?? []} />
              </section>
            )}
            {permissions.can_manage_cats && (
              <section className="rounded-xl border bg-card p-5 shadow-card">
                <h2 className="font-semibold text-brand">Create a CAT</h2>
                <form className="mt-3 space-y-3" onSubmit={(event) => void createCat(event)}>
                  <Input
                    required
                    maxLength={160}
                    placeholder="CAT title"
                    value={catDraft.title}
                    onChange={(event) => setCatDraft({ ...catDraft, title: event.target.value })}
                  />
                  <Textarea
                    rows={2}
                    placeholder="Instructions"
                    value={catDraft.instructions}
                    onChange={(event) =>
                      setCatDraft({ ...catDraft, instructions: event.target.value })
                    }
                  />
                  <div className="grid gap-3 sm:grid-cols-3">
                    <label className="grid gap-1 text-sm">
                      Duration (minutes)
                      <Input
                        type="number"
                        min="1"
                        max="360"
                        required
                        value={catDraft.duration}
                        onChange={(event) =>
                          setCatDraft({ ...catDraft, duration: event.target.value })
                        }
                      />
                    </label>
                    <label className="grid gap-1 text-sm">
                      Opens at
                      <Input
                        type="datetime-local"
                        required
                        value={catDraft.opensAt}
                        onChange={(event) =>
                          setCatDraft({ ...catDraft, opensAt: event.target.value })
                        }
                      />
                    </label>
                    <label className="grid gap-1 text-sm">
                      Closes at
                      <Input
                        type="datetime-local"
                        required
                        value={catDraft.closesAt}
                        onChange={(event) =>
                          setCatDraft({ ...catDraft, closesAt: event.target.value })
                        }
                      />
                    </label>
                  </div>
                  {questions.map((question, index) => (
                    <fieldset key={index} className="grid gap-2 rounded-lg border p-3">
                      <legend className="px-1 text-sm font-semibold">Question {index + 1}</legend>
                      <Textarea
                        required
                        placeholder="Question prompt"
                        value={question.prompt}
                        onChange={(event) =>
                          setQuestions(
                            questions.map((item, i) =>
                              i === index ? { ...item, prompt: event.target.value } : item,
                            ),
                          )
                        }
                      />
                      <div className="grid gap-2 sm:grid-cols-2">
                        {(["option_a", "option_b", "option_c", "option_d"] as const).map(
                          (field) => (
                            <Input
                              key={field}
                              required
                              placeholder={`Option ${field.slice(-1).toUpperCase()}`}
                              value={question[field]}
                              onChange={(event) =>
                                setQuestions(
                                  questions.map((item, i) =>
                                    i === index ? { ...item, [field]: event.target.value } : item,
                                  ),
                                )
                              }
                            />
                          ),
                        )}
                      </div>
                      <div className="flex flex-wrap items-end gap-3">
                        <label className="grid gap-1 text-xs">
                          Correct option
                          <select
                            className="h-9 rounded-md border bg-background px-2"
                            value={question.correct_option}
                            onChange={(event) =>
                              setQuestions(
                                questions.map((item, i) =>
                                  i === index
                                    ? { ...item, correct_option: event.target.value }
                                    : item,
                                ),
                              )
                            }
                          >
                            <option>A</option>
                            <option>B</option>
                            <option>C</option>
                            <option>D</option>
                          </select>
                        </label>
                        <label className="grid gap-1 text-xs">
                          Points
                          <Input
                            type="number"
                            min="1"
                            max="100"
                            className="w-24"
                            value={question.points}
                            onChange={(event) =>
                              setQuestions(
                                questions.map((item, i) =>
                                  i === index
                                    ? { ...item, points: Number(event.target.value) }
                                    : item,
                                ),
                              )
                            }
                          />
                        </label>
                        {questions.length > 1 && (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => setQuestions(questions.filter((_, i) => i !== index))}
                          >
                            Remove question
                          </Button>
                        )}
                      </div>
                    </fieldset>
                  ))}
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setQuestions([...questions, initialQuestion()])}
                    >
                      <Plus className="mr-1 h-4 w-4" />
                      Add question
                    </Button>
                    <Button disabled={busy}>{busy ? "Creating…" : "Schedule CAT"}</Button>
                  </div>
                </form>
              </section>
            )}
          </div>
          <aside className="space-y-5">
            {permissions.can_manage_materials && (
              <section className="rounded-xl border bg-card p-5 shadow-card">
                <h2 className="font-semibold text-brand">Learning materials & videos</h2>
                <form className="mt-3 grid gap-2" onSubmit={(event) => void createMaterial(event)}>
                  <Input
                    required
                    maxLength={160}
                    placeholder="Material title"
                    value={materialDraft.title}
                    onChange={(event) =>
                      setMaterialDraft({ ...materialDraft, title: event.target.value })
                    }
                  />
                  <Input
                    placeholder="Video or resource URL (optional)"
                    type="url"
                    value={materialDraft.videoUrl}
                    onChange={(event) =>
                      setMaterialDraft({ ...materialDraft, videoUrl: event.target.value })
                    }
                  />
                  <input
                    type="file"
                    onChange={(event) =>
                      setMaterialDraft({ ...materialDraft, file: event.target.files?.[0] ?? null })
                    }
                  />
                  <Textarea
                    rows={2}
                    placeholder="Description"
                    value={materialDraft.description}
                    onChange={(event) =>
                      setMaterialDraft({ ...materialDraft, description: event.target.value })
                    }
                  />
                  <Button disabled={busy}>{busy ? "Uploading…" : "Publish material"}</Button>
                </form>
                <ul className="mt-4 divide-y">
                  {(materialsQuery.data ?? []).map((material) => (
                    <li key={material.id} className="flex items-start gap-2 py-3 text-sm">
                      {material.material_type === "video" ? (
                        <Video className="mt-0.5 h-4 w-4 text-primary" />
                      ) : (
                        <FileText className="mt-0.5 h-4 w-4 text-primary" />
                      )}
                      <span>
                        {material.title}
                        <span className="block text-xs text-muted-foreground">
                          {material.description}
                        </span>
                      </span>
                      {material.external_url && (
                        <a
                          className="ml-auto shrink-0 font-semibold text-primary underline"
                          href={material.external_url}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Open
                        </a>
                      )}
                      {material.file_path && <MaterialDownload path={material.file_path} />}
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {permissions.can_manage_results && (
              <section className="rounded-xl border bg-card p-5 shadow-card">
                <h2 className="font-semibold text-brand">Post results</h2>
                <form className="mt-3 grid gap-2" onSubmit={(event) => void createResult(event)}>
                  <select
                    className="h-10 rounded-md border bg-background px-3"
                    required
                    value={resultDraft.studentId}
                    onChange={(event) =>
                      setResultDraft({ ...resultDraft, studentId: event.target.value })
                    }
                  >
                    <option value="">Select student</option>
                    {(studentsQuery.data ?? []).map((student) => (
                      <option key={student.id} value={student.id}>
                        {student.student_number} · {student.first_name} {student.last_name}
                      </option>
                    ))}
                  </select>
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    required
                    placeholder="Score (0-100)"
                    value={resultDraft.score}
                    onChange={(event) =>
                      setResultDraft({ ...resultDraft, score: event.target.value })
                    }
                  />
                  <Input
                    placeholder="Grade (optional)"
                    value={resultDraft.grade}
                    onChange={(event) =>
                      setResultDraft({ ...resultDraft, grade: event.target.value })
                    }
                  />
                  <Input
                    placeholder="Academic year (optional)"
                    value={resultDraft.academicYear}
                    onChange={(event) =>
                      setResultDraft({ ...resultDraft, academicYear: event.target.value })
                    }
                  />
                  <Button disabled={busy || !studentsQuery.data?.length}>
                    {busy ? "Publishing…" : "Publish result"}
                  </Button>
                </form>
                <div className="mt-4 space-y-2">
                  {(resultQuery.data ?? []).map((result) => (
                    <p key={result.id} className="text-sm">
                      {studentById.get(result.student_id)?.student_number ?? "Student"} ·{" "}
                      {result.unit_name} · {result.score ?? "—"}{" "}
                      {result.grade ? `(${result.grade})` : ""}
                    </p>
                  ))}
                </div>
                {resultQuery.error && (
                  <p role="alert" className="mt-2 text-sm text-destructive">
                    {resultQuery.error.message}
                  </p>
                )}
              </section>
            )}
            {!permissions.can_manage_materials &&
              !permissions.can_manage_assignments &&
              !permissions.can_manage_cats &&
              !permissions.can_manage_results && (
                <p className="rounded-xl border bg-card p-5 text-sm text-muted-foreground">
                  Teaching actions are currently disabled by the administration for this unit.
                </p>
              )}
          </aside>
        </section>
      </main>
    </div>
  );
}

function SubmissionsList({ assignments }: { assignments: Array<{ id: string; title: string }> }) {
  const queryClient = useQueryClient();
  const [drafts, setDrafts] = useState<Record<string, { grade: string; feedback: string }>>({});
  const submissionsQuery = useQuery({
    queryKey: ["facilitator", "submissions", assignments.map((item) => item.id)],
    enabled: assignments.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("submissions")
        .select("id,assignment_id,student_id,status,grade,feedback,submitted_at")
        .in(
          "assignment_id",
          assignments.map((item) => item.id),
        )
        .order("submitted_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
  if (submissionsQuery.isLoading) return <p className="mt-3 text-sm">Loading submissions…</p>;
  if (submissionsQuery.error)
    return (
      <p role="alert" className="mt-3 text-sm text-destructive">
        {submissionsQuery.error.message}
      </p>
    );
  if (!submissionsQuery.data?.length)
    return (
      <p className="mt-3 text-sm text-muted-foreground">Student submissions will appear here.</p>
    );
  return (
    <div className="mt-4 space-y-3 border-t pt-4">
      <h3 className="font-semibold text-brand">Student submissions</h3>
      {submissionsQuery.data.map((submission) => {
        const draft = drafts[submission.id] ?? {
          grade: submission.grade ?? "",
          feedback: submission.feedback ?? "",
        };
        const assignmentTitle = assignments.find(
          (item) => item.id === submission.assignment_id,
        )?.title;
        return (
          <SubmissionMarking
            key={submission.id}
            assignmentTitle={assignmentTitle ?? "Assignment"}
            submission={submission}
            draft={draft}
            onDraft={(next) => setDrafts({ ...drafts, [submission.id]: next })}
            onSaved={async () => {
              await queryClient.invalidateQueries({
                queryKey: ["facilitator", "submissions", assignments.map((item) => item.id)],
              });
            }}
          />
        );
      })}
    </div>
  );
}

function SubmissionMarking({
  assignmentTitle,
  submission,
  draft,
  onDraft,
  onSaved,
}: {
  assignmentTitle: string;
  submission: {
    id: string;
    student_id: string;
    status: string;
    grade: string | null;
    feedback: string | null;
    submitted_at: string;
  };
  draft: { grade: string; feedback: string };
  onDraft: (draft: { grade: string; feedback: string }) => void;
  onSaved: () => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);
  return (
    <form
      className="grid gap-2 rounded-lg border p-3 sm:grid-cols-[1fr_10rem]"
      onSubmit={async (event) => {
        event.preventDefault();
        setSaving(true);
        const { error } = await supabase
          .from("submissions")
          .update({
            grade: draft.grade.trim() || null,
            feedback: draft.feedback.trim() || null,
            status: "graded",
          })
          .eq("id", submission.id);
        setSaving(false);
        if (error)
          toast.error("Could not save assessment feedback", { description: error.message });
        else {
          toast.success("Submission marked");
          await onSaved();
        }
      }}
    >
      <div>
        <p className="text-sm font-semibold">
          {assignmentTitle} · {submission.student_id.slice(0, 8)}
        </p>
        <p className="text-xs text-muted-foreground">
          Submitted {new Date(submission.submitted_at).toLocaleString("en-KE")} ·{" "}
          {submission.status}
        </p>
        <Textarea
          rows={2}
          placeholder="Feedback for student"
          value={draft.feedback}
          onChange={(event) => onDraft({ ...draft, feedback: event.target.value })}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Input
          aria-label="Grade"
          placeholder="Grade"
          value={draft.grade}
          onChange={(event) => onDraft({ ...draft, grade: event.target.value })}
        />
        <Button disabled={saving}>{saving ? "Saving…" : "Save mark"}</Button>
      </div>
    </form>
  );
}

function StudentAcademicRecord({
  student,
  unitId,
}: {
  student: {
    id: string;
    student_number: string;
    first_name: string;
    last_name: string;
    email: string;
    phone: string | null;
  };
  unitId: string;
}) {
  const recordQuery = useQuery({
    queryKey: ["facilitator", "student-record", student.id, unitId],
    queryFn: async () => {
      const [results, assignments] = await Promise.all([
        supabase
          .from("results")
          .select("id,unit_name,score,grade,academic_year,published,created_at")
          .eq("student_id", student.id)
          .eq("unit_id", unitId),
        supabase.from("assignments").select("id,title").eq("unit_id", unitId),
      ]);
      if (results.error) throw results.error;
      if (assignments.error) throw assignments.error;
      const assignmentIds = assignments.data.map((item) => item.id);
      const submissions = assignmentIds.length
        ? await supabase
            .from("submissions")
            .select("id,assignment_id,status,grade,feedback,submitted_at")
            .eq("student_id", student.id)
            .in("assignment_id", assignmentIds)
        : { data: [], error: null };
      if (submissions.error) throw submissions.error;
      return {
        results: results.data,
        assignments: assignments.data,
        submissions: submissions.data ?? [],
      };
    },
  });
  return (
    <section className="rounded-xl border bg-card p-5 shadow-card">
      <h2 className="font-semibold text-brand">
        Academic record · {student.first_name} {student.last_name}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {student.student_number} · {student.email} · {student.phone ?? "No phone on record"}
      </p>
      {recordQuery.error && (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {recordQuery.error.message}
        </p>
      )}
      {recordQuery.data && (
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div>
            <h3 className="font-medium">Results</h3>
            <ul className="mt-2 space-y-2 text-sm">
              {recordQuery.data.results.map((result) => (
                <li key={result.id}>
                  {result.unit_name} · {result.score ?? "—"}{" "}
                  {result.grade ? `(${result.grade})` : ""} ·{" "}
                  {result.published ? "Published" : "Draft"}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="font-medium">Assignments</h3>
            <ul className="mt-2 space-y-2 text-sm">
              {recordQuery.data.submissions.map((submission) => (
                <li key={submission.id}>
                  {
                    recordQuery.data!.assignments.find(
                      (item) => item.id === submission.assignment_id,
                    )?.title
                  }{" "}
                  · {submission.status} {submission.grade ? `· ${submission.grade}` : ""}
                  {submission.feedback ? (
                    <span className="block text-xs text-muted-foreground">
                      {submission.feedback}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </section>
  );
}

function MaterialDownload({ path }: { path: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <Button
      className="ml-auto shrink-0"
      type="button"
      size="sm"
      variant="ghost"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        const { data, error } = await supabase.storage.from("learning").createSignedUrl(path, 300);
        setBusy(false);
        if (error) {
          toast.error("Could not open learning material", { description: error.message });
          return;
        }
        window.open(data.signedUrl, "_blank", "noopener,noreferrer");
      }}
    >
      <Eye className="mr-1 h-4 w-4" />
      {busy ? "Opening…" : "Open file"}
    </Button>
  );
}

function PortalMessage({
  children,
  error,
  retry,
}: {
  children?: React.ReactNode;
  error?: string;
  retry?: () => void;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <section className="w-full max-w-lg rounded-xl border bg-card p-6 shadow-card">
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : (
          <div className="text-sm">{children}</div>
        )}
        {retry && (
          <Button className="mt-4" variant="outline" onClick={retry}>
            Retry
          </Button>
        )}
      </section>
    </main>
  );
}
