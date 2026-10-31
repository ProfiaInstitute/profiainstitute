import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BookOpen,
  Camera,
  CheckCircle2,
  ClipboardCheck,
  ClipboardList,
  Download,
  Ellipsis,
  Eye,
  EyeOff,
  FileText,
  GraduationCap,
  LogOut,
  Mail,
  Printer,
  RefreshCw,
  UserRound,
  Wallet,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { signOutWithAudit, useUser } from "@/lib/auth";
import { isAssignmentOpenForSubmission, submissionFilePaths } from "@/lib/assignments";
import { downloadContentAttachment } from "@/lib/content-download";
import { StudentCatsSection } from "@/components/student/StudentCatsSection";
import { formatKES } from "@/lib/site";
import { useScrollReveal } from "@/lib/motion";
import type { Database, Tables } from "@/integrations/supabase/types";
import { InstallAppButton } from "@/components/site/InstallAppButton";
import { NotificationBell } from "@/components/site/NotificationBell";
import { PasswordResetPage } from "@/components/auth/PasswordResetPage";
import { FeeStructureActions } from "@/components/site/FeeStructureActions";
import { SubmissionFileDownloads } from "@/components/academics/SubmissionFileDownloads";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ProfilePhotoAvatar } from "@/components/profile/ProfilePhotoAvatar";
import {
  fetchProfilePhotos,
  PROFILE_PHOTO_MAX_BYTES,
  PROFILE_PHOTO_TYPES,
  type ProfilePhoto,
} from "@/lib/profile-photos";

type PortalSection =
  | "overview"
  | "online"
  | "learning"
  | "assignments"
  | "cats"
  | "results"
  | "fees"
  | "progression"
  | "feedback"
  | "messages"
  | "profile";
type Student = Tables<"students">;
const selectClass = "h-9 rounded-md border border-input bg-background px-3 text-sm";
type StudentCourse = {
  course_id: string;
  title: string;
  duration: string | null;
  level_id: string | null;
  modes: string[];
  statuses: string[];
};

async function fetchStudentCourses(student: Student): Promise<StudentCourse[]> {
  const [academic, online] = await Promise.all([
    supabase.from("enrollments").select("course_id,level_id,status").eq("student_id", student.id),
    supabase
      .from("online_course_enrollments")
      .select("course_id,level_id,status")
      .eq("student_id", student.id),
  ]);
  if (academic.error) throw academic.error;
  if (online.error) throw online.error;

  const enrollments = new Map<
    string,
    { course_id: string; level_id: string | null; modes: Set<string>; statuses: Set<string> }
  >();
  const addEnrollment = (
    courseId: string,
    levelId: string | null,
    mode: string,
    status: string,
  ) => {
    const row = enrollments.get(courseId) ?? {
      course_id: courseId,
      level_id: null,
      modes: new Set<string>(),
      statuses: new Set<string>(),
    };
    if (status === "active" && levelId) row.level_id = levelId;
    row.modes.add(mode);
    row.statuses.add(status);
    enrollments.set(courseId, row);
  };
  for (const enrollment of academic.data ?? [])
    addEnrollment(enrollment.course_id, enrollment.level_id, "Academic", enrollment.status);
  for (const enrollment of online.data ?? [])
    addEnrollment(enrollment.course_id, enrollment.level_id, "Online", enrollment.status);
  if (student.course_id && !enrollments.has(student.course_id)) {
    enrollments.set(student.course_id, {
      course_id: student.course_id,
      level_id: student.level_id,
      modes: new Set([student.study_mode === "online" ? "Online" : "Academic"]),
      statuses: new Set(["assigned"]),
    });
  }

  const courseIds = [...enrollments.keys()];
  if (!courseIds.length) return [];
  const { data: courses, error: coursesError } = await supabase
    .from("courses")
    .select("id,title,duration")
    .in("id", courseIds);
  if (coursesError) throw coursesError;
  const courseById = new Map(courses.map((course) => [course.id, course]));
  return [...enrollments.values()].map((enrollment) => ({
    ...enrollment,
    title: courseById.get(enrollment.course_id)?.title ?? "Course no longer available",
    duration: courseById.get(enrollment.course_id)?.duration ?? null,
    modes: [...enrollment.modes],
    statuses: [...enrollment.statuses],
  }));
}

export function StudentPortal({ selectedCourseId }: { selectedCourseId: string | null }) {
  const { user, loading, error: sessionError } = useUser();
  const [section, setSection] = useState<PortalSection>("overview");
  const [enrollmentPhone, setEnrollmentPhone] = useState("");
  const [passwordReset, setPasswordReset] = useState(
    () =>
      typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).get("resetPassword") === "1",
  );

  if (passwordReset) {
    return (
      <PasswordResetPage
        destination="/student"
        onComplete={() => {
          window.history.replaceState({}, "", "/student");
          setPasswordReset(false);
        }}
      />
    );
  }

  if (loading) return <PortalMessage title="Loading student portal…" />;
  if (sessionError)
    return (
      <PortalMessage
        title="Could not load your sign-in session"
        detail={sessionError.message}
        retry={() => window.location.reload()}
      />
    );
  if (!user)
    return (
      <StudentSignIn selectedCourseId={selectedCourseId} onEnrollmentPhone={setEnrollmentPhone} />
    );

  return (
    <StudentWorkspace
      userId={user.id}
      email={user.email ?? ""}
      section={section}
      onSection={setSection}
      selectedCourseId={selectedCourseId}
      enrollmentPhone={enrollmentPhone || String(user.user_metadata?.["phone"] ?? "")}
      onEnrollmentPhone={setEnrollmentPhone}
    />
  );
}

function StudentAnnouncements({ studentId }: { studentId: string }) {
  const announcementsQuery = useQuery({
    queryKey: ["student-announcements", studentId],
    queryFn: async () => {
      const now = new Date().toISOString();
      const { data, error } = await supabase
        .from("announcements")
        .select(
          "id, title, category, starts_at, ends_at, attachment_url, attachment_file_name, cta_label, cta_url",
        )
        .eq("published", true)
        .eq("show_to_students", true)
        .or(`starts_at.is.null,starts_at.lte.${now}`)
        .or(`ends_at.is.null,ends_at.gt.${now}`)
        .order("created_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 60_000,
    refetchInterval: 60_000,
  });

  if (
    announcementsQuery.isLoading ||
    (!announcementsQuery.data?.length && !announcementsQuery.error)
  )
    return null;

  return (
    <section
      className="student-announcement-strip flex h-11 items-center gap-3 overflow-hidden border-b bg-brand-deep px-4 text-brand-foreground sm:px-6"
      aria-label="Student notices and memos"
    >
      {announcementsQuery.error ? (
        <div className="flex min-w-0 items-center gap-3 text-xs" role="alert">
          <strong className="shrink-0 uppercase tracking-wide text-primary">Notices</strong>
          <span>Student notices could not be loaded.</span>
          <button
            type="button"
            className="shrink-0 font-semibold underline"
            onClick={() => void announcementsQuery.refetch()}
          >
            Try again
          </button>
        </div>
      ) : (
        <>
          <strong className="shrink-0 text-[10px] font-bold uppercase tracking-wider text-primary sm:text-xs">
            Notices & memos
          </strong>
          <div
            className="announcement-marquee min-w-0 flex-1"
            role="region"
            aria-label="Student notices"
            tabIndex={0}
          >
            <div className="announcement-marquee-track">
              {[0, 1].map((copy) => (
                <div
                  key={copy}
                  className="announcement-marquee-content gap-6 pr-6 text-xs sm:text-sm"
                  aria-hidden={copy === 1 ? true : undefined}
                >
                  {announcementsQuery.data?.map((item) => (
                    <span key={`${copy}-${item.id}`} className="flex shrink-0 items-center gap-2">
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                      {item.category === "memo" && (
                        <strong className="uppercase text-primary">Memo:</strong>
                      )}
                      <span>{item.title}</span>
                      {item.category === "memo" && item.attachment_url && (
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 font-semibold text-primary underline underline-offset-2"
                          tabIndex={copy === 1 ? -1 : undefined}
                          onClick={async () => {
                            try {
                              await downloadContentAttachment(
                                item.attachment_url!,
                                item.attachment_file_name || item.title,
                              );
                            } catch (error) {
                              toast.error("Could not download memo", {
                                description: error instanceof Error ? error.message : undefined,
                              });
                            }
                          }}
                        >
                          <Download className="h-3.5 w-3.5" />
                          Download
                        </button>
                      )}
                      {item.category !== "memo" && item.cta_label && item.cta_url && (
                        <a
                          href={item.cta_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          tabIndex={copy === 1 ? -1 : undefined}
                          className="font-semibold text-primary underline underline-offset-2"
                        >
                          {item.cta_label}
                        </a>
                      )}
                    </span>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </section>
  );
}

function StudentSignIn({
  selectedCourseId,
  onEnrollmentPhone,
}: {
  selectedCourseId: string | null;
  onEnrollmentPhone: (phone: string) => void;
}) {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [recoveryBusy, setRecoveryBusy] = useState(false);

  async function sendPasswordReset() {
    if (!email.trim()) {
      setError("Enter your email address first.");
      return;
    }
    setRecoveryBusy(true);
    setError("");
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/student?resetPassword=1`,
    });
    setRecoveryBusy(false);
    if (resetError) setError(resetError.message);
    else
      toast.success("Password reset email sent", {
        description: "Check your inbox for the reset link.",
      });
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    if (selectedCourseId && !/^\+?[0-9 ]{9,15}$/.test(phone.trim())) {
      setBusy(false);
      setError("Enter a valid mobile number for course enrollment and payments.");
      return;
    }
    const result =
      mode === "signin"
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({
            email,
            password,
            options: {
              data: { full_name: name.trim(), phone: phone.trim() },
              emailRedirectTo: `${window.location.origin}/student${selectedCourseId ? `?course=${encodeURIComponent(selectedCourseId)}` : ""}`,
            },
          });
    setBusy(false);
    if (result.error) setError(result.error.message);
    else if (mode === "signup" && !result.data.session)
      toast.success("Check your email to confirm your account, then return to enroll.");
    else toast.success(mode === "signup" ? "Account created" : "Welcome back");
    if (!result.error && selectedCourseId) onEnrollmentPhone(phone.trim());
  }

  return (
    <div className="min-h-screen bg-muted/50">
      <header className="flex h-16 items-center justify-between border-b bg-background px-4 sm:px-8">
        <a href="/" className="flex items-center gap-2.5" aria-label="Profia Institute home">
          <img src="/images/logo.png" alt="" className="h-10 w-auto" />
          <span>
            <span className="block text-sm font-extrabold leading-tight text-brand">PROFIA</span>
            <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Institute of Professionals
            </span>
          </span>
        </a>
        <a href="/" className="text-sm font-semibold text-brand hover:text-primary">
          ← Back to website
        </a>
      </header>
      <main className="container-site grid min-h-[calc(100vh-4rem)] items-center gap-10 py-8 lg:grid-cols-[1fr_28rem] lg:py-12">
        <section className="relative hidden min-h-[34rem] overflow-hidden rounded-3xl bg-brand text-brand-foreground shadow-card lg:block">
          <img
            src="/images/profia_school.webp"
            alt="Students learning at Profia Institute"
            className="absolute inset-0 h-full w-full object-cover"
          />
          <div className="absolute inset-0 bg-hero-overlay" />
          <div className="absolute inset-x-0 bottom-0 p-10">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">
              Learn · Grow · Succeed
            </p>
            <h2 className="mt-3 max-w-lg text-4xl font-extrabold leading-tight">
              Your learning journey, all in one place.
            </h2>
            <p className="mt-4 max-w-md leading-7 text-white/80">
              Access your courses, learning materials, assignments, results and student services.
            </p>
          </div>
        </section>
        <form
          onSubmit={submit}
          className="mx-auto w-full max-w-md space-y-5 rounded-2xl border bg-card p-7 shadow-lift sm:p-9"
        >
          <div>
            <p className="eyebrow">Profia student services</p>
            <h1 className="mt-2 text-2xl font-bold text-brand">
              {mode === "signin" ? "Student sign in" : "Create student account"}
            </h1>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Existing students can link their record using its registered email. New learners can
              create an account here and will receive an online student record when they enroll.
            </p>
          </div>
          {mode === "signup" && (
            <label className="block space-y-1.5 text-sm font-medium">
              Full name
              <Input
                required
                autoComplete="name"
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </label>
          )}
          {selectedCourseId && (
            <label className="block space-y-1.5 text-sm font-medium">
              Mobile money phone number
              <Input
                type="tel"
                required
                autoComplete="tel"
                placeholder="07xx xxx xxx"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
              />
            </label>
          )}
          <label className="block space-y-1.5 text-sm font-medium">
            Email
            <Input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
          <label className="block space-y-1.5 text-sm font-medium">
            Password
            <span className="relative block">
              <Input
                type={showPassword ? "text" : "password"}
                required
                minLength={8}
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="pr-11"
              />
              <button
                type="button"
                className="absolute inset-y-0 right-0 grid w-11 place-items-center text-muted-foreground"
                aria-label={showPassword ? "Hide password" : "Show password"}
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </span>
          </label>
          {mode === "signin" && (
            <button
              type="button"
              className="text-sm font-semibold text-primary underline"
              disabled={recoveryBusy}
              onClick={() => void sendPasswordReset()}
            >
              {recoveryBusy ? "Sending reset link…" : "Forgot password?"}
            </button>
          )}
          {error && (
            <p
              role="alert"
              className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
            >
              {error}
            </p>
          )}
          <Button className="w-full" disabled={busy} loading={busy}>
            {busy ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}
          </Button>
          <button
            type="button"
            className="w-full text-sm font-medium text-primary hover:underline"
            onClick={() => {
              setError("");
              setMode(mode === "signin" ? "signup" : "signin");
            }}
          >
            {mode === "signin"
              ? "New to the student portal? Create an account"
              : "Already have an account? Sign in"}
          </button>
        </form>
      </main>
    </div>
  );
}

function StudentWorkspace({
  userId,
  email,
  section,
  onSection,
  selectedCourseId,
  enrollmentPhone,
  onEnrollmentPhone,
}: {
  userId: string;
  email: string;
  section: PortalSection;
  onSection: (section: PortalSection) => void;
  selectedCourseId: string | null;
  enrollmentPhone: string;
  onEnrollmentPhone: (phone: string) => void;
}) {
  const queryClient = useQueryClient();
  const [phoneDraft, setPhoneDraft] = useState(enrollmentPhone);
  const [activeCourseId, setActiveCourseId] = useState<string | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const contentRef = useRef<HTMLDivElement>(null);
  const profilePhotoQuery = useQuery({
    queryKey: ["profile-photo", userId],
    queryFn: async () => (await fetchProfilePhotos([userId])).get(userId) ?? null,
    staleTime: 50 * 60_000,
  });
  useEffect(() => setPhoneDraft(enrollmentPhone), [enrollmentPhone]);
  useEffect(() => {
    const updateOnlineStatus = () => setIsOnline(navigator.onLine);
    updateOnlineStatus();
    window.addEventListener("online", updateOnlineStatus);
    window.addEventListener("offline", updateOnlineStatus);
    return () => {
      window.removeEventListener("online", updateOnlineStatus);
      window.removeEventListener("offline", updateOnlineStatus);
    };
  }, []);
  const studentQuery = useQuery({
    queryKey: ["student", "record", userId, selectedCourseId, enrollmentPhone],
    enabled: !selectedCourseId || Boolean(enrollmentPhone),
    queryFn: async () => {
      let claimedId: string | null;
      if (selectedCourseId) {
        const phone = enrollmentPhone;
        if (!phone) throw new Error("Enter your mobile money phone number to finish enrollment.");
        const { data, error: enrollError } = await supabase.rpc("enroll_online_course", {
          _course_id: selectedCourseId,
          _phone: phone,
        });
        if (enrollError) throw enrollError;
        claimedId = data?.[0]?.student_id ?? null;
      } else {
        const { data, error: claimError } = await supabase.rpc("claim_student_record");
        if (claimError) throw claimError;
        claimedId = data;
      }
      if (!claimedId) return null;
      const { data, error } = await supabase
        .from("students")
        .select("*")
        .eq("id", claimedId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const studentCoursesQuery = useQuery({
    queryKey: ["student", "course-enrollments", studentQuery.data?.id],
    enabled: Boolean(studentQuery.data?.id),
    queryFn: async () => {
      if (!studentQuery.data) throw new Error("Student record is not available.");
      return fetchStudentCourses(studentQuery.data);
    },
    staleTime: 20_000,
    refetchInterval: 30_000,
  });
  const accessibleCourses = (studentCoursesQuery.data ?? []).filter(
    (course) => course.statuses.includes("active") || course.statuses.includes("assigned"),
  );
  const activeCourse =
    accessibleCourses.find((course) => course.course_id === activeCourseId) ??
    accessibleCourses.find((course) => course.course_id === selectedCourseId) ??
    accessibleCourses.find((course) => course.course_id === studentQuery.data?.course_id) ??
    accessibleCourses[0] ??
    null;
  useEffect(() => {
    if (activeCourse && activeCourse.course_id !== activeCourseId) {
      setActiveCourseId(activeCourse.course_id);
    }
  }, [activeCourse, activeCourseId]);
  useEffect(() => {
    if (
      studentQuery.data?.study_mode === "online" &&
      !["overview", "online", "fees", "progression", "feedback", "messages", "profile"].includes(
        section,
      )
    ) {
      onSection("overview");
    }
  }, [onSection, section, studentQuery.data?.study_mode]);
  useScrollReveal(contentRef, `${section}:${studentQuery.data?.id ?? ""}`, true);

  function submitEnrollmentPhone(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const phone = phoneDraft.trim();
    if (!/^\+?[0-9 ]{9,15}$/.test(phone)) {
      toast.error("Enter a valid mobile number for course enrollment and payments.");
      return;
    }
    onEnrollmentPhone(phone);
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

  if (selectedCourseId && !enrollmentPhone) {
    return (
      <PortalMessage
        title="Mobile number needed to enroll"
        detail="Enter the mobile money number that should be linked to your online course enrollment."
        action={
          <form onSubmit={submitEnrollmentPhone} className="mt-4 flex flex-col gap-3 sm:flex-row">
            <Input
              type="tel"
              required
              autoComplete="tel"
              placeholder="07xx xxx xxx"
              value={phoneDraft}
              onChange={(event) => setPhoneDraft(event.target.value)}
            />
            <Button type="submit">Continue enrollment</Button>
          </form>
        }
      />
    );
  }

  if (studentQuery.isLoading) return <PortalMessage title="Linking your student record…" />;
  if (studentQuery.error)
    return (
      <PortalMessage
        title="Could not load your student record"
        detail={studentQuery.error.message}
        retry={() => studentQuery.refetch()}
      />
    );
  if (!studentQuery.data) {
    return (
      <PortalMessage
        title="Student record not linked"
        detail="No existing student record was found for this account. New learners can enroll in an online course to create their student record automatically."
        action={
          <div className="flex flex-wrap gap-2">
            <Button asChild>
              <a href="/online-courses">Browse online courses</a>
            </Button>
            <Button variant="outline" onClick={() => void signOut()}>
              <LogOut /> Sign out
            </Button>
          </div>
        }
      />
    );
  }

  const student = studentQuery.data;
  if (student.status === "suspended") {
    return (
      <PortalMessage
        title="Portal access is suspended"
        detail="Please contact the Institute administration for assistance."
        action={
          <Button variant="outline" onClick={() => void signOut()}>
            <LogOut /> Sign out
          </Button>
        }
      />
    );
  }

  const pageTitle: Record<PortalSection, string> = {
    overview: "My dashboard",
    online: "My online courses",
    learning: "Learning materials",
    assignments: "Assignments",
    cats: "CATs",
    results: "My results",
    fees: "Fees & payments",
    progression: "Course levels",
    feedback: "Course feedback",
    messages: "Messages",
    profile: "My profile",
  };
  const links: { id: PortalSection; title: string; icon: typeof BookOpen }[] = [
    { id: "overview", title: "Overview", icon: GraduationCap },
    { id: "online", title: "My online courses", icon: BookOpen },
    { id: "learning", title: "Learning materials", icon: BookOpen },
    { id: "assignments", title: "Assignments", icon: ClipboardList },
    { id: "cats", title: "CATs", icon: ClipboardCheck },
    { id: "results", title: "Results", icon: FileText },
    { id: "fees", title: "Fees", icon: Wallet },
    { id: "progression", title: "Levels & units", icon: GraduationCap },
    { id: "feedback", title: "Feedback", icon: ClipboardCheck },
    { id: "messages", title: "Messages", icon: Mail },
    { id: "profile", title: "My profile", icon: UserRound },
  ];
  const onlineOnly = student.study_mode === "online";
  const visibleLinks = links.filter(
    ({ id }) =>
      !onlineOnly ||
      ["overview", "online", "fees", "progression", "feedback", "messages", "profile"].includes(id),
  );
  const linkGroups: { title: string; ids: PortalSection[] }[] = [
    {
      title: onlineOnly ? "Online learning" : "Learning",
      ids: [
        "overview",
        "online",
        "learning",
        "assignments",
        "cats",
        "results",
        "progression",
        "feedback",
        "messages",
      ],
    },
    { title: "Account", ids: ["fees", "profile"] },
  ];
  const visibleGroups = linkGroups
    .map((group) => ({
      ...group,
      ids: group.ids.filter((id) => visibleLinks.some((link) => link.id === id)),
    }))
    .filter((group) => group.ids.length > 0);
  const mobileLinks: PortalSection[] = onlineOnly
    ? ["overview", "online", "fees"]
    : ["overview", "online", "assignments", "fees"];
  const mobileLabels: Partial<Record<PortalSection, string>> = {
    overview: "Home",
    online: "Courses",
    assignments: "Tasks",
  };

  return (
    <div className="student-app-shell student-workspace min-h-screen bg-muted/40">
      <header className="student-app-header sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-border/70 bg-background/95 px-4 py-3 text-foreground shadow-sm backdrop-blur sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <a
            href="/"
            className="flex shrink-0 items-center gap-2.5"
            aria-label="Profia Institute home"
          >
            <img src="/images/logo.png" alt="" className="h-10 w-auto" />
            <span className="hidden sm:inline">
              <span className="block text-sm font-extrabold leading-tight text-brand">PROFIA</span>
              <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Student services
              </span>
            </span>
          </a>
          <span aria-hidden="true" className="text-border">
            /
          </span>
          <span className="truncate text-sm font-semibold text-foreground">
            {pageTitle[section]}
          </span>
        </div>
        <div className="flex items-center gap-3">
          {!onlineOnly && accessibleCourses.length > 1 && (
            <label className="hidden items-center gap-2 text-xs font-medium sm:flex">
              <span className="sr-only">Active course</span>
              <select
                aria-label="Active course"
                className={`${selectClass} max-w-56`}
                value={activeCourse?.course_id ?? ""}
                onChange={(event) => setActiveCourseId(event.target.value)}
              >
                {accessibleCourses.map((course) => (
                  <option key={course.course_id} value={course.course_id}>
                    {course.title}
                  </option>
                ))}
              </select>
            </label>
          )}
          <NotificationBell
            userId={userId}
            onNavigate={(category) =>
              onSection(
                category === "messages"
                  ? "messages"
                  : category === "student_feedback"
                    ? "feedback"
                    : category === "academics"
                      ? "progression"
                      : category === "fees"
                        ? "fees"
                        : category === "results"
                          ? "results"
                          : "overview",
              )
            }
          />
          <span
            className={`hidden items-center gap-1.5 text-xs sm:inline-flex ${isOnline ? "text-muted-foreground" : "text-orange-700"}`}
            role="status"
          >
            <span
              aria-hidden="true"
              className={`h-2 w-2 rounded-full ${isOnline ? "bg-emerald-500" : "bg-orange-500"}`}
            />
            {isOnline ? "Online" : "Offline"}
          </span>
          <InstallAppButton />
          <Button size="sm" variant="outline" onClick={() => void signOut()}>
            <LogOut />
            <span className="hidden sm:inline">Sign out</span>
          </Button>
        </div>
      </header>
      {profilePhotoQuery.error && (
        <div
          className="flex flex-wrap items-center justify-center gap-2 border-b border-destructive/20 bg-destructive/5 px-4 py-2 text-sm text-destructive"
          role="alert"
        >
          Could not load your profile photo.{" "}
          <button
            type="button"
            className="font-semibold underline"
            onClick={() => void profilePhotoQuery.refetch()}
          >
            Retry
          </button>
        </div>
      )}
      {!isOnline && (
        <div
          className="border-b border-orange-200 bg-orange-50 px-4 py-2 text-center text-sm text-orange-900"
          role="status"
        >
          You're offline. Reconnect to refresh your student information.
        </div>
      )}
      {!onlineOnly && accessibleCourses.length > 1 && (
        <div className="border-b bg-card px-4 py-2 sm:hidden">
          <label className="flex items-center gap-2 text-xs font-medium">
            Course materials for
            <select
              aria-label="Course materials for"
              className={`${selectClass} min-w-0 flex-1`}
              value={activeCourse?.course_id ?? ""}
              onChange={(event) => setActiveCourseId(event.target.value)}
            >
              {accessibleCourses.map((course) => (
                <option key={course.course_id} value={course.course_id}>
                  {course.title}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
      <StudentAnnouncements studentId={student.id} />
      <div className="mx-auto flex max-w-7xl flex-col lg:flex-row">
        <aside className="hidden border-b bg-card p-4 lg:sticky lg:top-[65px] lg:block lg:h-[calc(100vh-65px)] lg:w-64 lg:shrink-0 lg:border-b-0 lg:border-r">
          <div className="hidden rounded-xl border bg-cream p-4 lg:block">
            <p className="text-xs font-semibold uppercase tracking-wide text-primary">My account</p>
            <ProfilePhotoAvatar
              src={profilePhotoQuery.data?.url}
              name={`${student.first_name} ${student.last_name}`}
              className="mt-4 h-12 w-12 rounded-xl"
            />
            <p className="mt-1 font-semibold text-brand">
              {student.first_name} {student.last_name}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Student no. {student.student_number}
            </p>
          </div>
          <nav
            className="flex gap-1 overflow-x-auto lg:mt-5 lg:flex-col lg:gap-4"
            aria-label="Student portal"
          >
            {visibleGroups.map((group) => (
              <div key={group.title} className="flex shrink-0 gap-1 lg:flex-col">
                <p className="hidden px-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground lg:block">
                  {group.title}
                </p>
                {visibleLinks
                  .filter((link) => group.ids.includes(link.id))
                  .map(({ id, title, icon: Icon }) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => onSection(id)}
                      aria-current={section === id ? "page" : undefined}
                      className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${section === id ? "bg-accent text-brand shadow-sm ring-1 ring-primary/15" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
                    >
                      <Icon className="h-4 w-4" />
                      {title}
                    </button>
                  ))}
              </div>
            ))}
          </nav>
        </aside>
        <main className="student-app-content min-w-0 flex-1 p-4 pb-8 sm:p-6 lg:p-8">
          <div
            key={section}
            ref={contentRef}
            className="dashboard-section-transition mx-auto max-w-5xl"
          >
            <p className="eyebrow">Student services / {student.student_number}</p>
            <h1 className="mb-6 mt-1 text-2xl font-bold text-brand sm:text-3xl">
              {pageTitle[section]}
            </h1>
            {section === "overview" &&
              (onlineOnly ? (
                <OnlineStudentOverview student={student} onNavigate={onSection} />
              ) : (
                <StudentOverview
                  student={student}
                  onNavigate={onSection}
                  activeCourseId={activeCourse?.course_id ?? null}
                  onCourseChange={setActiveCourseId}
                />
              ))}
            {section === "online" && <OnlineCoursesSection student={student} />}
            {section === "learning" && (
              <LearningSection courseId={activeCourse?.course_id ?? null} />
            )}
            {section === "assignments" && (
              <AssignmentsSection student={student} courseId={activeCourse?.course_id ?? null} />
            )}
            {section === "cats" && (
              <StudentCatsSection
                courseId={activeCourse?.course_id ?? null}
                kasnebNumber={student.kasneb_number}
              />
            )}
            {section === "results" && <ResultsSection studentId={student.id} />}
            {section === "fees" && (
              <FeesSection
                studentId={student.id}
                studentNumber={student.student_number}
                userId={userId}
              />
            )}
            {section === "progression" && <StudentProgressionSection student={student} />}
            {section === "feedback" && <StudentFeedbackSection studentId={student.id} />}
            {section === "messages" && (
              <StudentMessagesSection studentId={student.id} userId={userId} />
            )}
            {section === "profile" && (
              <ProfileSection
                student={student}
                userId={userId}
                photo={profilePhotoQuery.data ?? null}
                photoError={profilePhotoQuery.error}
                refresh={() => {
                  void Promise.all([
                    queryClient.invalidateQueries({ queryKey: ["student", "record", userId] }),
                    queryClient.invalidateQueries({ queryKey: ["profile-photo", userId] }),
                  ]);
                }}
              />
            )}
          </div>
        </main>
      </div>
      <nav
        className="student-mobile-nav fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t bg-background/95 px-2 pt-1 shadow-[0_-8px_24px_-16px_rgba(20,10,10,0.35)] backdrop-blur-lg lg:hidden"
        aria-label="Student app"
      >
        {mobileLinks.map((id) => {
          const link = links.find((item) => item.id === id);
          if (!link) return null;
          const Icon = link.icon;
          return (
            <button
              key={id}
              type="button"
              onClick={() => onSection(id)}
              aria-current={section === id ? "page" : undefined}
              className={`flex min-w-0 flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-1 text-[10px] font-semibold ${section === id ? "text-brand" : "text-muted-foreground"}`}
            >
              <Icon className="h-5 w-5" />
              <span className="max-w-full truncate">{mobileLabels[id] ?? link.title}</span>
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => setMoreOpen(true)}
          aria-haspopup="dialog"
          aria-expanded={moreOpen}
          className={`flex min-w-0 flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-1 text-[10px] font-semibold ${moreOpen || !mobileLinks.includes(section) ? "text-brand" : "text-muted-foreground"}`}
        >
          <Ellipsis className="h-5 w-5" />
          <span>More</span>
        </button>
      </nav>
      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent side="bottom" className="student-more-sheet rounded-t-3xl">
          <SheetHeader className="mb-5 pr-8 text-left">
            <SheetTitle>More student services</SheetTitle>
            <SheetDescription>Learning tools and account settings</SheetDescription>
          </SheetHeader>
          <div className="grid grid-cols-2 gap-3 pb-2">
            {visibleLinks
              .filter((link) => !mobileLinks.includes(link.id))
              .map(({ id, title, icon: Icon }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => {
                    onSection(id);
                    setMoreOpen(false);
                  }}
                  className={`flex min-h-16 items-center gap-3 rounded-2xl border p-4 text-left text-sm font-semibold ${section === id ? "border-brand bg-brand/5 text-brand" : "bg-card hover:bg-muted"}`}
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

function StudentOverview({
  student,
  onNavigate,
  activeCourseId,
  onCourseChange,
}: {
  student: Student;
  onNavigate: (section: PortalSection) => void;
  activeCourseId: string | null;
  onCourseChange: (courseId: string) => void;
}) {
  const coursesQuery = useQuery({
    queryKey: ["student", "course-enrollments", student.id],
    queryFn: () => fetchStudentCourses(student),
    staleTime: 20_000,
    refetchInterval: 30_000,
  });
  const selectedCourse = coursesQuery.data?.find((course) => course.course_id === activeCourseId);
  const selectedLevelId =
    selectedCourse?.level_id ?? (activeCourseId === student.course_id ? student.level_id : null);
  const levelQuery = useQuery({
    queryKey: ["student", "course-level", selectedLevelId],
    enabled: Boolean(selectedLevelId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("course_levels")
        .select(
          "id,name,code,total_fee,fee_structure_url,fee_structure_path,fee_structure_file_name",
        )
        .eq("id", selectedLevelId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const levelUnits = useQuery({
    queryKey: ["student", "course-level-units", selectedLevelId],
    enabled: Boolean(selectedLevelId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("course_units")
        .select("id,code,title,semester")
        .eq("level_id", selectedLevelId!)
        .order("sort_order")
        .order("title");
      if (error) throw error;
      return data;
    },
  });
  const [results, fees, payments, assignments] = [
    useQuery({
      queryKey: ["student", "results", student.id],
      queryFn: async () => {
        const { data, error } = await supabase
          .from("results")
          .select("id")
          .eq("student_id", student.id)
          .eq("published", true);
        if (error) throw error;
        return data;
      },
    }),
    useQuery({
      queryKey: ["student", "fee-total", student.id],
      queryFn: async () => {
        const { data, error } = await supabase
          .from("fees")
          .select("amount")
          .eq("student_id", student.id);
        if (error) throw error;
        return data;
      },
    }),
    useQuery({
      queryKey: ["student", "payment-total", student.id],
      queryFn: async () => {
        const { data, error } = await supabase
          .from("payments")
          .select("amount")
          .eq("student_id", student.id)
          .eq("status", "confirmed");
        if (error) throw error;
        return data;
      },
    }),
    useQuery({
      queryKey: ["student", "assignments", student.id, activeCourseId],
      enabled: !!activeCourseId,
      queryFn: async () => {
        const { data, error } = await supabase
          .from("assignments")
          .select("id")
          .eq("course_id", activeCourseId!)
          .eq("published", true);
        if (error) throw error;
        return data;
      },
    }),
  ];
  const balance =
    (fees.data ?? []).reduce((sum, row) => sum + Number(row.amount), 0) -
    (payments.data ?? []).reduce((sum, row) => sum + Number(row.amount), 0);
  const metrics = [
    {
      title: "Courses",
      value: coursesQuery.isLoading ? "…" : String(coursesQuery.data?.length ?? 0),
      icon: BookOpen,
    },
    {
      title: "Results published",
      value: results.isLoading ? "…" : String(results.data?.length ?? 0),
      icon: FileText,
    },
    {
      title: "Assignments",
      value: assignments.isLoading ? "…" : String(assignments.data?.length ?? 0),
      icon: ClipboardList,
    },
    {
      title: "Fee balance",
      value: fees.isLoading || payments.isLoading ? "…" : (formatKES(balance) ?? "KES 0"),
      icon: Wallet,
    },
  ];
  const navMap: PortalSection[] = ["online", "results", "assignments", "fees"];
  return (
    <div className="space-y-6">
      <section
        data-scroll-reveal
        className="rounded-2xl bg-gradient-brand p-6 text-brand-foreground shadow-card sm:p-8"
      >
        <p className="text-sm font-semibold text-brand-foreground/75">
          Student number · {student.student_number}
        </p>
        <h2 className="mt-2 text-2xl font-bold sm:text-3xl">Welcome, {student.first_name}</h2>
        <p className="mt-2 text-sm text-brand-foreground/80">
          {coursesQuery.data?.length
            ? `${coursesQuery.data.length} course${coursesQuery.data.length === 1 ? "" : "s"} enrolled`
            : "Your student information and learning services"}
        </p>
      </section>
      <section data-scroll-reveal className="rounded-xl border bg-card p-5 shadow-card">
        <h3 className="font-semibold text-brand">Your courses</h3>
        {coursesQuery.isLoading ? (
          <p className="mt-2 text-sm text-muted-foreground">Loading course enrolments…</p>
        ) : coursesQuery.error ? (
          <p role="alert" className="mt-2 text-sm text-destructive">
            Could not load all your courses: {coursesQuery.error.message}
          </p>
        ) : coursesQuery.data?.length ? (
          <ul className="mt-3 divide-y">
            {coursesQuery.data.map((course) => (
              <li
                key={course.course_id}
                className="flex flex-wrap items-center justify-between gap-2 py-3"
              >
                <div>
                  <p className="font-medium">{course.title}</p>
                  {course.duration && (
                    <p className="text-xs text-muted-foreground">{course.duration}</p>
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {course.modes.map((mode) => (
                    <Badge key={`${course.course_id}-${mode}`} variant="outline">
                      {mode}
                    </Badge>
                  ))}
                  {course.statuses.map((status) => (
                    <Badge key={`${course.course_id}-${status}`} variant="secondary">
                      {status.replaceAll("_", " ")}
                    </Badge>
                  ))}
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant={course.course_id === activeCourseId ? "secondary" : "outline"}
                  disabled={
                    !course.statuses.includes("active") && !course.statuses.includes("assigned")
                  }
                  onClick={() => onCourseChange(course.course_id)}
                >
                  {course.course_id === activeCourseId ? "Selected course" : "View course"}
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">No course enrolments are recorded.</p>
        )}
      </section>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map(({ title, value, icon: Icon }, index) => (
          <button
            key={title}
            type="button"
            data-scroll-reveal
            onClick={() => {
              const destination = navMap[index];
              if (destination) onNavigate(destination);
            }}
            className="rounded-xl border bg-card p-5 text-left shadow-card"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent text-primary">
              <Icon className="h-4 w-4" />
            </span>
            <p className="mt-4 text-sm text-muted-foreground">{title}</p>
            <p className="mt-1 truncate font-semibold text-brand">{value}</p>
          </button>
        ))}
      </div>
      {selectedLevelId && (
        <section data-scroll-reveal className="rounded-xl border bg-card p-5 shadow-card">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="font-semibold text-brand">
                {selectedCourse?.title ? `${selectedCourse.title} level` : "Your course level"}
              </h3>
              {levelQuery.isLoading ? (
                <p className="mt-2 text-sm text-muted-foreground">Loading your level…</p>
              ) : levelQuery.error ? (
                <p role="alert" className="mt-2 text-sm text-destructive">
                  Could not load your course level: {levelQuery.error.message}
                </p>
              ) : (
                <p className="mt-1 text-lg font-semibold">
                  {levelQuery.data?.name ?? "Course level"}
                  {levelQuery.data?.code ? ` · ${levelQuery.data.code}` : ""}
                </p>
              )}
            </div>
            {(levelQuery.data?.fee_structure_path || levelQuery.data?.fee_structure_url) && (
              <FeeStructureActions
                path={levelQuery.data.fee_structure_path}
                url={levelQuery.data.fee_structure_url}
                filename={
                  levelQuery.data.fee_structure_file_name ??
                  `${levelQuery.data.name}-fee-structure.pdf`
                }
                title={`${levelQuery.data.name} fee structure`}
              />
            )}
          </div>
          {levelQuery.data && (
            <p className="mt-2 text-sm text-muted-foreground">
              Level fee: {formatKES(levelQuery.data.total_fee)}
            </p>
          )}
          {levelUnits.error ? (
            <p role="alert" className="mt-3 text-sm text-destructive">
              Could not load your units: {levelUnits.error.message}
            </p>
          ) : levelUnits.data?.length ? (
            <ul className="mt-3 grid gap-2 sm:grid-cols-2">
              {levelUnits.data.map((unit) => (
                <li key={unit.id} className="rounded-lg bg-muted/40 px-3 py-2 text-sm">
                  {unit.code && <strong>{unit.code} · </strong>}
                  {unit.title}
                  {unit.semester && (
                    <span className="block text-xs text-muted-foreground">{unit.semester}</span>
                  )}
                </li>
              ))}
            </ul>
          ) : levelUnits.isLoading ? (
            <p className="mt-3 text-sm text-muted-foreground">Loading your units…</p>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">
              No units are assigned to this level yet.
            </p>
          )}
        </section>
      )}
      <section data-scroll-reveal className="rounded-xl border bg-card p-5 shadow-card">
        <h3 className="font-semibold text-brand">Your enrolment</h3>
        <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground">Student number</dt>
            <dd className="font-medium">{student.student_number}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Status</dt>
            <dd>
              <Badge>{student.status}</Badge>
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Study mode</dt>
            <dd className="font-medium">{student.study_mode.replace("_", " ")}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Current semester</dt>
            <dd className="font-medium">{student.current_semester ?? "Not set"}</dd>
          </div>
        </dl>
      </section>
    </div>
  );
}

function OnlineStudentOverview({
  student,
  onNavigate,
}: {
  student: Student;
  onNavigate: (section: PortalSection) => void;
}) {
  const selectedLevel = useQuery({
    queryKey: ["student", "online-course-level", student.level_id],
    enabled: Boolean(student.level_id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("course_levels")
        .select("name,code,fee_structure_url,fee_structure_path,fee_structure_file_name,total_fee")
        .eq("id", student.level_id!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const courses = useQuery({
    queryKey: ["student", "online-course-enrollments", student.id],
    queryFn: async () => {
      const { data: enrollments, error: enrollmentError } = await supabase
        .from("online_course_enrollments")
        .select("id,course_id,status,tuition_fee,exam_fee,certificate_fee")
        .eq("student_id", student.id)
        .eq("status", "active")
        .order("created_at");
      if (enrollmentError) throw enrollmentError;
      const ids = (enrollments ?? []).map((enrollment) => enrollment.course_id);
      if (!ids.length) return [];
      const { data: courseRecords, error: courseError } = await supabase
        .from("courses")
        .select("id,title,duration,image_url")
        .in("id", ids);
      if (courseError) throw courseError;
      const byId = new Map((courseRecords ?? []).map((course) => [course.id, course]));
      return (enrollments ?? []).flatMap((enrollment) => {
        const course = byId.get(enrollment.course_id);
        return course ? [{ ...enrollment, course }] : [];
      });
    },
  });
  return (
    <div className="space-y-6">
      <section className="rounded-2xl bg-gradient-brand p-6 text-brand-foreground shadow-card sm:p-8">
        <p className="text-sm font-semibold text-brand-foreground/75">
          Online learner · {student.student_number}
        </p>
        <h2 className="mt-2 text-2xl font-bold sm:text-3xl">Welcome, {student.first_name}</h2>
        <p className="mt-2 max-w-2xl text-sm text-brand-foreground/80">
          Your workspace is focused on your online learning, course fees, and account. Course
          lessons and materials are managed in the LMS.
        </p>
      </section>
      <section className="rounded-xl border bg-card p-5 shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-semibold text-brand">Your online courses</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Only courses assigned to your online learner account appear here.
            </p>
          </div>
          <Button type="button" onClick={() => onNavigate("online")}>
            Open my LMS
          </Button>
        </div>
        {courses.isLoading ? (
          <p className="mt-4 text-sm text-muted-foreground">Loading your online courses…</p>
        ) : courses.error ? (
          <p role="alert" className="mt-4 text-sm text-destructive">
            Could not load online courses: {courses.error.message}
          </p>
        ) : courses.data?.length ? (
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {courses.data.map(({ id, course, tuition_fee, exam_fee, certificate_fee }) => (
              <article key={id} className="overflow-hidden rounded-xl border">
                {course.image_url && (
                  <img
                    src={course.image_url}
                    alt=""
                    className="h-32 w-full object-cover"
                    loading="lazy"
                  />
                )}
                <div className="p-4">
                  <h4 className="font-semibold text-brand">{course.title}</h4>
                  {course.duration && (
                    <p className="mt-1 text-xs text-muted-foreground">{course.duration}</p>
                  )}
                  <p className="mt-3 text-sm">Tuition: {formatKES(tuition_fee)}</p>
                  {exam_fee > 0 && <p className="text-sm">Examination: {formatKES(exam_fee)}</p>}
                  {certificate_fee > 0 && (
                    <p className="text-sm">Certificate: {formatKES(certificate_fee)}</p>
                  )}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <p className="mt-4 text-sm text-muted-foreground">
            No active online LMS course is linked to this account yet. Contact admissions if you
            have recently been admitted.
          </p>
        )}
      </section>
      {selectedLevel.data && (
        <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-5 shadow-card">
          <div>
            <h3 className="font-semibold text-brand">
              {selectedLevel.data.name}
              {selectedLevel.data.code ? ` · ${selectedLevel.data.code}` : ""}
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Level fee: {formatKES(selectedLevel.data.total_fee)}
            </p>
          </div>
          {(selectedLevel.data.fee_structure_path || selectedLevel.data.fee_structure_url) && (
            <FeeStructureActions
              path={selectedLevel.data.fee_structure_path}
              url={selectedLevel.data.fee_structure_url}
              filename={
                selectedLevel.data.fee_structure_file_name ??
                `${selectedLevel.data.name}-fee-structure.pdf`
              }
              title={`${selectedLevel.data.name} fee structure`}
            />
          )}
        </section>
      )}
      {selectedLevel.error && (
        <p
          role="alert"
          className="rounded-lg border border-destructive/30 p-3 text-sm text-destructive"
        >
          Could not load your fee structure details: {selectedLevel.error.message}
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => onNavigate("fees")}
          className="rounded-xl border bg-card p-5 text-left shadow-card hover:border-primary"
        >
          <Wallet className="h-5 w-5 text-primary" />
          <p className="mt-3 font-semibold text-brand">Fees & payments</p>
          <p className="mt-1 text-sm text-muted-foreground">Review balances and payment history.</p>
        </button>
        <button
          type="button"
          onClick={() => onNavigate("profile")}
          className="rounded-xl border bg-card p-5 text-left shadow-card hover:border-primary"
        >
          <UserRound className="h-5 w-5 text-primary" />
          <p className="mt-3 font-semibold text-brand">My account</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage your learner profile and contact details.
          </p>
        </button>
      </div>
    </div>
  );
}

function LearningSection({ courseId }: { courseId: string | null }) {
  const query = useQuery({
    queryKey: ["student", "materials", courseId],
    enabled: !!courseId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("learning_materials")
        .select("*")
        .eq("course_id", courseId!)
        .eq("published", true)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
  if (!courseId)
    return (
      <Empty
        title="No course assigned"
        detail="Learning materials will appear after a course has been assigned to your student profile."
      />
    );
  if (query.isLoading) return <Loading />;
  if (query.error) return <ErrorCard error={query.error.message} retry={() => query.refetch()} />;
  return query.data?.length ? (
    <div className="space-y-3">
      {query.data.map((material) => (
        <article
          key={material.id}
          data-scroll-reveal
          className="rounded-xl border bg-card p-5 shadow-card"
        >
          <h2 className="font-semibold text-brand">{material.title}</h2>
          <p className="mt-1 text-xs uppercase tracking-wide text-primary">
            {material.material_type}
          </p>
          {material.description && (
            <p className="mt-2 text-sm text-muted-foreground">{material.description}</p>
          )}
          {material.external_url && (
            <a
              className="mt-3 inline-block text-sm font-medium text-primary hover:underline"
              href={material.external_url}
              target="_blank"
              rel="noreferrer"
            >
              Open learning material ↗
            </a>
          )}
          {material.file_path && (
            <PrivateStorageMedia
              path={material.file_path}
              contentType={material.material_type}
              label="Open learning material"
            />
          )}
        </article>
      ))}
    </div>
  ) : (
    <Empty
      title="No learning materials yet"
      detail="Your instructor has not published course materials yet."
    />
  );
}

type OnlineEnrollment = Tables<"online_course_enrollments">;
type OnlineLessonProgress =
  Database["public"]["Functions"]["list_online_course_lessons"]["Returns"][number];
type PaymentStage = "tuition_30" | "tuition_balance" | "certificate_fee" | "exam_fee";

function OnlineCoursesSection({ student }: { student: Student }) {
  const queryClient = useQueryClient();
  const [enrollmentId, setEnrollmentId] = useState("");
  const enrollmentsQuery = useQuery({
    queryKey: ["student", "online-enrollments", student.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("online_course_enrollments")
        .select("*")
        .eq("student_id", student.id)
        .eq("status", "active")
        .order("created_at", { ascending: false });
      if (error) throw error;
      if (!data.length) return [];
      const { data: courses, error: courseError } = await supabase
        .from("courses")
        .select(
          "id,title,duration,online_syllabus,online_intro_video_url,online_lecturer_name,online_lecturer_email,online_lecturer_phone",
        )
        .in(
          "id",
          data.map((enrollment) => enrollment.course_id),
        );
      if (courseError) throw courseError;
      const courseById = new Map(courses.map((course) => [course.id, course]));
      return data.map((enrollment) => ({
        enrollment,
        course: courseById.get(enrollment.course_id),
      }));
    },
  });
  useEffect(() => {
    const enrollments = enrollmentsQuery.data ?? [];
    if (!enrollments.some((item) => item.enrollment.id === enrollmentId))
      setEnrollmentId(enrollments[0]?.enrollment.id ?? "");
  }, [enrollmentId, enrollmentsQuery.data]);
  const selected = enrollmentsQuery.data?.find((item) => item.enrollment.id === enrollmentId);
  const selectedEnrollment = selected?.enrollment;
  const lessonsQuery = useQuery({
    queryKey: ["student", "online-lessons", selectedEnrollment?.course_id],
    enabled: !!selectedEnrollment,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("list_online_course_lessons", {
        _course_id: selectedEnrollment!.course_id,
      });
      if (error) throw error;
      return data;
    },
  });
  const paymentsQuery = useQuery({
    queryKey: ["student", "online-payments", selectedEnrollment?.id],
    enabled: !!selectedEnrollment,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("online_course_payments")
        .select("*")
        .eq("enrollment_id", selectedEnrollment!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
  const paymentMutation = useMutation({
    mutationFn: async (stage: PaymentStage) => {
      if (!selectedEnrollment) throw new Error("Choose an online course first.");
      const { data, error } = await supabase.functions.invoke("create-online-payment", {
        body: { enrollmentId: selectedEnrollment.id, stage },
      });
      if (error) {
        if ("context" in error && error.context instanceof Response) {
          const response = await error.context
            .clone()
            .json()
            .catch(() => null);
          if (typeof response?.error === "string") throw new Error(response.error);
        }
        throw error;
      }
      if (!data?.success) throw new Error(data?.error ?? "Payment request could not be started.");
      return data;
    },
    onSuccess: async () => {
      toast.success("PayHero payment request sent", {
        description:
          "Approve the mobile money prompt. Access is updated when the payment is verified.",
      });
      await queryClient.invalidateQueries({ queryKey: ["student", "online-payments"] });
    },
    onError: (error) => toast.error("Could not start payment", { description: error.message }),
  });
  const completeLesson = useMutation({
    mutationFn: async (lessonId: string) => {
      const { error } = await supabase.rpc("complete_online_lesson", { _lesson_id: lessonId });
      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["student", "online-lessons"] });
    },
    onError: (error) =>
      toast.error("Could not save lesson progress", { description: error.message }),
  });

  if (enrollmentsQuery.isLoading) return <Loading />;
  if (enrollmentsQuery.error)
    return (
      <ErrorCard error={enrollmentsQuery.error.message} retry={() => enrollmentsQuery.refetch()} />
    );
  if (!enrollmentsQuery.data?.length)
    return (
      <Empty
        title="No online courses enrolled"
        detail="Choose a course from the public Online Courses catalogue to create your student number and start learning."
      />
    );

  const confirmedPayments =
    paymentsQuery.data?.filter((payment) => payment.status === "confirmed") ?? [];
  const tuitionPaid = confirmedPayments
    .filter((payment) => payment.stage === "tuition_30" || payment.stage === "tuition_balance")
    .reduce((sum, payment) => sum + Number(payment.amount), 0);
  const initialAmount = Math.ceil(Number(selectedEnrollment?.tuition_fee ?? 0) * 0.3);
  const tuitionTarget = Number(selectedEnrollment?.tuition_fee ?? 0);
  const allLessons = lessonsQuery.data ?? [];
  const allLessonsCompleted =
    allLessons.length > 0 && allLessons.every((lesson) => lesson.completed);
  const payPending = paymentMutation.isPending;

  return (
    <div className="space-y-5">
      <label className="block max-w-xl space-y-1.5 text-sm font-medium">
        Enrolled courses
        <select
          className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          value={enrollmentId}
          onChange={(event) => setEnrollmentId(event.target.value)}
        >
          {enrollmentsQuery.data.map(({ enrollment, course }) => (
            <option key={enrollment.id} value={enrollment.id}>
              {course?.title ?? "Online course"}
            </option>
          ))}
        </select>
      </label>
      {selectedEnrollment && selected?.course && (
        <>
          <section className="rounded-xl border bg-card p-5 shadow-card">
            <h2 className="text-xl font-semibold text-brand">{selected.course.title}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {selected.course.duration ?? "Online study"}
              {selected.course.online_lecturer_name
                ? ` · Lecturer: ${selected.course.online_lecturer_name}`
                : ""}
            </p>
            {selected.course.online_intro_video_url && (
              <a
                className="mt-2 inline-block text-sm font-medium text-primary hover:underline"
                href={selected.course.online_intro_video_url}
                target="_blank"
                rel="noreferrer"
              >
                Watch course introduction ↗
              </a>
            )}
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <FeeMetric label="Tuition paid" value={formatKES(tuitionPaid) ?? "KES 0"} />
              <FeeMetric
                label="Tuition balance"
                value={formatKES(Math.max(0, tuitionTarget - tuitionPaid)) ?? "KES 0"}
              />
              <FeeMetric
                label="Exam + certificate fees"
                value={
                  formatKES(
                    Number(selectedEnrollment.exam_fee ?? 0) +
                      Number(selectedEnrollment.certificate_fee ?? 0),
                  ) ?? "KES 0"
                }
              />
            </div>
            {paymentsQuery.error && (
              <p role="alert" className="mt-3 text-sm text-destructive">
                Could not load verified online payments: {paymentsQuery.error.message}
              </p>
            )}
            {tuitionPaid < initialAmount && initialAmount > 0 ? (
              <Button
                className="mt-4"
                disabled={payPending}
                onClick={() => paymentMutation.mutate("tuition_30")}
              >
                {payPending
                  ? "Connecting to PayHero…"
                  : `Pay 30% tuition (${formatKES(initialAmount - tuitionPaid)})`}
              </Button>
            ) : tuitionPaid < tuitionTarget ? (
              <Button
                className="mt-4"
                disabled={payPending}
                onClick={() => paymentMutation.mutate("tuition_balance")}
              >
                {payPending
                  ? "Connecting to PayHero…"
                  : `Pay remaining tuition (${formatKES(tuitionTarget - tuitionPaid)})`}
              </Button>
            ) : (
              <p className="mt-4 text-sm font-medium text-primary">Tuition paid in full.</p>
            )}
          </section>

          {lessonsQuery.error ? (
            <ErrorCard error={lessonsQuery.error.message} retry={() => lessonsQuery.refetch()} />
          ) : lessonsQuery.isLoading ? (
            <Loading />
          ) : (
            <section className="space-y-3">
              <h2 className="font-semibold text-brand">Course outline and lessons</h2>
              {allLessons.length ? (
                allLessons.map((lesson) => (
                  <OnlineLessonCard
                    key={lesson.id}
                    lesson={lesson}
                    completing={completeLesson.isPending}
                    onComplete={() => completeLesson.mutate(lesson.id)}
                  />
                ))
              ) : (
                <Empty
                  title="Course outline coming soon"
                  detail="The lecturer has not published lessons for this course yet."
                />
              )}
            </section>
          )}

          {tuitionPaid >= tuitionTarget && allLessonsCompleted && (
            <section className="rounded-xl border bg-card p-5 shadow-card">
              <h2 className="font-semibold text-brand">Examination and certificate</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                These are separate course charges. Payment is confirmed against your student number.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {Number(selectedEnrollment.exam_fee ?? 0) > 0 && (
                  <Button
                    variant="outline"
                    disabled={
                      payPending ||
                      confirmedPayments.some((payment) => payment.stage === "exam_fee")
                    }
                    onClick={() => paymentMutation.mutate("exam_fee")}
                  >
                    Pay exam fee · {formatKES(Number(selectedEnrollment.exam_fee ?? 0))}
                  </Button>
                )}
                {Number(selectedEnrollment.certificate_fee ?? 0) > 0 && (
                  <Button
                    variant="outline"
                    disabled={
                      payPending ||
                      confirmedPayments.some((payment) => payment.stage === "certificate_fee")
                    }
                    onClick={() => paymentMutation.mutate("certificate_fee")}
                  >
                    Pay certificate fee ·{" "}
                    {formatKES(Number(selectedEnrollment.certificate_fee ?? 0))}
                  </Button>
                )}
              </div>
            </section>
          )}
        </>
      )}
      {paymentsQuery.data && (
        <section className="rounded-xl border bg-card p-5 shadow-card">
          <h2 className="font-semibold text-brand">Online payment history</h2>
          <div className="mt-2 divide-y">
            {paymentsQuery.data.map((payment) => (
              <div key={payment.id} className="flex flex-wrap justify-between gap-2 py-2 text-sm">
                <span>
                  {payment.stage.replaceAll("_", " ")} · {payment.reference}
                </span>
                <span>
                  {formatKES(Number(payment.amount))} · {payment.status}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function OnlineLessonCard({
  lesson,
  completing,
  onComplete,
}: {
  lesson: OnlineLessonProgress & {
    completed: boolean;
    locked: boolean;
  };
  completing: boolean;
  onComplete: () => void;
}) {
  return (
    <article className="rounded-xl border bg-card p-5 shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-brand">{lesson.title}</h3>
          <p className="text-xs text-muted-foreground">
            {lesson.section_title} · {Math.ceil(lesson.duration_seconds / 60)} min
            {lesson.is_preview ? " · Free preview" : ""}
          </p>
        </div>
        <Badge variant={lesson.locked ? "outline" : lesson.completed ? "default" : "secondary"}>
          {lesson.locked ? "Locked" : lesson.completed ? "Completed" : "Available"}
        </Badge>
      </div>
      {lesson.description && (
        <p className="mt-2 text-sm text-muted-foreground">{lesson.description}</p>
      )}
      {lesson.locked ? (
        <p className="mt-3 text-sm text-muted-foreground">
          Complete the free preview and pay the required tuition stage to unlock this lesson.
        </p>
      ) : (
        <>
          {lesson.notes && <div className="mt-3 whitespace-pre-line text-sm">{lesson.notes}</div>}
          {lesson.video_url && (
            <a
              className="mt-3 inline-block text-sm font-medium text-primary hover:underline"
              href={lesson.video_url}
              target="_blank"
              rel="noreferrer"
            >
              Watch lesson video ↗
            </a>
          )}
          {lesson.file_path && (
            <PrivateStorageMedia path={lesson.file_path} label="Open lesson file" />
          )}
          {!lesson.completed && (
            <Button
              className="mt-3"
              size="sm"
              variant="outline"
              disabled={completing}
              onClick={onComplete}
            >
              Mark lesson complete
            </Button>
          )}
        </>
      )}
    </article>
  );
}

function FeeMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-muted/50 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 font-semibold">{value}</p>
    </div>
  );
}

function AssignmentsSection({ student, courseId }: { student: Student; courseId: string | null }) {
  const [currentTime, setCurrentTime] = useState(() => Date.now());
  const assignmentsQuery = useQuery({
    queryKey: ["student", "assignment-list", student.id, courseId],
    enabled: !!courseId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("assignments")
        .select("*")
        .eq("course_id", courseId!)
        .eq("published", true)
        .order("due_date", { ascending: true });
      if (error) throw error;
      return data;
    },
  });
  const submissionsQuery = useQuery({
    queryKey: ["student", "assignment-submissions", student.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("submissions")
        .select("*")
        .eq("student_id", student.id);
      if (error) throw error;
      return data;
    },
  });
  useEffect(() => {
    const timer = window.setInterval(() => setCurrentTime(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  if (!courseId)
    return (
      <Empty
        title="No course assigned"
        detail="Assignments will appear after your course has been assigned."
      />
    );
  if (assignmentsQuery.isLoading) return <Loading />;
  if (assignmentsQuery.error)
    return (
      <ErrorCard
        error={assignmentsQuery.error.message}
        retry={() => void assignmentsQuery.refetch()}
      />
    );
  return assignmentsQuery.data?.length ? (
    <div className="space-y-3">
      {submissionsQuery.error && (
        <ErrorCard
          error={`Assignments loaded, but submission status could not be checked: ${submissionsQuery.error.message}`}
          retry={() => void submissionsQuery.refetch()}
        />
      )}
      {assignmentsQuery.data.map((assignment) => {
        const submission = submissionsQuery.data?.find(
          (row) => row.assignment_id === assignment.id,
        );
        const submissionOpen = isAssignmentOpenForSubmission(assignment.due_date, currentTime);
        const deadlinePassed = !submissionOpen;
        return (
          <article
            key={assignment.id}
            data-scroll-reveal
            className="rounded-xl border bg-card p-5 shadow-card"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <h2 className="font-semibold text-brand">{assignment.title}</h2>
              <Badge variant={submission ? "default" : "secondary"}>
                {submission?.grade
                  ? "Marked"
                  : submission
                    ? "Submitted"
                    : deadlinePassed
                      ? "Closed"
                      : "Not submitted"}
              </Badge>
            </div>
            {assignment.instructions && (
              <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">
                {assignment.instructions}
              </p>
            )}
            {assignment.due_date && (
              <p className="mt-3 text-xs text-muted-foreground">
                Submission deadline: {new Date(assignment.due_date).toLocaleString("en-KE")}
              </p>
            )}
            {assignment.file_path && (
              <PrivateStorageMedia path={assignment.file_path} label="Open assignment file" />
            )}
            {submission?.feedback && (
              <p className="mt-3 rounded-lg bg-accent p-3 text-sm">
                Feedback: {submission.feedback}
              </p>
            )}
            {submission?.grade && (
              <p className="mt-3 text-sm font-medium">Grade: {submission.grade}</p>
            )}
            {submission?.comment && (
              <p className="mt-3 whitespace-pre-wrap rounded-lg bg-muted/50 p-3 text-sm">
                Your submission: {submission.comment}
              </p>
            )}
            {submissionsQuery.isLoading ? (
              <p className="mt-4 border-t pt-4 text-sm text-muted-foreground">
                Checking your submission…
              </p>
            ) : submissionsQuery.error ? null : submission ? (
              <div className="mt-4 space-y-2 border-t pt-4">
                <SubmissionFileDownloads paths={submissionFilePaths(submission)} />
                <p className="text-sm text-muted-foreground">
                  Submitted {new Date(submission.submitted_at).toLocaleString("en-KE")}.
                  {submissionFilePaths(submission).length > 1
                    ? ` ${submissionFilePaths(submission).length} files attached.`
                    : ""}
                </p>
              </div>
            ) : deadlinePassed ? (
              <p className="mt-4 border-t pt-4 text-sm font-medium text-muted-foreground">
                Submission closed. This assignment remains available for revision.
              </p>
            ) : (
              <SubmitAssignment
                student={student}
                assignmentId={assignment.id}
                dueDate={assignment.due_date ?? ""}
              />
            )}
          </article>
        );
      })}
    </div>
  ) : (
    <Empty
      title="No assignments yet"
      detail="Published assignments for your course level will appear here."
    />
  );
}

function SubmitAssignment({
  student,
  assignmentId,
  dueDate,
}: {
  student: Student;
  assignmentId: string;
  dueDate: string;
}) {
  const queryClient = useQueryClient();
  const [files, setFiles] = useState<File[]>([]);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!isAssignmentOpenForSubmission(dueDate)) {
      toast.error("The submission deadline has passed.");
      return;
    }
    if (!files.length && !comment.trim()) {
      toast.error("Add a file or a submission comment.");
      return;
    }
    const maxFileSize = 50 * 1024 * 1024;
    if (files.some((file) => file.size > maxFileSize)) {
      toast.error("Submission file is too large", {
        description: "Each submission file must be up to 50 MB.",
      });
      return;
    }
    setBusy(true);
    const uploadedPaths: string[] = [];
    try {
      for (const file of files) {
        const safeFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const path = `${student.id}/${assignmentId}/${crypto.randomUUID()}-${safeFileName}`;
        const { error: uploadError } = await supabase.storage
          .from("submissions")
          .upload(path, file, {
            ...(file.type ? { contentType: file.type } : {}),
            upsert: false,
          });
        if (uploadError) {
          let description = uploadError.message;
          if (uploadedPaths.length) {
            const { error: cleanupError } = await supabase.storage
              .from("submissions")
              .remove(uploadedPaths);
            if (cleanupError) {
              description += ` Earlier uploaded files could not be cleaned up: ${cleanupError.message}`;
            }
          }
          toast.error("Could not upload submission files", { description });
          return;
        }
        uploadedPaths.push(path);
      }

      const { error: saveError } = await supabase.from("submissions").insert({
        assignment_id: assignmentId,
        student_id: student.id,
        file_path: uploadedPaths[0] ?? null,
        file_paths: uploadedPaths,
        comment: comment.trim() || null,
      });

      if (saveError) {
        let description = saveError.message;
        if (uploadedPaths.length) {
          const { error: cleanupError } = await supabase.storage
            .from("submissions")
            .remove(uploadedPaths);
          if (cleanupError) {
            description += ` The uploaded file could not be cleaned up: ${cleanupError.message}`;
          }
        }
        toast.error("Could not submit assignment", { description });
        return;
      }

      toast.success("Assignment submitted");
      setFiles([]);
      setComment("");
      await queryClient.invalidateQueries({
        queryKey: ["student", "assignment-submissions", student.id],
      });
    } catch (error) {
      let description =
        error instanceof Error ? error.message : "The submission could not be saved.";
      if (uploadedPaths.length) {
        const { error: cleanupError } = await supabase.storage
          .from("submissions")
          .remove(uploadedPaths);
        if (cleanupError) {
          description += ` Uploaded files could not be cleaned up: ${cleanupError.message}`;
        }
      }
      toast.error("Could not submit assignment", { description });
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="mt-4 space-y-2 border-t pt-4">
      <label className="block text-sm font-medium">
        Your comment
        <Textarea rows={2} value={comment} onChange={(event) => setComment(event.target.value)} />
      </label>
      <label className="block text-sm font-medium">
        Submission files
        <input
          className="mt-1 block w-full text-sm"
          type="file"
          multiple
          disabled={busy}
          onChange={(event) => setFiles(Array.from(event.target.files ?? []))}
        />
        <span className="mt-1 block text-xs text-muted-foreground">
          You can attach multiple files. Each file must be 50 MB or smaller.
        </span>
      </label>
      <Button
        className="mt-2"
        size="sm"
        disabled={busy}
        loading={busy}
        onClick={() => void submit()}
      >
        {busy ? "Submitting…" : "Submit assignment"}
      </Button>
    </div>
  );
}

function ResultsSection({ studentId }: { studentId: string }) {
  const query = useQuery({
    queryKey: ["student", "results", studentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("results")
        .select("*")
        .eq("student_id", studentId)
        .eq("published", true)
        .order("academic_year", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
  if (query.isLoading) return <Loading />;
  if (query.error) return <ErrorCard error={query.error.message} retry={() => query.refetch()} />;
  return query.data?.length ? (
    <div className="overflow-x-auto rounded-xl border bg-card shadow-card">
      <table className="w-full min-w-[580px] text-left text-sm">
        <thead>
          <tr className="border-b text-xs uppercase text-muted-foreground">
            <th className="px-4 py-3">Unit</th>
            <th className="px-4 py-3">Semester</th>
            <th className="px-4 py-3">Year</th>
            <th className="px-4 py-3">Score</th>
            <th className="px-4 py-3">Grade</th>
          </tr>
        </thead>
        <tbody>
          {query.data.map((result) => (
            <tr key={result.id} className="border-b last:border-0">
              <td className="px-4 py-3 font-medium">{result.unit_name}</td>
              <td className="px-4 py-3">{result.semester ?? "—"}</td>
              <td className="px-4 py-3">{result.academic_year ?? "—"}</td>
              <td className="px-4 py-3">{result.score === null ? "—" : `${result.score}%`}</td>
              <td className="px-4 py-3">{result.grade ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  ) : (
    <Empty
      title="No results published"
      detail="Published results will appear here after assessment."
    />
  );
}

function showReceiptPopup(windowRef: Window, ready: boolean) {
  if (windowRef.closed) return;
  windowRef.document.title = ready ? "Receipt download started" : "Preparing your receipt";
  windowRef.document.head.innerHTML = `<meta name="viewport" content="width=device-width, initial-scale=1"><style>
    *{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:#fff8f1;color:#321018;font:15px Inter,Arial,sans-serif}
    main{width:min(360px,calc(100% - 36px));padding:34px 28px;text-align:center;background:#fff;border:1px solid #eaded8;border-radius:20px;box-shadow:0 18px 55px #68091518}
    .icon{height:62px;width:62px;margin:0 auto 18px;display:grid;place-items:center;border-radius:18px;background:#fff1e8;color:#f1582b}
    .printer{animation:print .7s ease-in-out infinite}.check{color:#287a52;animation:ready .4s ease both}
    .paper{height:4px;margin-top:22px;overflow:hidden;border-radius:9px;background:#f2e9e4}.paper:after{content:"";display:block;width:42%;height:100%;border-radius:9px;background:#f1582b;animation:progress 1.2s ease-in-out infinite}
    h1{margin:0;font-size:18px;color:#680915}p{margin:8px 0 0;line-height:1.55;color:#75666a}
    @keyframes print{25%{transform:translateY(-3px) rotate(-7deg)}50%{transform:translateY(1px) rotate(5deg)}75%{transform:translateY(-1px) rotate(-3deg}}
    @keyframes ready{from{transform:scale(.7);opacity:0}to{transform:scale(1);opacity:1}}
    @keyframes progress{from{transform:translateX(-110%)}to{transform:translateX(250%)}}
    @media(prefers-reduced-motion:reduce){*,*:before{animation:none!important}}
  </style>`;
  windowRef.document.body.innerHTML = ready
    ? `<main role="status" aria-live="polite"><div class="icon check"><svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 4 4L19 6"/></svg></div><h1>Receipt ready</h1><p>Your download has started. This window will close shortly.</p></main>`
    : `<main role="status" aria-live="polite"><div class="icon printer"><svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 14h12v8H6z"/></svg></div><h1>Preparing your receipt</h1><p>Creating your secure, school-branded PDF…</p><div class="paper" aria-hidden="true"></div></main>`;
}

function StudentProgressionSection({ student }: { student: Student }) {
  const queryClient = useQueryClient();
  const [levelId, setLevelId] = useState("");
  const [message, setMessage] = useState("");
  const courseId = student.course_id;
  const levelsQuery = useQuery({
    queryKey: ["student", "course-levels", courseId],
    enabled: Boolean(courseId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("course_levels")
        .select("id,name,description,total_fee,sort_order")
        .eq("course_id", courseId!)
        .eq("published", true)
        .order("sort_order");
      if (error) throw error;
      return data;
    },
  });
  const unitsQuery = useQuery({
    queryKey: ["student", "course-level-units", courseId],
    enabled: Boolean(courseId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("course_units")
        .select("id,level_id,title,code,semester")
        .eq("course_id", courseId!)
        .order("sort_order");
      if (error) throw error;
      return data;
    },
  });
  const applicationsQuery = useQuery({
    queryKey: ["student", "level-applications", student.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("student_level_applications")
        .select("id,level_id,status,student_message,admin_message,created_at")
        .eq("student_id", student.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
  const applyMutation = useMutation({
    mutationFn: async () => {
      if (!levelId) throw new Error("Choose the level you want to apply for.");
      const { error } = await supabase.rpc("submit_student_level_application", {
        _level_id: levelId,
        _message: message.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("Level application sent", {
        description:
          "The administration has been notified. Your current units remain active until approval.",
      });
      setLevelId("");
      setMessage("");
      await queryClient.invalidateQueries({
        queryKey: ["student", "level-applications", student.id],
      });
    },
    onError: (error) =>
      toast.error("Could not submit level application", { description: error.message }),
  });
  if (!courseId)
    return (
      <PortalMessage title="Course not assigned" detail="Contact the administration for help." />
    );
  if (levelsQuery.isLoading || unitsQuery.isLoading || applicationsQuery.isLoading)
    return <Loading />;
  if (levelsQuery.error || unitsQuery.error || applicationsQuery.error)
    return (
      <ErrorCard
        error={
          levelsQuery.error?.message ??
          unitsQuery.error?.message ??
          applicationsQuery.error?.message ??
          "Could not load course levels."
        }
        retry={() => {
          void levelsQuery.refetch();
          void unitsQuery.refetch();
          void applicationsQuery.refetch();
        }}
      />
    );
  const levels = levelsQuery.data ?? [];
  const currentLevel = levels.find((level) => level.id === student.level_id) ?? levels[0];
  const nextLevels = levels.filter((level) => level.sort_order > (currentLevel?.sort_order ?? 0));
  const names = new Map(levels.map((level) => [level.id, level.name]));
  const hasPending = applicationsQuery.data?.some(
    (application) => application.status === "pending",
  );
  return (
    <div className="space-y-5">
      <section className="rounded-xl border bg-card p-5 shadow-card">
        <h2 className="font-semibold text-brand">Course curriculum by level</h2>
        <div className="mt-4 space-y-3">
          {levels.map((level) => {
            const units = (unitsQuery.data ?? []).filter((unit) => unit.level_id === level.id);
            return (
              <details
                key={level.id}
                className="rounded-lg border p-4"
                open={level.id === student.level_id}
              >
                <summary className="cursor-pointer font-semibold">
                  {level.name}
                  {level.id === student.level_id ? " · Current level" : ""}
                  {level.total_fee > 0 ? ` · ${formatKES(level.total_fee)}` : ""}
                </summary>
                {level.description && (
                  <p className="mt-2 text-sm text-muted-foreground">{level.description}</p>
                )}
                {units.length ? (
                  <ul className="mt-3 divide-y">
                    {units.map((unit) => (
                      <li
                        key={unit.id}
                        className="flex flex-wrap justify-between gap-2 py-2 text-sm"
                      >
                        <span>{unit.title}</span>
                        <span className="text-muted-foreground">
                          {[unit.code, unit.semester].filter(Boolean).join(" · ")}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-3 text-sm text-muted-foreground">Units are being updated.</p>
                )}
              </details>
            );
          })}
        </div>
      </section>
      <section className="rounded-xl border bg-card p-5 shadow-card">
        <h2 className="font-semibold text-brand">Apply to progress to another level</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Review the curriculum above before applying. Administration approval is required before
          your student record and units are moved to the new level.
        </p>
        {hasPending ? (
          <p className="mt-4 rounded-lg bg-muted p-3 text-sm" role="status">
            Your level application is awaiting review.
          </p>
        ) : nextLevels.length ? (
          <form
            className="mt-4 grid gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              applyMutation.mutate();
            }}
          >
            <label className="grid gap-1.5 text-sm font-medium">
              Requested level
              <select
                className="h-10 rounded-md border bg-background px-3"
                required
                value={levelId}
                onChange={(event) => setLevelId(event.target.value)}
              >
                <option value="">Select a higher level</option>
                {nextLevels.map((level) => (
                  <option key={level.id} value={level.id}>
                    {level.name} ·{" "}
                    {(unitsQuery.data ?? []).filter((unit) => unit.level_id === level.id).length}{" "}
                    units
                  </option>
                ))}
              </select>
            </label>
            {levelId && (
              <div className="rounded-lg bg-muted/50 p-3 text-sm">
                <p className="font-semibold">Units in {names.get(levelId)}:</p>
                <ul className="mt-2 list-inside list-disc">
                  {(unitsQuery.data ?? [])
                    .filter((unit) => unit.level_id === levelId)
                    .map((unit) => (
                      <li key={unit.id}>{unit.title}</li>
                    ))}
                </ul>
              </div>
            )}
            <Textarea
              rows={3}
              maxLength={1000}
              placeholder="Optional message for the administration"
              value={message}
              onChange={(event) => setMessage(event.target.value)}
            />
            <Button
              disabled={applyMutation.isPending || !levelId}
              loading={applyMutation.isPending}
            >
              {applyMutation.isPending ? "Submitting…" : "Submit level application"}
            </Button>
          </form>
        ) : (
          <p className="mt-4 text-sm text-muted-foreground">
            No higher published level is currently available for your course.
          </p>
        )}
        {!!applicationsQuery.data?.length && (
          <div className="mt-5 border-t pt-4">
            <h3 className="font-semibold text-brand">Application history</h3>
            <ul className="mt-2 divide-y">
              {applicationsQuery.data.map((application) => (
                <li key={application.id} className="py-3 text-sm">
                  <p className="font-medium">
                    {names.get(application.level_id) ?? "Course level"} · {application.status}
                  </p>
                  {application.admin_message && (
                    <p className="mt-1 text-muted-foreground">{application.admin_message}</p>
                  )}
                  <p className="mt-1 text-xs text-muted-foreground">
                    {new Date(application.created_at).toLocaleDateString("en-KE")}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </div>
  );
}

function StudentFeedbackSection({ studentId }: { studentId: string }) {
  const queryClient = useQueryClient();
  const [category, setCategory] = useState("course");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const feedbackQuery = useQuery({
    queryKey: ["student", "course-feedback", studentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("student_course_feedback")
        .select("id,category,subject,body,status,admin_reply,created_at")
        .eq("student_id", studentId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
  const submitMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("student_course_feedback").insert({
        student_id: studentId,
        category,
        subject: subject.trim(),
        body: body.trim(),
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("Feedback sent to the administration");
      setSubject("");
      setBody("");
      await queryClient.invalidateQueries({ queryKey: ["student", "course-feedback", studentId] });
    },
    onError: (error) => toast.error("Could not submit feedback", { description: error.message }),
  });
  if (feedbackQuery.isLoading) return <Loading />;
  if (feedbackQuery.error)
    return <ErrorCard error={feedbackQuery.error.message} retry={() => feedbackQuery.refetch()} />;
  return (
    <div className="space-y-5">
      <form
        className="grid gap-3 rounded-xl border bg-card p-5 shadow-card"
        onSubmit={(event) => {
          event.preventDefault();
          submitMutation.mutate();
        }}
      >
        <div>
          <h2 className="font-semibold text-brand">Share feedback or report an issue</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Tell the administration about your course, progress, curriculum, or learning experience.
          </p>
        </div>
        <select
          className="h-10 rounded-md border bg-background px-3"
          value={category}
          onChange={(event) => setCategory(event.target.value)}
        >
          <option value="course">Course experience</option>
          <option value="progress">Progress and support</option>
          <option value="curriculum">Curriculum or units</option>
          <option value="other">Other report</option>
        </select>
        <Input
          required
          maxLength={160}
          placeholder="Subject"
          value={subject}
          onChange={(event) => setSubject(event.target.value)}
        />
        <Textarea
          required
          minLength={1}
          maxLength={5000}
          rows={5}
          placeholder="Describe your feedback or report"
          value={body}
          onChange={(event) => setBody(event.target.value)}
        />
        <Button disabled={submitMutation.isPending} loading={submitMutation.isPending}>
          {submitMutation.isPending ? "Sending…" : "Send feedback"}
        </Button>
      </form>
      {!!feedbackQuery.data?.length && (
        <section className="rounded-xl border bg-card p-5 shadow-card">
          <h2 className="font-semibold text-brand">Previous feedback</h2>
          <ul className="mt-3 divide-y">
            {feedbackQuery.data.map((item) => (
              <li key={item.id} className="py-3">
                <p className="font-medium">{item.subject}</p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">
                  {item.body}
                </p>
                <p className="mt-1 text-xs capitalize text-muted-foreground">
                  {item.category} · {item.status}
                </p>
                {item.admin_reply && (
                  <p className="mt-2 rounded-md bg-muted p-3 text-sm">
                    Admin response: {item.admin_reply}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function StudentMessagesSection({ studentId, userId }: { studentId: string; userId: string }) {
  const queryClient = useQueryClient();
  const [body, setBody] = useState("");
  const conversationQuery = useQuery({
    queryKey: ["portal-conversation", studentId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_or_create_student_conversation");
      if (error) throw error;
      return data;
    },
  });
  const messagesQuery = useQuery({
    queryKey: ["portal-messages", conversationQuery.data],
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
            queryKey: ["portal-messages", conversationQuery.data],
          });
      });
  }, [conversationQuery.data, messagesQuery.data, queryClient, userId]);
  const sendMutation = useMutation({
    mutationFn: async () => {
      if (!conversationQuery.data) throw new Error("Your message thread is not ready.");
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
        queryKey: ["portal-messages", conversationQuery.data],
      });
    },
    onError: (error) => toast.error("Could not send message", { description: error.message }),
  });
  if (conversationQuery.error)
    return (
      <ErrorCard
        error={conversationQuery.error.message}
        retry={() => conversationQuery.refetch()}
      />
    );
  if (messagesQuery.error)
    return <ErrorCard error={messagesQuery.error.message} retry={() => messagesQuery.refetch()} />;
  return (
    <section className="rounded-xl border bg-card p-5 shadow-card">
      <h2 className="font-semibold text-brand">Message the administration</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Send a private message and receive replies here. New messages trigger in-app notifications.
      </p>
      {messagesQuery.isLoading ? (
        <Loading />
      ) : (
        <ol className="mt-4 max-h-[28rem] space-y-3 overflow-y-auto rounded-lg bg-muted/40 p-3">
          {messagesQuery.data?.length ? (
            messagesQuery.data.map((message) => (
              <li
                key={message.id}
                className={`max-w-[85%] rounded-lg p-3 text-sm ${message.sender_id === userId ? "ml-auto bg-primary text-primary-foreground" : "bg-background shadow-sm"}`}
              >
                <p className="whitespace-pre-wrap">{message.body}</p>
                <time className="mt-2 block text-[10px] opacity-70">
                  {new Date(message.created_at).toLocaleString("en-KE")}
                </time>
              </li>
            ))
          ) : (
            <li className="py-8 text-center text-sm text-muted-foreground">
              Start a conversation with the administration.
            </li>
          )}
        </ol>
      )}
      <form
        className="mt-4 grid gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          sendMutation.mutate();
        }}
      >
        <Textarea
          required
          maxLength={5000}
          rows={3}
          placeholder="Write your message"
          value={body}
          onChange={(event) => setBody(event.target.value)}
        />
        <Button
          className="justify-self-end"
          disabled={sendMutation.isPending || !body.trim()}
          loading={sendMutation.isPending}
        >
          <Mail className="mr-2 h-4 w-4" />
          {sendMutation.isPending ? "Sending…" : "Send message"}
        </Button>
      </form>
    </section>
  );
}

function FeesSection({
  studentId,
  studentNumber,
  userId,
}: {
  studentId: string;
  studentNumber: string;
  userId: string;
}) {
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState("");
  const [receiptReadyId, setReceiptReadyId] = useState<string | null>(null);
  const receiptReadyTimer = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (receiptReadyTimer.current !== null) window.clearTimeout(receiptReadyTimer.current);
    },
    [],
  );
  const [receiptPreviewUrl, setReceiptPreviewUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!receiptPreviewUrl) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setReceiptPreviewUrl(null);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("keydown", closeOnEscape);
      URL.revokeObjectURL(receiptPreviewUrl);
    };
  }, [receiptPreviewUrl]);
  const query = useQuery({
    queryKey: ["student", "fees", studentId],
    queryFn: async () => {
      const [fees, payments, notifications] = await Promise.all([
        supabase
          .from("fees")
          .select("*")
          .eq("student_id", studentId)
          .order("created_at", { ascending: false }),
        supabase
          .from("payments")
          .select("*")
          .eq("student_id", studentId)
          .eq("status", "confirmed")
          .order("paid_at", { ascending: false }),
        supabase
          .from("notifications")
          .select("id,title,body,created_at")
          .eq("user_id", userId)
          .eq("category", "fees")
          .order("created_at", { ascending: false })
          .limit(10),
      ]);
      if (fees.error) throw fees.error;
      if (payments.error) throw payments.error;
      if (notifications.error) throw notifications.error;
      return {
        fees: fees.data,
        payments: payments.data,
        notifications: notifications.data,
      };
    },
    refetchOnWindowFocus: "always",
  });
  const paymentMutation = useMutation({
    mutationFn: async () => {
      const parsedAmount = Number(amount);
      if (!Number.isSafeInteger(parsedAmount) || parsedAmount <= 0)
        throw new Error("Enter a whole-number amount greater than zero.");
      const { data, error } = await supabase.functions.invoke("create-fee-payment", {
        body: { amount: parsedAmount },
      });
      if (error) {
        if ("context" in error && error.context instanceof Response) {
          const response = await error.context
            .clone()
            .json()
            .catch(() => null);
          if (typeof response?.error === "string") throw new Error(response.error);
        }
        throw error;
      }
      if (!data?.success) throw new Error(data?.error ?? "Payment request could not be started.");
      return data;
    },
    onSuccess: async (data) => {
      toast.success("PayHero payment prompt sent", {
        description: `Approve the KES ${formatKES(Number(data.amount))} prompt on your phone. Your account will update after PayHero confirms payment.`,
      });
      setAmount("");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["student", "fees", studentId] }),
        queryClient.invalidateQueries({ queryKey: ["student", "fee-total", studentId] }),
        queryClient.invalidateQueries({ queryKey: ["student", "payment-total", studentId] }),
      ]);
    },
    onError: (error) =>
      toast.error("Could not start payment", {
        description: error instanceof Error ? error.message : "Please retry.",
      }),
  });
  const statementMutation = useMutation({
    mutationFn: async (windowRef: Window) => {
      const { data, error } = await supabase.functions.invoke("generate-fee-statement");
      if (error) {
        if ("context" in error && error.context instanceof Response) {
          const response = await error.context
            .clone()
            .json()
            .catch(() => null);
          if (typeof response?.error === "string") throw new Error(response.error);
        }
        throw error;
      }
      if (!data?.success || typeof data.signedUrl !== "string")
        throw new Error(data?.error ?? "Could not prepare your fee statement.");
      return { signedUrl: data.signedUrl, windowRef };
    },
    onSuccess: ({ signedUrl, windowRef }) => {
      windowRef.location.href = signedUrl;
      void queryClient.invalidateQueries({ queryKey: ["student", "fees", studentId] });
    },
    onError: (error, windowRef) => {
      windowRef.close();
      toast.error("Could not download fee statement", {
        description: error instanceof Error ? error.message : "Please retry.",
      });
    },
  });
  const receiptMutation = useMutation({
    mutationFn: async (
      variables:
        | { paymentId: string; mode: "view" }
        | { paymentId: string; mode: "download"; windowRef: Window },
    ) => {
      const { paymentId, mode } = variables;
      const { data, error } = await supabase.functions.invoke("generate-fee-receipt", {
        body: { paymentId, mode },
      });
      if (error) {
        if ("context" in error && error.context instanceof Response) {
          const response = await error.context
            .clone()
            .json()
            .catch(() => null);
          if (typeof response?.error === "string") throw new Error(response.error);
        }
        throw error;
      }
      if (!(data instanceof Blob) || data.type !== "application/pdf")
        throw new Error("The receipt service returned an invalid PDF.");
      return { pdf: data, ...variables };
    },
    onSuccess: (result) => {
      const { pdf, mode, paymentId } = result;
      const objectUrl = URL.createObjectURL(pdf);
      if (mode === "view") {
        setReceiptPreviewUrl(objectUrl);
      } else {
        const { windowRef } = result;
        const download = document.createElement("a");
        download.href = objectUrl;
        download.download = "Profia-fee-receipt.pdf";
        document.body.append(download);
        download.click();
        download.remove();
        showReceiptPopup(windowRef, true);
        setReceiptReadyId(paymentId);
        if (receiptReadyTimer.current !== null) window.clearTimeout(receiptReadyTimer.current);
        receiptReadyTimer.current = window.setTimeout(() => {
          setReceiptReadyId(null);
          receiptReadyTimer.current = null;
          windowRef.close();
        }, 1600);
        window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
      }
      void queryClient.invalidateQueries({ queryKey: ["student", "fees", studentId] });
    },
    onError: (error, variables) => {
      if (variables.mode === "download") variables.windowRef.close();
      toast.error("Could not download receipt", {
        description: error instanceof Error ? error.message : "Please retry.",
      });
    },
  });
  function openReceipt(paymentId: string, mode: "view" | "download") {
    if (mode === "view") {
      receiptMutation.mutate({ paymentId, mode });
      return;
    }
    const windowRef = window.open("about:blank", "_blank");
    if (!windowRef) {
      toast.error("Allow pop-ups to download your receipt.");
      return;
    }
    showReceiptPopup(windowRef, false);
    receiptMutation.mutate({ paymentId, mode, windowRef });
  }
  function downloadStatement() {
    const windowRef = window.open("about:blank", "_blank");
    if (!windowRef) {
      toast.error("Allow pop-ups to download your fee statement.");
      return;
    }
    statementMutation.mutate(windowRef);
  }
  if (query.isLoading) return <Loading />;
  if (query.error) return <ErrorCard error={query.error.message} retry={() => query.refetch()} />;
  const billed = query.data?.fees.reduce((sum, fee) => sum + Number(fee.amount), 0) ?? 0;
  const paid = query.data?.payments.reduce((sum, payment) => sum + Number(payment.amount), 0) ?? 0;
  const hasCredit = paid > billed;
  const balanceLabel = hasCredit ? "Credit" : "Balance";
  const balanceAmount = Math.abs(billed - paid);
  const outstanding = Math.max(0, billed - paid);
  const ledger = [
    ...(query.data?.fees ?? []).map((fee) => ({
      id: `fee-${fee.id}`,
      date: fee.created_at,
      description: `${fee.description}${fee.due_date ? ` · Due ${fee.due_date}` : ""}`,
      debit: Number(fee.amount),
      credit: 0,
      order: 0,
    })),
    ...(query.data?.payments ?? []).map((payment) => ({
      id: `payment-${payment.id}`,
      date: payment.paid_at,
      description: `${payment.provider === "payhero" ? "M-Pesa" : payment.method}${payment.reference ? ` · ${payment.reference}` : ""}`,
      debit: 0,
      credit: Number(payment.amount),
      order: 1,
    })),
  ]
    .sort((left, right) => {
      const byDate = new Date(left.date).getTime() - new Date(right.date).getTime();
      return byDate || left.order - right.order || left.id.localeCompare(right.id);
    })
    .reduce<
      Array<{
        id: string;
        date: string;
        description: string;
        debit: number;
        credit: number;
        balance: number;
      }>
    >((rows, item) => {
      const previousBalance = rows.at(-1)?.balance ?? 0;
      rows.push({ ...item, balance: previousBalance + item.debit - item.credit });
      return rows;
    }, []);
  return (
    <div className="space-y-4">
      <section className="rounded-xl border bg-card p-4 shadow-card">
        <p className="text-sm text-muted-foreground">
          Current running {balanceLabel.toLowerCase()}
        </p>
        <p className="mt-1 text-2xl font-bold text-brand">{formatKES(balanceAmount)}</p>
      </section>
      <section data-scroll-reveal className="rounded-xl border bg-card p-5 shadow-card">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold text-brand">Pay fees with PayHero</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Request a secure mobile money prompt for your registered phone. Your student account
              is credited automatically after PayHero confirms the payment.
            </p>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={query.isFetching || statementMutation.isPending}
            onClick={() => void query.refetch()}
          >
            <RefreshCw /> Refresh balance
          </Button>
        </div>
        <form
          className="mt-4 flex flex-wrap items-end gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            paymentMutation.mutate();
          }}
        >
          <label className="min-w-52 flex-1 space-y-1.5 text-sm font-medium">
            Amount to pay (KES)
            <Input
              type="number"
              min="1"
              max={Math.floor(outstanding)}
              step="1"
              required
              disabled={outstanding < 1 || paymentMutation.isPending}
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              placeholder={`Balance: ${formatKES(outstanding)}`}
            />
          </label>
          <Button
            type="submit"
            disabled={outstanding < 1 || paymentMutation.isPending}
            loading={paymentMutation.isPending}
          >
            {paymentMutation.isPending ? "Sending prompt…" : "Send payment prompt"}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={statementMutation.isPending}
            loading={statementMutation.isPending}
            onClick={downloadStatement}
          >
            <Download />
            {statementMutation.isPending ? "Preparing…" : "Download fee statement"}
          </Button>
        </form>
        <p className="mt-3 text-xs text-muted-foreground">
          The PayHero channel must be connected to the school’s Equity Bank Paybill. Only approve a
          prompt you requested.
        </p>
      </section>
      <section data-scroll-reveal className="rounded-xl border bg-card p-5 shadow-card">
        <h2 className="font-semibold text-brand">Fee statement · {studentNumber}</h2>
        {ledger.length ? (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b text-xs uppercase text-muted-foreground">
                  <th className="px-3 py-2">Date</th>
                  <th className="px-3 py-2">Description</th>
                  <th className="px-3 py-2 text-right">Fees (KES)</th>
                  <th className="px-3 py-2 text-right">Paid (KES)</th>
                  <th className="px-3 py-2 text-right">Running balance (KES)</th>
                </tr>
              </thead>
              <tbody>
                {ledger.map((entry) => (
                  <tr key={entry.id} className="border-b last:border-0">
                    <td className="whitespace-nowrap px-3 py-3">
                      {new Date(entry.date).toLocaleDateString("en-KE")}
                    </td>
                    <td className="px-3 py-3">{entry.description}</td>
                    <td className="px-3 py-3 text-right">
                      {entry.debit ? formatKES(entry.debit) : "—"}
                    </td>
                    <td className="px-3 py-3 text-right">
                      {entry.credit ? formatKES(entry.credit) : "—"}
                    </td>
                    <td className="px-3 py-3 text-right font-semibold">
                      {formatKES(entry.balance)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">
            No fee charges or confirmed payments have been recorded.
          </p>
        )}
      </section>
      <section data-scroll-reveal className="rounded-xl border bg-card p-5 shadow-card">
        <h2 className="font-semibold text-brand">Confirmed payments</h2>
        {query.data?.payments.length ? (
          <div className="mt-3 divide-y">
            {query.data.payments.map((payment) => (
              <div key={payment.id} className="flex justify-between gap-3 py-3 text-sm">
                <span>
                  {payment.provider === "payhero" ? "M-Pesa" : payment.method} ·{" "}
                  {new Date(payment.paid_at).toLocaleDateString("en-KE")}
                  {payment.provider !== "payhero" && payment.reference
                    ? ` · ${payment.reference}`
                    : ""}
                </span>
                <span className="flex flex-wrap items-center gap-1 font-semibold">
                  {formatKES(payment.amount)}
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={receiptMutation.isPending}
                    onClick={() => openReceipt(payment.id, "view")}
                  >
                    <Eye />
                    {receiptMutation.isPending &&
                    receiptMutation.variables?.paymentId === payment.id
                      ? "Preparing…"
                      : "View"}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={receiptMutation.isPending}
                    onClick={() => openReceipt(payment.id, "download")}
                    className={
                      receiptMutation.isPending &&
                      receiptMutation.variables?.paymentId === payment.id
                        ? "receipt-download-active"
                        : undefined
                    }
                  >
                    {receiptMutation.isPending &&
                    receiptMutation.variables?.paymentId === payment.id ? (
                      <Printer className="receipt-printing" />
                    ) : receiptReadyId === payment.id ? (
                      <CheckCircle2 className="receipt-ready text-success" />
                    ) : (
                      <Download />
                    )}
                    {receiptMutation.isPending &&
                    receiptMutation.variables?.paymentId === payment.id
                      ? "Preparing…"
                      : receiptReadyId === payment.id
                        ? "Download started"
                        : "Download"}
                  </Button>
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">
            No confirmed payments have been recorded.
          </p>
        )}
      </section>
      {receiptPreviewUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setReceiptPreviewUrl(null);
          }}
        >
          <section
            aria-labelledby="fee-receipt-title"
            aria-modal="true"
            className="flex h-[90vh] w-full max-w-5xl flex-col gap-4 rounded-lg border bg-background p-6 shadow-lg"
            role="dialog"
          >
            <header className="flex items-center justify-between">
              <h2 className="text-lg font-semibold leading-none" id="fee-receipt-title">
                Fee receipt
              </h2>
              <Button
                aria-label="Close receipt preview"
                onClick={() => setReceiptPreviewUrl(null)}
                size="icon"
                type="button"
                variant="ghost"
              >
                <X />
              </Button>
            </header>
            <iframe
              className="min-h-0 w-full flex-1 rounded-md border"
              src={receiptPreviewUrl}
              title="Fee receipt PDF preview"
              referrerPolicy="no-referrer"
            />
          </section>
        </div>
      )}
      {query.data?.notifications.length ? (
        <section data-scroll-reveal className="rounded-xl border bg-card p-5 shadow-card">
          <h2 className="font-semibold text-brand">Payment notifications</h2>
          <ul className="mt-3 divide-y">
            {query.data.notifications.map((notification) => (
              <li key={notification.id} className="py-3">
                <p className="text-sm font-medium">{notification.title}</p>
                <p className="mt-1 text-sm text-muted-foreground">{notification.body}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {new Date(notification.created_at).toLocaleString("en-KE")}
                </p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function ProfileSection({
  student,
  userId,
  photo,
  photoError,
  refresh,
}: {
  student: Student;
  userId: string;
  photo: ProfilePhoto | null;
  photoError: Error | null;
  refresh: () => void;
}) {
  const [phone, setPhone] = useState(student.phone ?? "");
  const [altPhone, setAltPhone] = useState(student.alt_phone ?? "");
  const [town, setTown] = useState(student.town ?? "");
  const [address, setAddress] = useState(student.address ?? "");
  const [busy, setBusy] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
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

    const { data, error: profileError } = await supabase
      .from("profiles")
      .update({ avatar_url: path })
      .eq("id", userId)
      .select("id")
      .maybeSingle();
    if (profileError || !data) {
      if (photo?.path !== path) {
        const { error: cleanupError } = await supabase.storage
          .from("profile-photos")
          .remove([path]);
        if (cleanupError)
          console.error("Could not clean up an unlinked profile photo:", cleanupError.message);
      }
      setPhotoBusy(false);
      toast.error("Could not save profile photo", {
        description: profileError?.message ?? "Your profile could not be updated.",
      });
      return;
    }

    if (photo?.path && photo.path !== path) {
      const { error: removeError } = await supabase.storage
        .from("profile-photos")
        .remove([photo.path]);
      if (removeError)
        toast.error("Photo updated, but the previous photo could not be removed", {
          description: removeError.message,
        });
    }

    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["profile-photo", userId] }),
      queryClient.invalidateQueries({ queryKey: ["admin", "student-profile-photos"] }),
    ]);
    setPhotoBusy(false);
    toast.success("Profile photo updated");
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    const { error } = await supabase.rpc("update_my_contact", {
      _phone: phone,
      _alt_phone: altPhone,
      _town: town,
      _address: address,
    });
    setBusy(false);
    if (error) toast.error("Could not save contact details", { description: error.message });
    else {
      toast.success("Contact details saved");
      refresh();
    }
  }
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.8fr)]">
      <form onSubmit={save} className="space-y-4 rounded-xl border bg-card p-5 shadow-card">
        <div className="flex items-center gap-4 border-b pb-4">
          <ProfilePhotoAvatar
            src={photo?.url}
            name={`${student.first_name} ${student.last_name}`}
            className="h-16 w-16 text-lg"
          />
          <div className="min-w-0 flex-1">
            <h2 className="font-semibold text-brand">Profile photo</h2>
            <p className="mt-1 text-xs text-muted-foreground">JPG, PNG or WebP · up to 3 MB</p>
            {photoError && (
              <p role="alert" className="mt-1 text-xs text-destructive">
                Could not load profile photo: {photoError.message}
              </p>
            )}
          </div>
          <input
            ref={photoInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            aria-label="Choose profile photo"
            onChange={(event) => void uploadPhoto(event)}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={photoBusy}
            onClick={() => photoInputRef.current?.click()}
          >
            <Camera />
            {photoBusy ? "Uploading…" : "Upload"}
          </Button>
        </div>
        <h2 className="font-semibold text-brand">Update contact details</h2>
        <label className="block space-y-1.5 text-sm font-medium">
          Phone
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
        </label>
        <label className="block space-y-1.5 text-sm font-medium">
          Alternative phone
          <Input value={altPhone} onChange={(e) => setAltPhone(e.target.value)} />
        </label>
        <label className="block space-y-1.5 text-sm font-medium">
          Town
          <Input value={town} onChange={(e) => setTown(e.target.value)} />
        </label>
        <label className="block space-y-1.5 text-sm font-medium">
          Address
          <Textarea rows={3} value={address} onChange={(e) => setAddress(e.target.value)} />
        </label>
        <Button disabled={busy} loading={busy}>
          {busy ? "Saving…" : "Save contact details"}
        </Button>
      </form>
      <section className="h-fit rounded-xl border bg-card p-5 shadow-card">
        <h2 className="font-semibold text-brand">Student record</h2>
        <dl className="mt-4 space-y-3 text-sm">
          {[
            ["Student number", student.student_number],
            ["Name", `${student.first_name} ${student.middle_name ?? ""} ${student.last_name}`],
            ["Email", student.email],
            ["National ID", student.national_id ?? "Not provided"],
            ["Status", student.status],
          ].map(([label, value]) => (
            <div key={label}>
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="font-medium">{value}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-4 text-xs text-muted-foreground">
          For corrections to your name, email or national ID, contact the registrar.
        </p>
      </section>
    </div>
  );
}

function PrivateStorageMedia({
  path,
  label,
  contentType,
}: {
  path: string;
  label: string;
  contentType?: string;
}) {
  const fileQuery = useQuery({
    queryKey: ["student", "learning-file-url", path],
    queryFn: async () => {
      const { data, error } = await supabase.storage.from("learning").createSignedUrl(path, 300);
      if (error) throw error;
      return data.signedUrl;
    },
    staleTime: 4 * 60_000,
  });
  const extension = path.split(".").pop()?.toLowerCase();
  const isVideo = contentType
    ? contentType === "video"
    : ["mp4", "m4v", "webm", "mov", "ogg"].includes(extension ?? "");
  const isAudio = contentType
    ? contentType === "audio"
    : ["mp3", "wav", "m4a", "oga"].includes(extension ?? "");
  const isImage = contentType
    ? contentType === "image"
    : ["jpg", "jpeg", "png", "gif", "webp"].includes(extension ?? "");

  if (fileQuery.isLoading)
    return <p className="mt-3 text-sm text-muted-foreground">Preparing {label.toLowerCase()}…</p>;
  if (fileQuery.error)
    return <ErrorCard error={fileQuery.error.message} retry={() => void fileQuery.refetch()} />;
  if (isVideo)
    return (
      <video
        className="mt-4 max-h-[32rem] w-full rounded-lg bg-black"
        src={fileQuery.data}
        controls
        playsInline
        preload="metadata"
      >
        Your browser does not support video playback.
      </video>
    );
  if (isAudio)
    return (
      <audio className="mt-4 w-full" src={fileQuery.data} controls preload="metadata">
        Your browser does not support audio playback.
      </audio>
    );
  if (isImage)
    return (
      <a href={fileQuery.data} target="_blank" rel="noreferrer">
        <img
          className="mt-4 max-h-[32rem] max-w-full rounded-lg object-contain"
          src={fileQuery.data}
          alt={label}
          loading="lazy"
        />
      </a>
    );
  return (
    <a
      className="mt-3 inline-flex text-sm font-medium text-primary hover:underline"
      href={fileQuery.data}
      target="_blank"
      rel="noreferrer"
      download
    >
      {label} ↗
    </a>
  );
}

function PortalMessage({
  title,
  detail,
  retry,
  action,
}: {
  title: string;
  detail?: string;
  retry?: () => void;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <section className="w-full max-w-xl rounded-xl border bg-card p-6 shadow-card">
        <h1 className="text-xl font-bold text-brand">{title}</h1>
        {detail && (
          <p role="alert" className="mt-3 text-sm text-muted-foreground">
            {detail}
          </p>
        )}
        {retry && (
          <Button variant="outline" className="mt-4" onClick={retry}>
            Retry
          </Button>
        )}
        {action && <div className="mt-4">{action}</div>}
      </section>
    </div>
  );
}
function Loading() {
  return (
    <div role="status" aria-label="Loading student information" className="space-y-4">
      <span className="sr-only">Loading…</span>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="loading-shimmer h-24 rounded-xl" />
        <div className="loading-shimmer h-24 rounded-xl" />
        <div className="loading-shimmer h-24 rounded-xl" />
      </div>
      <div className="loading-shimmer h-40 rounded-xl" />
    </div>
  );
}
function ErrorCard({ error, retry }: { error: string; retry: () => void }) {
  return (
    <section className="rounded-xl border border-destructive/30 bg-card p-5">
      <p role="alert" className="text-sm text-destructive">
        {error}
      </p>
      <Button variant="outline" className="mt-3" onClick={retry}>
        Retry
      </Button>
    </section>
  );
}
function Empty({ title, detail }: { title: string; detail: string }) {
  return (
    <section className="rounded-xl border border-dashed bg-card p-8 text-center">
      <h2 className="font-semibold text-brand">{title}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{detail}</p>
    </section>
  );
}
