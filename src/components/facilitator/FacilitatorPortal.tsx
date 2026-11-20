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
import { Badge } from "@/components/ui/badge";
import { PasswordResetPage } from "@/components/auth/PasswordResetPage";
import { LevelTargetPicker } from "@/components/academics/LevelTargetPicker";
import { CatQuestionGroupFields } from "@/components/academics/CatQuestionGroupFields";
import { CatQuestionImporter } from "@/components/academics/CatQuestionImporter";
import { CatQuestionPreview } from "@/components/academics/CatQuestionPreview";
import { FacilitatorCatPerformance } from "@/components/facilitator/FacilitatorCatPerformance";
import { FacilitatorLiveClasses } from "@/components/facilitator/FacilitatorLiveClasses";
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
import type { ImportedCatAnswer, ImportedCatQuestion } from "@/lib/cat-import-format";
import { getDateTimeLocalMinimum } from "@/lib/cats";
import { validateSharedQuestionGroups } from "@/lib/cat-question-groups";
import {
  clearSessionDraft,
  createSessionDraftKey,
  readSessionDraft,
  writeSessionDraft,
} from "@/lib/session-draft";
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

type FacilitatorAssignmentDraft = {
  title: string;
  instructions: string;
  dueDate: string;
  levelIds: string[];
};

type FacilitatorCatDraft = {
  title: string;
  name: string;
  instructions: string;
  duration: string;
  openImmediately: boolean;
  opensAt: string;
  closesAt: string;
  levelIds: string[];
  questions: FacilitatorCatQuestion[];
};

type FacilitatorCatQuestion = {
  prompt: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  correct_option: string;
  points: number;
  sharedGroup: string;
  sharedPrompt: string;
  groupPosition: string;
};

function isFacilitatorAssignmentDraft(value: unknown): value is FacilitatorAssignmentDraft {
  if (!value || typeof value !== "object") return false;
  const draft = value as Partial<FacilitatorAssignmentDraft>;
  return (
    typeof draft.title === "string" &&
    typeof draft.instructions === "string" &&
    typeof draft.dueDate === "string" &&
    Array.isArray(draft.levelIds) &&
    draft.levelIds.every((id) => typeof id === "string")
  );
}

function isFacilitatorCatDraft(value: unknown): value is FacilitatorCatDraft {
  if (!value || typeof value !== "object") return false;
  const draft = value as Partial<FacilitatorCatDraft>;
  return (
    typeof draft.title === "string" &&
    typeof draft.name === "string" &&
    typeof draft.instructions === "string" &&
    typeof draft.duration === "string" &&
    typeof draft.openImmediately === "boolean" &&
    typeof draft.opensAt === "string" &&
    typeof draft.closesAt === "string" &&
    Array.isArray(draft.levelIds) &&
    draft.levelIds.every((id) => typeof id === "string") &&
    Array.isArray(draft.questions) &&
    draft.questions.every(
      (question) =>
        question &&
        typeof question.prompt === "string" &&
        typeof question.option_a === "string" &&
        typeof question.option_b === "string" &&
        typeof question.option_c === "string" &&
        typeof question.option_d === "string" &&
        typeof question.correct_option === "string" &&
        typeof question.points === "number" &&
        (question.sharedGroup === undefined || typeof question.sharedGroup === "string") &&
        (question.sharedPrompt === undefined || typeof question.sharedPrompt === "string") &&
        (question.groupPosition === undefined || typeof question.groupPosition === "string"),
    )
  );
}

const initialQuestion = (): FacilitatorCatQuestion => ({
  prompt: "",
  option_a: "",
  option_b: "",
  option_c: "",
  option_d: "",
  correct_option: "A",
  points: 1,
  sharedGroup: "",
  sharedPrompt: "",
  groupPosition: "1",
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
        forced={user?.app_metadata?.["password_reset_required"] === true}
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
  if (user.app_metadata?.["password_reset_required"] === true) {
    return (
      <PasswordResetPage
        destination="/facilitator"
        forced
        onComplete={() => {
          window.history.replaceState({}, "", "/facilitator");
          setResetMode(false);
          setSetupMode(false);
        }}
      />
    );
  }
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
  const activeUnitId = activeUnit?.unit_id;
  const activeUnitLevelId = activeUnit?.unit.level_id;
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
  const [assignmentDraft, setAssignmentDraft] = useState<FacilitatorAssignmentDraft>({
    title: "",
    instructions: "",
    dueDate: "",
    levelIds: [] as string[],
  });
  const [assignmentDraftUnitId, setAssignmentDraftUnitId] = useState("");
  const [assignmentDraftRestored, setAssignmentDraftRestored] = useState(false);
  const [assignmentDraftSaveFailed, setAssignmentDraftSaveFailed] = useState(false);
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
  const [catDraftUnitId, setCatDraftUnitId] = useState("");
  const [catDraftRestored, setCatDraftRestored] = useState(false);
  const [catDraftSaveFailed, setCatDraftSaveFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const catDownloadInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!activeUnitId) return;
    const assignmentKey = createSessionDraftKey(userId, "facilitator-assignment", activeUnitId);
    const catKey = createSessionDraftKey(userId, "facilitator-cat", activeUnitId);
    const restoredAssignment = readSessionDraft(assignmentKey, isFacilitatorAssignmentDraft);
    const restoredCat = readSessionDraft(catKey, isFacilitatorCatDraft);
    const defaultLevelIds = activeUnitLevelId ? [activeUnitLevelId] : [];
    setAssignmentDraft(
      restoredAssignment ?? { title: "", instructions: "", dueDate: "", levelIds: defaultLevelIds },
    );
    setAssignmentDraftRestored(Boolean(restoredAssignment));
    setAssignmentDraftSaveFailed(false);
    setAssignmentDraftUnitId(activeUnitId);
    setCatDraft({
      title: restoredCat?.title ?? "",
      name: restoredCat?.name ?? "",
      instructions: restoredCat?.instructions ?? "",
      duration: restoredCat?.duration ?? "30",
      openImmediately: restoredCat?.openImmediately ?? true,
      opensAt: restoredCat?.opensAt ?? "",
      closesAt: restoredCat?.closesAt ?? "",
      levelIds: restoredCat?.levelIds ?? defaultLevelIds,
      downloadFile: null,
    });
    setQuestions(
      restoredCat?.questions.map((question) => ({
        ...question,
        sharedGroup: question.sharedGroup ?? "",
        sharedPrompt: question.sharedPrompt ?? "",
        groupPosition: question.groupPosition ?? "1",
      })) ?? [initialQuestion()],
    );
    setCatDraftRestored(Boolean(restoredCat));
    setCatDraftSaveFailed(false);
    setCatDraftUnitId(activeUnitId);
  }, [activeUnitId, activeUnitLevelId, userId]);

  useEffect(() => {
    if (!activeUnitId || assignmentDraftUnitId !== activeUnitId) return;
    const defaultLevelIds = activeUnitLevelId ? [activeUnitLevelId] : [];
    const hasDraftContent = Boolean(
      assignmentDraft.title.trim() ||
      assignmentDraft.instructions.trim() ||
      assignmentDraft.dueDate ||
      assignmentDraft.levelIds.join(",") !== defaultLevelIds.join(","),
    );
    const key = createSessionDraftKey(userId, "facilitator-assignment", activeUnitId);
    if (!hasDraftContent) {
      clearSessionDraft(key);
      setAssignmentDraftSaveFailed(false);
      return;
    }
    setAssignmentDraftSaveFailed(!writeSessionDraft(key, assignmentDraft));
  }, [activeUnitId, activeUnitLevelId, assignmentDraftUnitId, assignmentDraft, userId]);

  useEffect(() => {
    if (!activeUnitId || catDraftUnitId !== activeUnitId) return;
    const defaultLevelIds = activeUnitLevelId ? [activeUnitLevelId] : [];
    const hasDraftContent =
      Boolean(
        catDraft.title.trim() ||
        catDraft.name.trim() ||
        catDraft.instructions.trim() ||
        catDraft.duration !== "30" ||
        !catDraft.openImmediately ||
        catDraft.opensAt ||
        catDraft.closesAt ||
        catDraft.levelIds.join(",") !== defaultLevelIds.join(","),
      ) ||
      questions.some(
        (question) =>
          question.prompt ||
          question.option_a ||
          question.option_b ||
          question.option_c ||
          question.option_d ||
          question.correct_option !== "A" ||
          question.points !== 1 ||
          question.sharedGroup ||
          question.sharedPrompt,
      );
    const key = createSessionDraftKey(userId, "facilitator-cat", activeUnitId);
    if (!hasDraftContent) {
      clearSessionDraft(key);
      setCatDraftSaveFailed(false);
      return;
    }
    setCatDraftSaveFailed(
      !writeSessionDraft(key, {
        title: catDraft.title,
        name: catDraft.name,
        instructions: catDraft.instructions,
        duration: catDraft.duration,
        openImmediately: catDraft.openImmediately,
        opensAt: catDraft.opensAt,
        closesAt: catDraft.closesAt,
        levelIds: catDraft.levelIds,
        questions,
      }),
    );
  }, [activeUnitId, activeUnitLevelId, catDraftUnitId, catDraft, questions, userId]);

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
    clearSessionDraft(createSessionDraftKey(userId, "facilitator-assignment", activeUnit.unit_id));
    setAssignmentDraftRestored(false);
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
    const now = new Date();
    const opensAt = catDraft.openImmediately ? now : new Date(catDraft.opensAt);
    const closesAt = new Date(catDraft.closesAt);
    if (
      Number.isNaN(opensAt.getTime()) ||
      Number.isNaN(closesAt.getTime()) ||
      (!catDraft.openImmediately && opensAt <= now) ||
      closesAt <= opensAt
    ) {
      toast.error(
        catDraft.openImmediately
          ? `The CAT closing time must be later than now (${now.toLocaleString()}). Check your device clock and time zone, or choose a later time.`
          : "Choose a CAT opening time in the future and a closing time at least one minute after it. Times use your device's local time zone.",
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
    const groupError = validateSharedQuestionGroups(questions);
    if (groupError) {
      toast.error("Check the shared CAT questions", { description: groupError });
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
      const { error } = await supabase.rpc("create_facilitator_cat_with_groups", {
        _unit_id: activeUnit.unit_id,
        _title: catDraft.title.trim(),
        _name: catDraft.name.trim(),
        _level_ids: catDraft.levelIds,
        _instructions: catDraft.instructions.trim() || null,
        _duration_minutes: Number(catDraft.duration),
        _opens_at: catDraft.openImmediately ? null : opensAt.toISOString(),
        _closes_at: closesAt.toISOString(),
        _questions: questions.map((question) => ({
          ...question,
          shared_group: question.sharedGroup,
          shared_prompt: question.sharedPrompt,
          group_position: question.groupPosition,
        })),
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
    clearSessionDraft(createSessionDraftKey(userId, "facilitator-cat", activeUnit.unit_id));
    setCatDraftRestored(false);
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
      sharedGroup: "",
      sharedPrompt: "",
      groupPosition: "1",
    }));
    const questionOffset = starterIsBlank ? 0 : questions.length;
    setQuestions((current) =>
      starterIsBlank ? importedQuestions : [...current, ...importedQuestions],
    );
    toast.success(`${imported.length} question${imported.length === 1 ? "" : "s"} imported`);
    return questionOffset;
  }

  function applyCatMarkingScheme(answers: ImportedCatAnswer[], questionOffset: number) {
    const answersByIndex = new Map(
      answers.map((answer) => [questionOffset + answer.questionNumber - 1, answer.correctOption]),
    );
    setQuestions((current) =>
      current.map((question, index) => {
        const correct_option = answersByIndex.get(index);
        return correct_option ? { ...question, correct_option } : question;
      }),
    );
    toast.success(
      `${answers.length} marking-scheme answer${answers.length === 1 ? "" : "s"} applied`,
    );
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
    { id: "facilitator-live-classes", title: "Live classes", icon: Video },
    ...(permissions.can_manage_assignments
      ? [{ id: "facilitator-assignments", title: "Assignments", icon: ClipboardList }]
      : []),
    ...(permissions.can_manage_cats
      ? [{ id: "facilitator-cats", title: "CATs", icon: FileText }]
      : []),
    ...(permissions.can_manage_cats || permissions.can_manage_results
      ? [{ id: "facilitator-cat-performance", title: "CAT performance", icon: GraduationCap }]
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
    "facilitator-live-classes",
    "facilitator-students",
    "facilitator-inbox",
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
    <div className="portal-workspace student-app-shell student-workspace min-h-dvh bg-muted/40">
      <header className="portal-topbar student-app-header sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-border/70 bg-background/95 px-4 py-3 text-foreground backdrop-blur-xl sm:px-6">
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
        <aside className="portal-sidebar hidden border-b bg-card p-4 lg:sticky lg:top-[65px] lg:block lg:h-[calc(100vh-65px)] lg:w-64 lg:shrink-0 lg:border-b-0 lg:border-r">
          <div className="portal-identity-card rounded-2xl border bg-cream p-4">
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
          <nav
            className="portal-sidebar-nav mt-5 flex flex-col gap-1"
            aria-label="Facilitator portal"
          >
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
        <main className="portal-main student-app-content min-w-0 flex-1 p-4 pb-8 sm:p-6 lg:p-8">
          <div
            key={activeSection}
            ref={contentRef}
            className="portal-content mx-auto w-full max-w-6xl space-y-5"
          >
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
            {activeSection === "facilitator-live-classes" && (
              <FacilitatorLiveClasses
                facilitatorId={userId}
                unitId={activeUnit.unit_id}
                unitTitle={`${activeUnit.course.title} · ${activeUnit.unit.title}`}
              />
            )}
            {permissions.can_manage_assignments && activeSection === "facilitator-assignments" && (
              <section
                id="facilitator-assignments"
                className="space-y-4 rounded-xl border bg-card p-5 shadow-card"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="font-semibold text-brand">Assignments and marking</h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {assignmentsQuery.data?.length ?? 0} assignments for {activeUnit.unit.title}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() =>
                      document
                        .getElementById("facilitator-create-assignment")
                        ?.toggleAttribute("open", true)
                    }
                  >
                    <Plus className="mr-1 h-4 w-4" />
                    Create assignment
                  </Button>
                </div>
                <details
                  id="facilitator-create-assignment"
                  className="rounded-lg border bg-muted/20 p-4"
                >
                  <summary className="cursor-pointer text-sm font-semibold text-brand">
                    Assignment details
                  </summary>
                  {assignmentDraftRestored && (
                    <p role="status" className="mt-3 text-sm text-muted-foreground">
                      Your assignment draft was restored from this browser.
                    </p>
                  )}
                  {assignmentDraftSaveFailed && (
                    <p role="alert" className="mt-3 text-sm text-destructive">
                      This browser could not save your assignment draft. Keep this page open until
                      you publish it.
                    </p>
                  )}
                  <form
                    className="mt-4 grid gap-4 sm:grid-cols-2"
                    onSubmit={(event) => void createAssignment(event)}
                  >
                    <label className="grid gap-1.5 text-sm font-medium sm:col-span-2">
                      Assignment title
                      <Input
                        required
                        maxLength={160}
                        value={assignmentDraft.title}
                        onChange={(event) =>
                          setAssignmentDraft({ ...assignmentDraft, title: event.target.value })
                        }
                      />
                    </label>
                    <div className="sm:col-span-2">
                      <LevelTargetPicker
                        courseId={activeUnit.unit.course_id}
                        selectedLevelIds={assignmentDraft.levelIds}
                        onChange={(levelIds) =>
                          setAssignmentDraft({ ...assignmentDraft, levelIds })
                        }
                        allowedLevelId={activeUnit.unit.level_id}
                      />
                    </div>
                    <label className="grid gap-1.5 text-sm font-medium sm:col-span-2">
                      Instructions
                      <Textarea
                        rows={3}
                        value={assignmentDraft.instructions}
                        onChange={(event) =>
                          setAssignmentDraft({
                            ...assignmentDraft,
                            instructions: event.target.value,
                          })
                        }
                      />
                    </label>
                    <label className="grid max-w-sm gap-1.5 text-sm font-medium">
                      Due date
                      <Input
                        type="datetime-local"
                        value={assignmentDraft.dueDate}
                        onChange={(event) =>
                          setAssignmentDraft({ ...assignmentDraft, dueDate: event.target.value })
                        }
                      />
                    </label>
                    <div className="flex items-end">
                      <Button disabled={busy} loading={busy}>
                        {busy ? "Publishing…" : "Publish assignment"}
                      </Button>
                    </div>
                  </form>
                </details>
                <div className="rounded-lg border">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
                    <h3 className="text-sm font-semibold text-brand">Published assignments</h3>
                    <span className="text-xs text-muted-foreground">
                      {assignmentsQuery.data?.length ?? 0} total
                    </span>
                  </div>
                  <ul className="divide-y px-4">
                    {(assignmentsQuery.data ?? []).map((assignment) => (
                      <li
                        key={assignment.id}
                        className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm"
                      >
                        <div>
                          <p className="font-medium">{assignment.title}</p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            Due{" "}
                            {assignment.due_date
                              ? new Date(assignment.due_date).toLocaleString("en-KE")
                              : "date not set"}
                          </p>
                        </div>
                        <Badge variant={assignment.published ? "default" : "secondary"}>
                          {assignment.published ? "Published" : "Draft"}
                        </Badge>
                      </li>
                    ))}
                    {!assignmentsQuery.isLoading && !assignmentsQuery.data?.length && (
                      <li className="py-4 text-sm text-muted-foreground">
                        No assignments published for this unit yet.
                      </li>
                    )}
                  </ul>
                </div>
                {assignmentsQuery.error && (
                  <p role="alert" className="mt-2 text-sm text-destructive">
                    {assignmentsQuery.error.message}
                  </p>
                )}
                <details className="rounded-lg border bg-muted/20 p-4">
                  <summary className="cursor-pointer text-sm font-semibold text-brand">
                    Student submissions and marking
                  </summary>
                  <SubmissionsList assignments={assignmentsQuery.data ?? []} />
                </details>
              </section>
            )}
            {permissions.can_manage_cats && activeSection === "facilitator-cats" && (
              <section
                id="facilitator-cats"
                className="space-y-4 rounded-xl border bg-card p-5 shadow-card"
              >
                <div>
                  <h2 className="font-semibold text-brand">CATs</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Create and schedule timed assessments for {activeUnit.unit.title}.
                  </p>
                </div>
                {catDraftRestored && (
                  <p
                    role="status"
                    className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground"
                  >
                    Your CAT draft was restored from this browser. Please reselect any file
                    attachment.
                  </p>
                )}
                {catDraftSaveFailed && (
                  <p role="alert" className="text-sm text-destructive">
                    This browser could not save your CAT draft. Keep this page open until you
                    publish it.
                  </p>
                )}
                <details className="rounded-lg border bg-muted/20 p-4">
                  <summary className="cursor-pointer text-sm font-semibold text-brand">
                    Create a CAT · {questions.length} question{questions.length === 1 ? "" : "s"}
                  </summary>
                  <form className="mt-4 space-y-5" onSubmit={(event) => void createCat(event)}>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <label className="grid gap-1.5 text-sm font-medium">
                        CAT title
                        <Input
                          required
                          maxLength={160}
                          value={catDraft.title}
                          onChange={(event) =>
                            setCatDraft({ ...catDraft, title: event.target.value })
                          }
                        />
                      </label>
                      <label className="grid gap-1.5 text-sm font-medium">
                        Student download name
                        <Input
                          required
                          maxLength={160}
                          value={catDraft.name}
                          onChange={(event) =>
                            setCatDraft({ ...catDraft, name: event.target.value })
                          }
                        />
                      </label>
                      <LevelTargetPicker
                        courseId={activeUnit.unit.course_id}
                        selectedLevelIds={catDraft.levelIds}
                        onChange={(levelIds) => setCatDraft({ ...catDraft, levelIds })}
                        allowedLevelId={activeUnit.unit.level_id}
                      />
                      <label className="grid gap-1.5 text-sm font-medium">
                        Time limit (minutes)
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
                    </div>
                    <details className="rounded-lg border p-3">
                      <summary className="cursor-pointer text-sm font-medium">
                        Optional downloadable CAT file
                      </summary>
                      <label className="grid gap-1 text-sm font-medium">
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
                          Maximum file size: 50 MB. Attachments must be reselected after leaving or
                          reloading this page. The timed online CAT remains available separately.
                        </span>
                      </label>
                    </details>
                    <label className="grid gap-1.5 text-sm font-medium">
                      Instructions
                      <Textarea
                        rows={2}
                        value={catDraft.instructions}
                        onChange={(event) =>
                          setCatDraft({ ...catDraft, instructions: event.target.value })
                        }
                      />
                    </label>
                    <div className="rounded-lg border p-4">
                      <h3 className="text-sm font-semibold text-brand">Schedule</h3>
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
                              min={getDateTimeLocalMinimum()}
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
                            min={getDateTimeLocalMinimum(
                              catDraft.openImmediately ? undefined : catDraft.opensAt,
                            )}
                            value={catDraft.closesAt}
                            onChange={(event) =>
                              setCatDraft({ ...catDraft, closesAt: event.target.value })
                            }
                          />
                        </label>
                      </div>
                    </div>
                    <details className="rounded-lg border p-4">
                      <summary className="cursor-pointer text-sm font-semibold text-brand">
                        Questions and answer key · {questions.length}
                      </summary>
                      <div className="mt-4 space-y-3">
                        <CatQuestionImporter
                          onImport={importCatQuestions}
                          onApplyMarkingScheme={applyCatMarkingScheme}
                        />
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
                          <details key={index} className="rounded-lg border bg-background p-3">
                            <summary className="cursor-pointer text-sm font-semibold">
                              Question {index + 1}
                            </summary>
                            <fieldset className="mt-3 grid gap-2">
                              <legend className="px-1 text-sm font-semibold">
                                Question {index + 1}
                              </legend>
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
                              <CatQuestionGroupFields
                                group={question.sharedGroup}
                                prompt={question.sharedPrompt}
                                position={question.groupPosition}
                                onChange={(field, value) =>
                                  setQuestions((current) =>
                                    current.map((item, i) =>
                                      i === index ? { ...item, [field]: value } : item,
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
                                            i === index
                                              ? { ...item, [field]: event.target.value }
                                              : item,
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
                                    onClick={() =>
                                      setQuestions(questions.filter((_, i) => i !== index))
                                    }
                                  >
                                    Remove question
                                  </Button>
                                )}
                              </div>
                            </fieldset>
                          </details>
                        ))}
                      </div>
                    </details>
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
                </details>
              </section>
            )}
            {(permissions.can_manage_cats || permissions.can_manage_results) &&
              activeSection === "facilitator-cat-performance" && (
                <section
                  id="facilitator-cat-performance"
                  className="space-y-4 rounded-xl border bg-card p-5 shadow-card"
                >
                  <div>
                    <h2 className="font-semibold text-brand">CAT performance</h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Review attempts and marks for students taking CATs in {activeUnit.unit.title}.
                    </p>
                  </div>
                  <FacilitatorCatPerformance unitId={activeUnit.unit_id} />
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
        className="portal-mobile-nav student-mobile-nav fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t bg-background/95 px-2 pt-1 backdrop-blur-xl lg:hidden"
        aria-label="Facilitator app"
      >
        {mobileNavigationItems.map(({ id, title, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => selectSection(id)}
            aria-current={activeSection === id ? "page" : undefined}
            className={`portal-mobile-link flex min-w-0 flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-1 text-[10px] font-semibold ${activeSection === id ? "is-active text-brand" : "text-muted-foreground hover:text-brand"}`}
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
      className={`portal-nav-link flex shrink-0 items-center gap-2 rounded-xl px-3 py-2.5 text-sm transition ${isActive ? "is-active bg-accent font-semibold text-brand shadow-sm ring-1 ring-primary/15" : "text-muted-foreground hover:bg-muted hover:text-brand"}`}
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
