import { useEffect, useRef, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BookOpen,
  ClipboardList,
  Download,
  Eye,
  EyeOff,
  FileText,
  GraduationCap,
  ImagePlus,
  LogOut,
  MessageCircle,
  MoreHorizontal,
  Plus,
  UserRound,
  Video,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { PasswordResetPage } from "@/components/auth/PasswordResetPage";
import { LevelTargetPicker } from "@/components/academics/LevelTargetPicker";
import { CatQuestionImporter } from "@/components/academics/CatQuestionImporter";
import { CatQuestionPreview } from "@/components/academics/CatQuestionPreview";
import { SubmissionFileDownloads } from "@/components/academics/SubmissionFileDownloads";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useScrollReveal } from "@/lib/motion";
import { downloadContentAttachment } from "@/lib/content-download";
import { PROFILE_PHOTO_MAX_BYTES, PROFILE_PHOTO_TYPES } from "@/lib/profile-photos";
import { signOutWithAudit, useRoles, useUser } from "@/lib/auth";
import { submissionFilePaths } from "@/lib/assignments";
import type { ImportedCatQuestion } from "@/lib/cat-import-format";
import {
  contentKind,
  MAX_CONTENT_UPLOAD_SIZE,
  safeUploadFileName,
  supportedContentType,
} from "@/lib/file-uploads";
import { NotificationBell } from "@/components/site/NotificationBell";
import { InstallAppButton } from "@/components/site/InstallAppButton";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

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
        <Button className="w-full" disabled={busy} loading={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </Button>
      </form>
    </main>
  );
}

function FacilitatorWorkspace({ userId, email }: { userId: string; email: string }) {
  const queryClient = useQueryClient();
  const contentRef = useRef<HTMLDivElement>(null);
  const [selectedId, setSelectedId] = useState("");
  const [studentId, setStudentId] = useState("");
  const [moreOpen, setMoreOpen] = useState(false);
  const [activeSection, setActiveSection] = useState("dashboard");
  useScrollReveal(contentRef, activeSection, true);
  const profileQuery = useQuery({
    queryKey: ["facilitator", "profile", userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("full_name,avatar_url")
        .eq("id", userId)
        .maybeSingle();
      if (error) throw error;
      if (!data?.avatar_url)
        return { fullName: data?.full_name ?? null, photoPath: null, photoUrl: null };
      const { data: signedPhoto, error: signedError } = await supabase.storage
        .from("profile-photos")
        .createSignedUrl(data.avatar_url, 3600);
      if (signedError) throw signedError;
      return {
        fullName: data.full_name,
        photoPath: data.avatar_url,
        photoUrl: signedPhoto.signedUrl,
      };
    },
  });
  const memosQuery = useQuery({
    queryKey: ["facilitator", "memos", userId],
    refetchInterval: 60_000,
    queryFn: async () => {
      const now = new Date().toISOString();
      const { data, error } = await supabase
        .from("announcements")
        .select("id,title,body,attachment_url,attachment_file_name,created_at")
        .eq("category", "memo")
        .eq("published", true)
        .eq("show_to_facilitators", true)
        .or(`starts_at.is.null,starts_at.lte.${now}`)
        .or(`ends_at.is.null,ends_at.gte.${now}`)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
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
    levelIds: [] as string[],
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
    name: "",
    instructions: "",
    duration: "30",
    openImmediately: true,
    opensAt: "",
    closesAt: "",
    levelIds: [] as string[],
    downloadFile: null as File | null,
  });
  const [questions, setQuestions] = useState([initialQuestion()]);
  const [busy, setBusy] = useState(false);
  const catDownloadInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setAssignmentDraft((draft) => ({
      ...draft,
      levelIds: activeUnit?.unit.level_id ? [activeUnit.unit.level_id] : [],
    }));
    setCatDraft((draft) => ({
      ...draft,
      levelIds: activeUnit?.unit.level_id ? [activeUnit.unit.level_id] : [],
    }));
  }, [activeUnit?.unit_id, activeUnit?.unit.level_id]);

  async function createAssignment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activeUnit) return;
    if (!assignmentDraft.levelIds.length) {
      toast.error("Select at least one course level for this assignment.");
      return;
    }
    setBusy(true);
    const { error } = await supabase.from("assignments").insert({
      course_id: activeUnit.unit.course_id,
      unit_id: activeUnit.unit_id,
      level_ids: assignmentDraft.levelIds,
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
    setAssignmentDraft({
      title: "",
      instructions: "",
      dueDate: "",
      levelIds: activeUnit.unit.level_id ? [activeUnit.unit.level_id] : [],
    });
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
    if (!catDraft.name.trim()) {
      toast.error("Enter the name students should see on the CAT download.");
      return;
    }
    if (!catDraft.levelIds.length) {
      toast.error("Select at least one course level for this CAT.");
      return;
    }
    const opensAt = catDraft.openImmediately ? new Date() : new Date(catDraft.opensAt);
    const closesAt = new Date(catDraft.closesAt);
    if (
      Number.isNaN(opensAt.getTime()) ||
      Number.isNaN(closesAt.getTime()) ||
      (!catDraft.openImmediately && opensAt <= new Date()) ||
      closesAt <= opensAt
    ) {
      toast.error(
        catDraft.openImmediately
          ? "Choose a CAT closing time in the future."
          : "Choose valid future CAT opening and closing times.",
      );
      return;
    }
    if (catDraft.downloadFile && catDraft.downloadFile.size > 50 * 1024 * 1024) {
      toast.error("CAT download files must be 50 MB or smaller.");
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
    let downloadPath: string | null = null;
    if (catDraft.downloadFile) {
      downloadPath = `${activeUnit.unit.course_id}/${activeUnit.unit_id}/cat-downloads/${crypto.randomUUID()}-${safeUploadFileName(catDraft.downloadFile.name)}`;
      try {
        const { error: uploadError } = await supabase.storage
          .from("learning")
          .upload(downloadPath, catDraft.downloadFile, {
            contentType: catDraft.downloadFile.type || "application/octet-stream",
            upsert: false,
          });
        if (uploadError) throw uploadError;
      } catch (error) {
        setBusy(false);
        toast.error("Could not upload CAT download", {
          description: error instanceof Error ? error.message : "The file could not be uploaded.",
        });
        return;
      }
    }
    let createError: Error | null = null;
    try {
      const { error } = await supabase.rpc("create_facilitator_cat", {
        _unit_id: activeUnit.unit_id,
        _title: catDraft.title.trim(),
        _name: catDraft.name.trim(),
        _level_ids: catDraft.levelIds,
        _instructions: catDraft.instructions.trim() || null,
        _duration_minutes: Number(catDraft.duration),
        _opens_at: catDraft.openImmediately ? null : opensAt.toISOString(),
        _closes_at: closesAt.toISOString(),
        _questions: questions,
        _download_file_path: downloadPath,
        _download_file_name: catDraft.downloadFile?.name ?? null,
      });
      if (error) createError = error;
    } catch (error) {
      createError = error instanceof Error ? error : new Error("The CAT could not be created.");
    }
    setBusy(false);
    if (createError) {
      let description = createError.message;
      if (downloadPath) {
        const { error: cleanupError } = await supabase.storage
          .from("learning")
          .remove([downloadPath]);
        if (cleanupError) {
          description += ` The uploaded CAT file could not be cleaned up: ${cleanupError.message}`;
        }
      }
      toast.error("Could not create CAT", { description });
      return;
    }
    toast.success("CAT published for the assigned unit");
    setCatDraft({
      title: "",
      name: "",
      instructions: "",
      duration: "30",
      openImmediately: true,
      opensAt: "",
      closesAt: "",
      levelIds: activeUnit.unit.level_id ? [activeUnit.unit.level_id] : [],
      downloadFile: null,
    });
    if (catDownloadInputRef.current) catDownloadInputRef.current.value = "";
    setQuestions([initialQuestion()]);
  }

  function importCatQuestions(imported: ImportedCatQuestion[]) {
    const starterIsBlank =
      questions.length === 1 &&
      !questions[0]?.prompt.trim() &&
      !questions[0]?.option_a.trim() &&
      !questions[0]?.option_b.trim() &&
      !questions[0]?.option_c.trim() &&
      !questions[0]?.option_d.trim();
    if (imported.length + (starterIsBlank ? 0 : questions.length) > 100) {
      throw new Error("A CAT can contain no more than 100 questions.");
    }
    const importedQuestions = imported.map((question) => ({
      prompt: question.prompt,
      option_a: question.options.A,
      option_b: question.options.B,
      option_c: question.options.C,
      option_d: question.options.D,
      correct_option: question.correctOption ?? "",
      points: 1,
    }));
    setQuestions((current) =>
      starterIsBlank ? importedQuestions : [...current, ...importedQuestions],
    );
    toast.success(`${imported.length} question${imported.length === 1 ? "" : "s"} imported`);
  }

  async function signOut() {
    const result = await signOutWithAudit();
    if (result.error) {
      toast.error(
        result.signedOut
          ? "Signed out, but activity recording was incomplete"
          : "Could not sign out",
        { description: result.error.message },
      );
    }
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
  const navigationItems = [
    { id: "dashboard", title: "Dashboard", icon: BookOpen },
    { id: "facilitator-students", title: "Students", icon: GraduationCap },
    ...(permissions.can_manage_assignments
      ? [{ id: "facilitator-assignments", title: "Assignments", icon: ClipboardList }]
      : []),
    ...(permissions.can_manage_cats
      ? [{ id: "facilitator-cats", title: "CATs", icon: FileText }]
      : []),
    ...(permissions.can_manage_materials
      ? [{ id: "facilitator-materials", title: "Materials", icon: Video }]
      : []),
    ...(permissions.can_manage_results
      ? [{ id: "facilitator-results", title: "Results", icon: GraduationCap }]
      : []),
    { id: "facilitator-inbox", title: "Student inbox", icon: MessageCircle },
    { id: "facilitator-memos", title: "Memos", icon: FileText },
    { id: "facilitator-profile", title: "My profile", icon: UserRound },
  ];
  const mobileNavigationItems = [
    "dashboard",
    "facilitator-students",
    "facilitator-assignments",
    "facilitator-inbox",
    "facilitator-materials",
  ]
    .map((id) => navigationItems.find((item) => item.id === id))
    .filter((item): item is (typeof navigationItems)[number] => Boolean(item))
    .slice(0, 4);
  const moreNavigationItems = navigationItems.filter(
    (item) => !mobileNavigationItems.some((mobileItem) => mobileItem.id === item.id),
  );
  const selectSection = (id: string) => {
    setActiveSection(id);
    setMoreOpen(false);
  };
  const activeSectionTitle =
    navigationItems.find((item) => item.id === activeSection)?.title ?? "Dashboard";
  return (
    <div className="student-app-shell student-workspace min-h-screen bg-muted/40">
      <header className="student-app-header sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-border/70 bg-background/95 px-4 py-3 text-foreground shadow-sm backdrop-blur sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <a
            href="/facilitator"
            className="flex shrink-0 items-center gap-2.5"
            aria-label="Profia Institute facilitator portal"
          >
            <img src="/images/logo.png" alt="" className="h-10 w-auto" />
            <span className="hidden sm:inline">
              <span className="block text-sm font-extrabold leading-tight text-brand">PROFIA</span>
              <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Facilitator services
              </span>
            </span>
          </a>
          <span aria-hidden="true" className="text-border">
            /
          </span>
          <span className="truncate text-sm font-semibold text-foreground">
            {activeSectionTitle}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-1.5 sm:gap-3">
          <InstallAppButton label="Download app" />
          <NotificationBell
            userId={userId}
            onNavigate={(category) =>
              selectSection(
                category === "messages"
                  ? "facilitator-inbox"
                  : category === "memos"
                    ? "facilitator-memos"
                    : "facilitator-students",
              )
            }
          />
          {profileQuery.data?.photoUrl ? (
            <img
              src={profileQuery.data.photoUrl}
              alt=""
              className="h-9 w-9 rounded-full border object-cover"
            />
          ) : (
            <span className="grid h-9 w-9 place-items-center rounded-full border bg-muted text-brand">
              <UserRound className="h-4 w-4" />
            </span>
          )}
          <span className="hidden max-w-48 truncate text-xs text-muted-foreground md:inline">
            {profileQuery.data?.fullName || email}
          </span>
          <Button size="sm" variant="outline" onClick={() => void signOut()}>
            <LogOut className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">Sign out</span>
          </Button>
        </div>
      </header>
      <div className="mx-auto flex max-w-[90rem] flex-col lg:flex-row">
        <aside className="hidden border-b bg-card p-4 lg:sticky lg:top-[65px] lg:block lg:h-[calc(100vh-65px)] lg:w-64 lg:shrink-0 lg:border-b-0 lg:border-r">
          <div className="rounded-xl border bg-cream p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-primary">Teaching</p>
            {profileQuery.data?.photoUrl ? (
              <img
                src={profileQuery.data.photoUrl}
                alt=""
                className="mt-4 h-12 w-12 rounded-xl border object-cover"
              />
            ) : (
              <span className="mt-4 grid h-12 w-12 place-items-center rounded-xl border bg-muted text-brand">
                <UserRound className="h-5 w-5" />
              </span>
            )}
            <p className="mt-3 truncate font-semibold text-brand">
              {profileQuery.data?.fullName || email}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">{activeUnit.course.title}</p>
          </div>
          <nav className="mt-5 flex flex-col gap-1" aria-label="Facilitator portal">
            {navigationItems.map(({ id, title, icon: Icon }) => (
              <PortalNavLink
                key={id}
                href="#"
                isActive={activeSection === id}
                onSelect={() => selectSection(id)}
              >
                <Icon className="h-4 w-4" /> {title}
              </PortalNavLink>
            ))}
          </nav>
        </aside>
        <main className="student-app-content min-w-0 flex-1 p-4 pb-8 sm:p-6 lg:p-8">
          <div ref={contentRef} className="mx-auto w-full max-w-5xl space-y-5">
            <p className="eyebrow">Facilitator services / {activeUnit.course.title}</p>
            <h1 className="text-2xl font-bold text-brand sm:text-3xl">
              {activeSection === "dashboard" ? "Teaching workspace" : activeSectionTitle}
            </h1>
            {activeSection === "dashboard" && (
              <>
                <label className="grid w-full max-w-xl gap-1.5 text-sm font-medium">
                  Assigned teaching unit
                  <select
                    className="h-10 w-full min-w-0 rounded-md border bg-background px-3"
                    value={activeUnit.id}
                    onChange={(event) => {
                      setSelectedId(event.target.value);
                      setStudentId("");
                      setActiveSection("dashboard");
                    }}
                  >
                    {unitsQuery.data.map((unit) => (
                      <option key={unit.id} value={unit.id}>
                        {unit.course.title} · {unit.unit.title}
                      </option>
                    ))}
                  </select>
                </label>
                <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <DashboardSummaryCard
                    label="Enrolled students"
                    value={studentsQuery.data?.length ?? 0}
                    icon={GraduationCap}
                  />
                  <DashboardSummaryCard
                    label="Assigned units"
                    value={unitsQuery.data?.length ?? 0}
                    icon={BookOpen}
                  />
                  {permissions.can_manage_assignments && (
                    <DashboardSummaryCard
                      label="Assignments"
                      value={assignmentsQuery.data?.length ?? 0}
                      icon={ClipboardList}
                    />
                  )}
                  {permissions.can_manage_results && (
                    <DashboardSummaryCard
                      label="Results posted"
                      value={resultQuery.data?.length ?? 0}
                      icon={GraduationCap}
                    />
                  )}
                </section>
                <section className="rounded-xl border bg-card p-5 shadow-card">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <h2 className="font-semibold text-brand">Your teaching unit</h2>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {activeUnit.course.title} · {activeUnit.unit.title}
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {activeUnit.unit.semester || "Assigned course unit"}
                      </p>
                    </div>
                    <Button onClick={() => selectSection("facilitator-students")}>
                      View students
                    </Button>
                  </div>
                </section>
                <section className="rounded-xl border bg-card p-5 shadow-card">
                  <h2 className="font-semibold text-brand">Quick access</h2>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {navigationItems
                      .filter((item) => item.id !== "dashboard")
                      .map(({ id, title, icon: Icon }) => (
                        <button
                          key={id}
                          type="button"
                          onClick={() => selectSection(id)}
                          className="flex min-h-14 items-center gap-3 rounded-xl border p-3 text-left text-sm font-medium transition hover:border-primary/40 hover:bg-muted"
                        >
                          <Icon className="h-5 w-5 shrink-0 text-primary" />
                          {title}
                        </button>
                      ))}
                  </div>
                </section>
              </>
            )}
            {activeSection === "facilitator-students" && (
              <>
                <section
                  id="facilitator-students"
                  className="rounded-xl border bg-card p-5 shadow-card"
                >
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
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={!studentsQuery.data?.length}
                        onClick={() =>
                          downloadRoster(
                            studentsQuery.data ?? [],
                            `${activeUnit.unit.title}-student-roster.csv`,
                          )
                        }
                      >
                        <Download className="mr-1 h-4 w-4" />
                        Download roster
                      </Button>
                      <BookOpen className="h-5 w-5 text-primary" />
                    </div>
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
              </>
            )}
            {permissions.can_manage_assignments && activeSection === "facilitator-assignments" && (
              <section
                id="facilitator-assignments"
                className="rounded-xl border bg-card p-5 shadow-card"
              >
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
                  <LevelTargetPicker
                    courseId={activeUnit.unit.course_id}
                    selectedLevelIds={assignmentDraft.levelIds}
                    onChange={(levelIds) => setAssignmentDraft({ ...assignmentDraft, levelIds })}
                    allowedLevelId={activeUnit.unit.level_id}
                  />
                  <Textarea
                    rows={3}
                    placeholder="Instructions"
                    value={assignmentDraft.instructions}
                    onChange={(event) =>
                      setAssignmentDraft({
                        ...assignmentDraft,
                        instructions: event.target.value,
                      })
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
                  <Button className="justify-self-start" disabled={busy} loading={busy}>
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
            {permissions.can_manage_cats && activeSection === "facilitator-cats" && (
              <section id="facilitator-cats" className="rounded-xl border bg-card p-5 shadow-card">
                <h2 className="font-semibold text-brand">Create a CAT</h2>
                <form className="mt-3 space-y-3" onSubmit={(event) => void createCat(event)}>
                  <Input
                    required
                    maxLength={160}
                    placeholder="CAT title"
                    value={catDraft.title}
                    onChange={(event) => setCatDraft({ ...catDraft, title: event.target.value })}
                  />
                  <Input
                    required
                    maxLength={160}
                    placeholder="CAT download name (e.g. CAT 1 Financial Accounting)"
                    value={catDraft.name}
                    onChange={(event) => setCatDraft({ ...catDraft, name: event.target.value })}
                  />
                  <LevelTargetPicker
                    courseId={activeUnit.unit.course_id}
                    selectedLevelIds={catDraft.levelIds}
                    onChange={(levelIds) => setCatDraft({ ...catDraft, levelIds })}
                    allowedLevelId={activeUnit.unit.level_id}
                  />
                  <label className="grid gap-1 text-sm font-medium">
                    Optional CAT download file
                    <input
                      ref={catDownloadInputRef}
                      type="file"
                      accept=".pdf,.doc,.docx,.odt,.rtf"
                      className="w-full min-w-0 max-w-full text-xs"
                      onChange={(event) =>
                        setCatDraft({
                          ...catDraft,
                          downloadFile: event.target.files?.[0] ?? null,
                        })
                      }
                    />
                    <span className="text-xs text-muted-foreground">
                      Maximum file size: 50 MB. The timed online CAT remains available separately.
                    </span>
                  </label>
                  <Textarea
                    rows={2}
                    placeholder="Instructions"
                    value={catDraft.instructions}
                    onChange={(event) =>
                      setCatDraft({ ...catDraft, instructions: event.target.value })
                    }
                  />
                  <label className="flex items-center gap-2 text-sm font-medium">
                    <input
                      type="checkbox"
                      checked={catDraft.openImmediately}
                      onChange={(event) =>
                        setCatDraft({ ...catDraft, openImmediately: event.target.checked })
                      }
                      className="accent-primary"
                    />
                    Open immediately when published
                  </label>
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
                    {!catDraft.openImmediately && (
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
                    )}
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
                  <CatQuestionImporter onImport={importCatQuestions} />
                  <CatQuestionPreview
                    questions={questions.map((question) => ({
                      prompt: question.prompt,
                      options: {
                        A: question.option_a,
                        B: question.option_b,
                        C: question.option_c,
                        D: question.option_d,
                      },
                    }))}
                  />
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
                            required
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
                            <option value="" disabled>
                              Select correct answer
                            </option>
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
                      disabled={questions.length >= 100}
                      onClick={() => setQuestions([...questions, initialQuestion()])}
                    >
                      <Plus className="mr-1 h-4 w-4" />
                      Add question
                    </Button>
                    <Button disabled={busy} loading={busy}>
                      {busy ? "Creating…" : "Schedule CAT"}
                    </Button>
                  </div>
                </form>
              </section>
            )}
            {permissions.can_manage_materials && activeSection === "facilitator-materials" && (
              <section
                id="facilitator-materials"
                className="rounded-xl border bg-card p-5 shadow-card"
              >
                <h2 className="font-semibold text-brand">Learning materials & videos</h2>
                <form
                  className="mt-3 grid min-w-0 grid-cols-1 gap-2"
                  onSubmit={(event) => void createMaterial(event)}
                >
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
                    className="w-full min-w-0 max-w-full text-xs"
                    onChange={(event) =>
                      setMaterialDraft({
                        ...materialDraft,
                        file: event.target.files?.[0] ?? null,
                      })
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
                  <Button disabled={busy} loading={busy}>
                    {busy ? "Uploading…" : "Publish material"}
                  </Button>
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
                      {material.file_path && (
                        <MaterialDownload path={material.file_path} filename={material.title} />
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {permissions.can_manage_results && activeSection === "facilitator-results" && (
              <section
                id="facilitator-results"
                className="rounded-xl border bg-card p-5 shadow-card"
              >
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
                  <Button disabled={busy || !studentsQuery.data?.length} loading={busy}>
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
            {activeSection === "facilitator-inbox" && (
              <FacilitatorInboxSection
                userId={userId}
                students={studentsQuery.data ?? []}
                activeUnitName={activeUnit.unit.title}
              />
            )}
            {activeSection === "facilitator-memos" && (
              <section id="facilitator-memos" className="rounded-xl border bg-card p-5 shadow-card">
                <div className="flex items-start gap-3">
                  <FileText className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                  <div>
                    <h2 className="font-semibold text-brand">Institute memos</h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Notices shared by administration for facilitators.
                    </p>
                  </div>
                </div>
                {memosQuery.error ? (
                  <p role="alert" className="mt-3 text-sm text-destructive">
                    Could not load memos: {memosQuery.error.message}
                  </p>
                ) : memosQuery.isLoading ? (
                  <p className="mt-3 text-sm text-muted-foreground">Loading memos…</p>
                ) : memosQuery.data?.length ? (
                  <ul className="mt-4 divide-y">
                    {memosQuery.data.map((memo) => (
                      <li
                        key={memo.id}
                        className="flex flex-wrap items-start justify-between gap-3 py-3"
                      >
                        <div className="min-w-0">
                          <h3 className="font-medium">{memo.title}</h3>
                          <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">
                            {memo.body
                              .replace(/<[^>]*>/g, " ")
                              .replace(/\s+/g, " ")
                              .trim()}
                          </p>
                          <time className="mt-1 block text-xs text-muted-foreground">
                            {new Date(memo.created_at).toLocaleDateString("en-KE")}
                          </time>
                        </div>
                        {memo.attachment_url && (
                          <MemoDownloadButton
                            url={memo.attachment_url}
                            filename={memo.attachment_file_name || memo.title}
                          />
                        )}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-4 rounded-lg bg-muted/50 p-4 text-sm text-muted-foreground">
                    There are no memos published for facilitators.
                  </p>
                )}
              </section>
            )}
            {activeSection === "facilitator-profile" && (
              <FacilitatorProfileSection
                userId={userId}
                email={email}
                profile={profileQuery.data}
              />
            )}
          </div>
        </main>
      </div>
      <nav
        className="student-mobile-nav fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t bg-background/95 px-2 pt-1 shadow-[0_-8px_24px_-16px_rgba(20,10,10,0.35)] backdrop-blur-lg lg:hidden"
        aria-label="Facilitator app"
      >
        {mobileNavigationItems.map(({ id, title, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => selectSection(id)}
            aria-current={activeSection === id ? "page" : undefined}
            className={`flex min-w-0 flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-1 text-[10px] font-semibold ${activeSection === id ? "text-brand" : "text-muted-foreground hover:text-brand"}`}
          >
            <Icon className="h-5 w-5" />
            <span className="max-w-full truncate">{title}</span>
          </button>
        ))}
        <button
          type="button"
          onClick={() => setMoreOpen(true)}
          aria-haspopup="dialog"
          aria-expanded={moreOpen}
          className="flex min-w-0 flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-1 text-[10px] font-semibold text-muted-foreground"
        >
          <MoreHorizontal className="h-5 w-5" />
          <span>More</span>
        </button>
      </nav>
      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent side="bottom" className="rounded-t-3xl pb-8">
          <SheetHeader className="mb-5 pr-8 text-left">
            <SheetTitle>More facilitator tools</SheetTitle>
            <SheetDescription>Assessments, results, memos and account settings</SheetDescription>
          </SheetHeader>
          <div className="grid grid-cols-2 gap-3 pb-2">
            {moreNavigationItems.map(({ id, title, icon: Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => selectSection(id)}
                className="flex min-h-16 items-center gap-3 rounded-2xl border bg-card p-4 text-left text-sm font-semibold hover:bg-muted"
              >
                <Icon className="h-5 w-5 shrink-0" />
                {title}
              </button>
            ))}
          </div>
          <p className="mt-5 truncate text-xs text-muted-foreground">{email}</p>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function PortalNavLink({
  href,
  onSelect,
  isActive,
  children,
}: {
  href: string;
  onSelect: () => void;
  isActive: boolean;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      onClick={(event) => {
        event.preventDefault();
        onSelect();
      }}
      aria-current={isActive ? "location" : undefined}
      className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm transition ${isActive ? "bg-accent font-medium text-brand shadow-sm ring-1 ring-primary/15" : "text-muted-foreground hover:bg-muted hover:text-brand"}`}
    >
      {children}
    </a>
  );
}

function DashboardSummaryCard({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: number;
  icon: LucideIcon;
}) {
  return (
    <div className="motion-card rounded-xl border bg-card p-4 shadow-card">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">{label}</p>
        <span className="motion-icon grid h-9 w-9 place-items-center rounded-lg bg-primary/10 text-primary">
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <p className="mt-3 text-2xl font-bold text-brand">{value}</p>
    </div>
  );
}

function downloadRoster(
  students: Array<{
    student_number: string;
    first_name: string;
    last_name: string;
    email: string;
    phone: string | null;
  }>,
  filename: string,
) {
  const escape = (value: string | null) => `"${(value ?? "").replaceAll('"', '""')}"`;
  const rows = [
    ["Student number", "First name", "Last name", "Email", "Phone"],
    ...students.map((student) => [
      student.student_number,
      student.first_name,
      student.last_name,
      student.email,
      student.phone ?? "",
    ]),
  ];
  const csv = `\uFEFF${rows.map((row) => row.map(escape).join(",")).join("\r\n")}`;
  const objectUrl = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
}

function MemoDownloadButton({ url, filename }: { url: string; filename: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await downloadContentAttachment(url, filename);
        } catch (error) {
          toast.error("Could not download memo", {
            description:
              error instanceof Error ? error.message : "The memo could not be downloaded.",
          });
        } finally {
          setBusy(false);
        }
      }}
    >
      <Download className="mr-1 h-4 w-4" />
      {busy ? "Downloading…" : "Download memo"}
    </Button>
  );
}

function FacilitatorInboxSection({
  userId,
  students,
  activeUnitName,
}: {
  userId: string;
  students: Array<{
    id: string;
    student_number: string;
    first_name: string;
    last_name: string;
    email: string;
  }>;
  activeUnitName: string;
}) {
  const queryClient = useQueryClient();
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [body, setBody] = useState("");
  useEffect(() => {
    const firstStudent = students[0];
    if (firstStudent && !students.some((student) => student.id === selectedStudentId)) {
      setSelectedStudentId(firstStudent.id);
    }
  }, [selectedStudentId, students]);
  const selectedStudent = students.find((student) => student.id === selectedStudentId);
  const conversationQuery = useQuery({
    queryKey: ["facilitator", "conversation", selectedStudentId],
    enabled: Boolean(selectedStudentId),
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_or_create_facilitator_conversation", {
        _student_id: selectedStudentId,
      });
      if (error) throw error;
      return data;
    },
  });
  const messagesQuery = useQuery({
    queryKey: ["facilitator", "messages", conversationQuery.data],
    enabled: Boolean(conversationQuery.data),
    refetchInterval: 10_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("portal_messages")
        .select("id,sender_id,body,read_at,created_at")
        .eq("conversation_id", conversationQuery.data!)
        .order("created_at");
      if (error) throw error;
      return data;
    },
  });
  useEffect(() => {
    const unread =
      messagesQuery.data?.filter((message) => message.sender_id !== userId && !message.read_at) ??
      [];
    if (!unread.length) return;
    void supabase
      .from("portal_messages")
      .update({ read_at: new Date().toISOString() })
      .in(
        "id",
        unread.map((message) => message.id),
      )
      .then(({ error }) => {
        if (error) toast.error("Could not mark messages as read", { description: error.message });
        else
          void queryClient.invalidateQueries({
            queryKey: ["facilitator", "messages", conversationQuery.data],
          });
      });
  }, [conversationQuery.data, messagesQuery.data, queryClient, userId]);
  const sendMutation = useMutation({
    mutationFn: async () => {
      if (!conversationQuery.data) throw new Error("Choose a student message thread first.");
      const { error } = await supabase.from("portal_messages").insert({
        conversation_id: conversationQuery.data,
        sender_id: userId,
        body: body.trim(),
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      setBody("");
      await queryClient.invalidateQueries({
        queryKey: ["facilitator", "messages", conversationQuery.data],
      });
    },
    onError: (error) => toast.error("Could not send message", { description: error.message }),
  });
  return (
    <section
      id="facilitator-inbox"
      className="scroll-mt-24 rounded-xl border bg-card p-5 shadow-card"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 font-semibold text-brand">
            <MessageCircle className="h-5 w-5 text-primary" /> Student inbox
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Private messages with students assigned to your teaching units. {activeUnitName}
          </p>
        </div>
        <label className="grid gap-1 text-sm font-medium">
          Student
          <select
            className="h-10 min-w-56 rounded-md border bg-background px-3"
            value={selectedStudentId}
            onChange={(event) => setSelectedStudentId(event.target.value)}
          >
            {!students.length && <option value="">No assigned students</option>}
            {students.map((student) => (
              <option key={student.id} value={student.id}>
                {student.student_number} · {student.first_name} {student.last_name}
              </option>
            ))}
          </select>
        </label>
      </div>
      {conversationQuery.error ? (
        <p role="alert" className="mt-3 text-sm text-destructive">
          Could not open this conversation: {conversationQuery.error.message}
        </p>
      ) : messagesQuery.error ? (
        <p role="alert" className="mt-3 text-sm text-destructive">
          Could not load messages: {messagesQuery.error.message}
        </p>
      ) : !selectedStudent ? (
        <p className="mt-4 rounded-lg bg-muted/50 p-4 text-sm text-muted-foreground">
          Student conversations appear here when students are enrolled in your assigned units.
        </p>
      ) : (
        <>
          <div
            className="mt-4 max-h-96 space-y-3 overflow-y-auto rounded-lg bg-muted/40 p-3"
            aria-live="polite"
          >
            {(messagesQuery.data ?? []).map((message) => (
              <div
                key={message.id}
                className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${
                  message.sender_id === userId
                    ? "ml-auto bg-primary text-primary-foreground"
                    : "bg-card"
                }`}
              >
                <p className="whitespace-pre-wrap">{message.body}</p>
                <time className="mt-1 block text-[10px] opacity-70">
                  {new Date(message.created_at).toLocaleString("en-KE")}
                </time>
              </div>
            ))}
            {!messagesQuery.isLoading && !messagesQuery.data?.length && (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Start a private conversation with {selectedStudent.first_name}.
              </p>
            )}
          </div>
          <form
            className="mt-3 flex flex-col gap-2 sm:flex-row"
            onSubmit={(event) => {
              event.preventDefault();
              if (body.trim()) sendMutation.mutate();
            }}
          >
            <Textarea
              required
              maxLength={5000}
              rows={2}
              placeholder="Write a message to this student…"
              value={body}
              onChange={(event) => setBody(event.target.value)}
            />
            <Button
              className="shrink-0 sm:self-end"
              disabled={sendMutation.isPending || !body.trim()}
              loading={sendMutation.isPending}
            >
              {sendMutation.isPending ? "Sending…" : "Send message"}
            </Button>
          </form>
        </>
      )}
    </section>
  );
}

function FacilitatorProfileSection({
  userId,
  email,
  profile,
}: {
  userId: string;
  email: string;
  profile:
    { fullName: string | null; photoPath: string | null; photoUrl: string | null } | undefined;
}) {
  const queryClient = useQueryClient();
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [passwordBusy, setPasswordBusy] = useState(false);
  async function uploadPhoto(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!(PROFILE_PHOTO_TYPES as readonly string[]).includes(file.type)) {
      toast.error("Choose a JPG, PNG or WebP image.");
      return;
    }
    if (file.size > PROFILE_PHOTO_MAX_BYTES) {
      toast.error("Profile photos must be 3 MB or smaller.");
      return;
    }
    const extension =
      file.type === "image/jpeg" ? "jpg" : file.type === "image/png" ? "png" : "webp";
    const path = `${userId}/profile.${extension}`;
    setPhotoBusy(true);
    const { error: uploadError } = await supabase.storage
      .from("profile-photos")
      .upload(path, file, { upsert: true, contentType: file.type, cacheControl: "3600" });
    if (uploadError) {
      setPhotoBusy(false);
      toast.error("Could not upload profile photo", { description: uploadError.message });
      return;
    }
    const { data, error } = await supabase
      .from("profiles")
      .update({ avatar_url: path })
      .eq("id", userId)
      .select("id")
      .maybeSingle();
    if (error || !data) {
      setPhotoBusy(false);
      toast.error("Could not save profile photo", {
        description: error?.message ?? "Your profile could not be updated.",
      });
      return;
    }
    if (profile?.photoPath && profile.photoPath !== path) {
      const { error: removeError } = await supabase.storage
        .from("profile-photos")
        .remove([profile.photoPath]);
      if (removeError)
        toast.error("Profile photo updated, but the previous photo could not be removed", {
          description: removeError.message,
        });
    }
    await queryClient.invalidateQueries({ queryKey: ["facilitator", "profile", userId] });
    setPhotoBusy(false);
    toast.success("Profile photo updated");
  }
  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (password.length < 8) {
      toast.error("Use a password with at least 8 characters.");
      return;
    }
    if (password !== confirmation) {
      toast.error("The passwords do not match.");
      return;
    }
    setPasswordBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setPasswordBusy(false);
    if (error) {
      toast.error("Could not update password", { description: error.message });
      return;
    }
    setPassword("");
    setConfirmation("");
    toast.success("Password updated");
  }
  return (
    <section
      id="facilitator-profile"
      className="scroll-mt-24 rounded-xl border bg-card p-5 shadow-card"
    >
      <h2 className="font-semibold text-brand">My profile & security</h2>
      <p className="mt-1 text-sm text-muted-foreground">{profile?.fullName || email}</p>
      <div className="mt-4 flex flex-wrap items-center gap-4">
        {profile?.photoUrl ? (
          <img
            src={profile.photoUrl}
            alt="Your profile"
            className="h-20 w-20 rounded-full border object-cover"
          />
        ) : (
          <div className="grid h-20 w-20 place-items-center rounded-full border bg-muted text-brand">
            <UserRound className="h-8 w-8" />
          </div>
        )}
        <div>
          <input
            ref={photoInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            onChange={(event) => void uploadPhoto(event)}
          />
          <Button
            type="button"
            variant="outline"
            disabled={photoBusy}
            onClick={() => photoInputRef.current?.click()}
          >
            <ImagePlus className="mr-2 h-4 w-4" />
            {photoBusy ? "Uploading…" : "Upload profile photo"}
          </Button>
          <p className="mt-1 text-xs text-muted-foreground">JPG, PNG or WebP; maximum 3 MB.</p>
        </div>
      </div>
      <form
        className="mt-5 grid max-w-xl gap-3 border-t pt-4"
        onSubmit={(event) => void changePassword(event)}
      >
        <h3 className="font-medium">Change password</h3>
        <label className="grid gap-1.5 text-sm font-medium">
          New password
          <Input
            required
            minLength={8}
            type={showPassword ? "text" : "password"}
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        <label className="grid gap-1.5 text-sm font-medium">
          Confirm new password
          <span className="relative">
            <Input
              required
              minLength={8}
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              className="pr-12"
            />
            <button
              type="button"
              aria-label={showPassword ? "Hide password" : "Show password"}
              className="absolute inset-y-0 right-0 grid w-11 place-items-center text-muted-foreground"
              onClick={() => setShowPassword(!showPassword)}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </span>
        </label>
        <Button className="justify-self-start" disabled={passwordBusy}>
          {passwordBusy ? "Updating…" : "Update password"}
        </Button>
      </form>
    </section>
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
        .select(
          "id,assignment_id,student_id,status,grade,feedback,submitted_at,file_path,file_paths",
        )
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
    file_path: string | null;
    file_paths: string[];
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
        <SubmissionFileDownloads paths={submissionFilePaths(submission)} />
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

function MaterialDownload({ path, filename }: { path: string; filename: string }) {
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
        const { data, error } = await supabase.storage
          .from("learning")
          .createSignedUrl(path, 300, { download: filename });
        if (error) {
          setBusy(false);
          toast.error("Could not open learning material", { description: error.message });
          return;
        }
        try {
          await downloadContentAttachment(data.signedUrl, filename);
        } catch (downloadError) {
          toast.error("Could not download learning material", {
            description:
              downloadError instanceof Error
                ? downloadError.message
                : "The file could not be downloaded.",
          });
        } finally {
          setBusy(false);
        }
      }}
    >
      <Download className="mr-1 h-4 w-4" />
      {busy ? "Downloading…" : "Download"}
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
