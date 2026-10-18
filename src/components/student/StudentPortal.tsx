import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BookOpen,
  ClipboardList,
  Download,
  FileText,
  GraduationCap,
  LogOut,
  RefreshCw,
  UserRound,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useUser } from "@/lib/auth";
import { formatKES } from "@/lib/site";
import type { Tables } from "@/integrations/supabase/types";

type PortalSection =
  "overview" | "online" | "learning" | "assignments" | "results" | "fees" | "profile";
type Student = Tables<"students">;

export function StudentPortal({ selectedCourseId }: { selectedCourseId: string | null }) {
  const { user, loading } = useUser();
  const [section, setSection] = useState<PortalSection>("overview");
  const [enrollmentPhone, setEnrollmentPhone] = useState("");

  if (loading) return <PortalMessage title="Loading student portal…" />;
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
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

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
    <div className="flex min-h-screen items-center justify-center bg-brand px-4 py-10">
      <form
        onSubmit={submit}
        className="w-full max-w-md space-y-5 rounded-2xl border bg-card p-7 shadow-card"
      >
        <a href="/" className="text-sm font-medium text-primary hover:underline">
          ← Profia Institute website
        </a>
        <div>
          <p className="eyebrow">Profia student services</p>
          <h1 className="mt-2 text-2xl font-bold text-brand">
            {mode === "signin" ? "Student sign in" : "Create student account"}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
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
          <Input
            type="password"
            required
            minLength={8}
            autoComplete={mode === "signin" ? "current-password" : "new-password"}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        {error && (
          <p
            role="alert"
            className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
          >
            {error}
          </p>
        )}
        <Button className="w-full" disabled={busy}>
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
  useEffect(() => setPhoneDraft(enrollmentPhone), [enrollmentPhone]);
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
    const { error } = await supabase.auth.signOut();
    if (error) toast.error("Could not sign out", { description: error.message });
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
    results: "My results",
    fees: "Fees & payments",
    profile: "My profile",
  };
  const links: { id: PortalSection; title: string; icon: typeof BookOpen }[] = [
    { id: "overview", title: "Overview", icon: GraduationCap },
    { id: "online", title: "My online courses", icon: BookOpen },
    { id: "learning", title: "Learning materials", icon: BookOpen },
    { id: "assignments", title: "Assignments", icon: ClipboardList },
    { id: "results", title: "Results", icon: FileText },
    { id: "fees", title: "Fees", icon: Wallet },
    { id: "profile", title: "My profile", icon: UserRound },
  ];

  return (
    <div className="min-h-screen bg-muted/40">
      <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b bg-brand px-4 py-4 text-brand-foreground sm:px-6">
        <div>
          <a href="/" className="text-sm font-extrabold tracking-wide">
            PROFIA <span className="font-medium text-brand-foreground/70">· STUDENT PORTAL</span>
          </a>
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden max-w-48 truncate text-sm text-brand-foreground/70 sm:block">
            {email}
          </span>
          <Button size="sm" variant="heroOutline" onClick={() => void signOut()}>
            <LogOut /> Sign out
          </Button>
        </div>
      </header>
      <div className="mx-auto flex max-w-7xl flex-col lg:flex-row">
        <aside className="border-b bg-card p-3 lg:sticky lg:top-[65px] lg:h-[calc(100vh-65px)] lg:w-64 lg:shrink-0 lg:border-b-0 lg:border-r">
          <div className="hidden rounded-xl bg-cream p-4 lg:block">
            <p className="text-xs font-semibold uppercase tracking-wide text-primary">Student</p>
            <p className="mt-1 font-semibold text-brand">
              {student.first_name} {student.last_name}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">{student.student_number}</p>
          </div>
          <nav className="flex gap-1 overflow-x-auto lg:mt-5 lg:flex-col">
            {links.map(({ id, title, icon: Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => onSection(id)}
                className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium ${section === id ? "bg-brand text-brand-foreground" : "text-muted-foreground hover:bg-muted"}`}
              >
                <Icon className="h-4 w-4" />
                {title}
              </button>
            ))}
          </nav>
        </aside>
        <main className="min-w-0 flex-1 p-4 sm:p-6 lg:p-8">
          <div className="mx-auto max-w-5xl">
            <p className="eyebrow">Student services</p>
            <h1 className="mb-6 mt-1 text-2xl font-bold text-brand">{pageTitle[section]}</h1>
            {section === "overview" && <StudentOverview student={student} onNavigate={onSection} />}
            {section === "online" && <OnlineCoursesSection student={student} />}
            {section === "learning" && <LearningSection courseId={student.course_id} />}
            {section === "assignments" && <AssignmentsSection student={student} />}
            {section === "results" && <ResultsSection studentId={student.id} />}
            {section === "fees" && (
              <FeesSection
                studentId={student.id}
                studentNumber={student.student_number}
                userId={userId}
              />
            )}
            {section === "profile" && (
              <ProfileSection
                student={student}
                refresh={() =>
                  queryClient.invalidateQueries({ queryKey: ["student", "record", userId] })
                }
              />
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

function StudentOverview({
  student,
  onNavigate,
}: {
  student: Student;
  onNavigate: (section: PortalSection) => void;
}) {
  const coursesQuery = useQuery({
    queryKey: ["student", "course-enrollments", student.id],
    queryFn: async () => {
      const [academic, online] = await Promise.all([
        supabase.from("enrollments").select("course_id,status").eq("student_id", student.id),
        supabase
          .from("online_course_enrollments")
          .select("course_id,status")
          .eq("student_id", student.id),
      ]);
      if (academic.error) throw academic.error;
      if (online.error) throw online.error;

      const enrollments = new Map<
        string,
        { course_id: string; modes: Set<string>; statuses: Set<string> }
      >();
      for (const enrollment of academic.data ?? []) {
        const row = enrollments.get(enrollment.course_id) ?? {
          course_id: enrollment.course_id,
          modes: new Set<string>(),
          statuses: new Set<string>(),
        };
        row.modes.add("Academic");
        row.statuses.add(enrollment.status);
        enrollments.set(enrollment.course_id, row);
      }
      for (const enrollment of online.data ?? []) {
        const row = enrollments.get(enrollment.course_id) ?? {
          course_id: enrollment.course_id,
          modes: new Set<string>(),
          statuses: new Set<string>(),
        };
        row.modes.add("Online");
        row.statuses.add(enrollment.status);
        enrollments.set(enrollment.course_id, row);
      }
      if (student.course_id && !enrollments.has(student.course_id)) {
        enrollments.set(student.course_id, {
          course_id: student.course_id,
          modes: new Set([student.study_mode === "online" ? "Online" : "Academic"]),
          statuses: new Set(["assigned"]),
        });
      }

      const ids = [...enrollments.keys()];
      if (!ids.length) return [];
      const { data: courses, error: courseError } = await supabase
        .from("courses")
        .select("id,title,duration")
        .in("id", ids);
      if (courseError) throw courseError;
      const courseById = new Map(courses.map((course) => [course.id, course]));
      return [...enrollments.values()].map((enrollment) => ({
        course_id: enrollment.course_id,
        title: courseById.get(enrollment.course_id)?.title ?? "Course no longer available",
        duration: courseById.get(enrollment.course_id)?.duration ?? null,
        modes: [...enrollment.modes],
        statuses: [...enrollment.statuses],
      }));
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
      queryKey: ["student", "assignments", student.id, student.course_id],
      enabled: !!student.course_id,
      queryFn: async () => {
        const { data, error } = await supabase
          .from("assignments")
          .select("id")
          .eq("course_id", student.course_id!)
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
      <section className="rounded-2xl bg-gradient-brand p-6 text-brand-foreground shadow-card sm:p-8">
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
      <section className="rounded-xl border bg-card p-5 shadow-card">
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
      <section className="rounded-xl border bg-card p-5 shadow-card">
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
        <article key={material.id} className="rounded-xl border bg-card p-5 shadow-card">
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
type OnlineLesson = Tables<"online_course_lessons">;
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
              <FeeMetric label="Tuition paid" value={formatKES(tuitionPaid)} />
              <FeeMetric
                label="Tuition balance"
                value={formatKES(Math.max(0, tuitionTarget - tuitionPaid))}
              />
              <FeeMetric
                label="Exam + certificate fees"
                value={formatKES(selectedEnrollment.exam_fee + selectedEnrollment.certificate_fee)}
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
                {selectedEnrollment.exam_fee > 0 && (
                  <Button
                    variant="outline"
                    disabled={
                      payPending ||
                      confirmedPayments.some((payment) => payment.stage === "exam_fee")
                    }
                    onClick={() => paymentMutation.mutate("exam_fee")}
                  >
                    Pay exam fee · {formatKES(selectedEnrollment.exam_fee)}
                  </Button>
                )}
                {selectedEnrollment.certificate_fee > 0 && (
                  <Button
                    variant="outline"
                    disabled={
                      payPending ||
                      confirmedPayments.some((payment) => payment.stage === "certificate_fee")
                    }
                    onClick={() => paymentMutation.mutate("certificate_fee")}
                  >
                    Pay certificate fee · {formatKES(selectedEnrollment.certificate_fee)}
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
  lesson: Omit<OnlineLesson, "course_id" | "created_at" | "updated_at"> & {
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

function AssignmentsSection({ student }: { student: Student }) {
  const assignmentsQuery = useQuery({
    queryKey: ["student", "assignment-list", student.id, student.course_id],
    enabled: !!student.course_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("assignments")
        .select("*")
        .eq("course_id", student.course_id!)
        .eq("published", true);
      if (error) throw error;
      return data;
    },
  });
  const submissionsQuery = useQuery({
    queryKey: ["student", "assignment-submissions", student.id],
    enabled: !!student.course_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("submissions")
        .select("*")
        .eq("student_id", student.id);
      if (error) throw error;
      return data;
    },
  });
  if (!student.course_id)
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
        return (
          <article key={assignment.id} className="rounded-xl border bg-card p-5 shadow-card">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <h2 className="font-semibold text-brand">{assignment.title}</h2>
              <Badge variant={submission ? "default" : "secondary"}>
                {submission?.status ?? "Not submitted"}
              </Badge>
            </div>
            {assignment.instructions && (
              <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">
                {assignment.instructions}
              </p>
            )}
            {assignment.due_date && (
              <p className="mt-3 text-xs text-muted-foreground">
                Due {new Date(assignment.due_date).toLocaleString("en-KE")}
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
            {submissionsQuery.isLoading ? (
              <p className="mt-4 border-t pt-4 text-sm text-muted-foreground">
                Checking your submission…
              </p>
            ) : submissionsQuery.error ? null : (
              <SubmitAssignment
                student={student}
                assignmentId={assignment.id}
                {...(submission?.id ? { existingId: submission.id } : {})}
              />
            )}
          </article>
        );
      })}
    </div>
  ) : (
    <Empty
      title="No assignments yet"
      detail="Published assignments for your course will appear here."
    />
  );
}

function SubmitAssignment({
  student,
  assignmentId,
  existingId,
}: {
  student: Student;
  assignmentId: string;
  existingId?: string;
}) {
  const queryClient = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit() {
    if (!file && !comment.trim()) {
      toast.error("Add a file or a submission comment.");
      return;
    }
    setBusy(true);
    let filePath: string | null = null;
    if (file) {
      const path = `${student.id}/${assignmentId}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
      const { error: uploadError } = await supabase.storage.from("submissions").upload(path, file);
      if (uploadError) {
        setBusy(false);
        toast.error("Could not upload submission", { description: uploadError.message });
        return;
      }
      filePath = path;
    }
    const { error } = existingId
      ? await supabase
          .from("submissions")
          .update({
            file_path: filePath,
            comment: comment.trim() || null,
            status: "submitted",
            submitted_at: new Date().toISOString(),
          })
          .eq("id", existingId)
      : await supabase.from("submissions").insert({
          assignment_id: assignmentId,
          student_id: student.id,
          file_path: filePath,
          comment: comment.trim() || null,
        });
    setBusy(false);
    if (error) toast.error("Could not submit assignment", { description: error.message });
    else {
      toast.success("Assignment submitted");
      await queryClient.invalidateQueries({
        queryKey: ["student", "assignment-submissions", student.id],
      });
    }
  }
  return (
    <div className="mt-4 space-y-2 border-t pt-4">
      <label className="block text-sm font-medium">
        Your comment
        <Textarea rows={2} value={comment} onChange={(event) => setComment(event.target.value)} />
      </label>
      <label className="block text-sm font-medium">
        Submission file
        <input
          className="mt-1 block w-full text-sm"
          type="file"
          onChange={(event) => setFile(event.target.files?.[0] ?? null)}
        />
      </label>
      <Button className="mt-2" size="sm" disabled={busy} onClick={() => void submit()}>
        {busy ? "Submitting…" : existingId ? "Update submission" : "Submit assignment"}
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
  const query = useQuery({
    queryKey: ["student", "fees", studentId],
    queryFn: async () => {
      const [fees, payments, documents, notifications] = await Promise.all([
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
          .from("fee_documents")
          .select("id,payment_id,document_type,storage_path,created_at")
          .eq("student_id", studentId)
          .order("created_at", { ascending: false }),
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
      if (documents.error) throw documents.error;
      if (notifications.error) throw notifications.error;
      return {
        fees: fees.data,
        payments: payments.data,
        documents: documents.data,
        notifications: notifications.data,
      };
    },
    refetchInterval: 20_000,
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
    mutationFn: async () => {
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
      return data.signedUrl;
    },
    onSuccess: (signedUrl) => {
      window.open(signedUrl, "_blank", "noopener,noreferrer");
      void queryClient.invalidateQueries({ queryKey: ["student", "fees", studentId] });
    },
    onError: (error) =>
      toast.error("Could not download fee statement", {
        description: error instanceof Error ? error.message : "Please retry.",
      }),
  });
  async function downloadReceipt(path: string) {
    const { data, error } = await supabase.storage.from("fee-documents").createSignedUrl(path, 300);
    if (error) {
      toast.error("Could not prepare receipt download", { description: error.message });
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }
  if (query.isLoading) return <Loading />;
  if (query.error) return <ErrorCard error={query.error.message} retry={() => query.refetch()} />;
  const billed = query.data?.fees.reduce((sum, fee) => sum + Number(fee.amount), 0) ?? 0;
  const paid = query.data?.payments.reduce((sum, payment) => sum + Number(payment.amount), 0) ?? 0;
  const hasCredit = paid > billed;
  const balanceLabel = hasCredit ? "Credit" : "Balance";
  const balanceAmount = Math.abs(billed - paid);
  const receiptByPayment = new Map<string, string>();
  for (const document of query.data?.documents ?? []) {
    if (document.document_type === "receipt" && document.payment_id)
      receiptByPayment.set(document.payment_id, document.storage_path);
  }
  const outstanding = Math.max(0, billed - paid);
  return (
    <div className="space-y-4">
      <section className="grid gap-3 sm:grid-cols-3">
        {[
          ["Total charges", billed],
          ["Payments", paid],
          [balanceLabel, balanceAmount],
        ].map(([label, amount]) => (
          <div key={String(label)} className="rounded-xl border bg-card p-4 shadow-card">
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="mt-2 text-xl font-bold text-brand">{formatKES(Number(amount))}</p>
          </div>
        ))}
      </section>
      <section className="rounded-xl border bg-card p-5 shadow-card">
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
          <Button type="submit" disabled={outstanding < 1 || paymentMutation.isPending}>
            {paymentMutation.isPending ? "Sending prompt…" : "Send payment prompt"}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={statementMutation.isPending}
            onClick={() => statementMutation.mutate()}
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
      <section className="rounded-xl border bg-card p-5 shadow-card">
        <h2 className="font-semibold text-brand">Billed charges · {studentNumber}</h2>
        {query.data?.fees.length ? (
          <div className="mt-3 divide-y">
            {query.data.fees.map((fee) => (
              <div key={fee.id} className="flex justify-between gap-3 py-3 text-sm">
                <span>
                  {fee.description}
                  {fee.due_date ? ` · Due ${fee.due_date}` : ""}
                </span>
                <span className="font-semibold">{formatKES(fee.amount)}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">No fee charges have been recorded.</p>
        )}
      </section>
      <section className="rounded-xl border bg-card p-5 shadow-card">
        <h2 className="font-semibold text-brand">Confirmed payments</h2>
        {query.data?.payments.length ? (
          <div className="mt-3 divide-y">
            {query.data.payments.map((payment) => (
              <div key={payment.id} className="flex justify-between gap-3 py-3 text-sm">
                <span>
                  {payment.method} · {new Date(payment.paid_at).toLocaleDateString("en-KE")}
                  {payment.reference ? ` · ${payment.reference}` : ""}
                </span>
                <span className="flex items-center gap-3 font-semibold">
                  {formatKES(payment.amount)}
                  {receiptByPayment.has(payment.id) && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => void downloadReceipt(receiptByPayment.get(payment.id)!)}
                    >
                      <Download /> Receipt
                    </Button>
                  )}
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
      {query.data?.notifications.length ? (
        <section className="rounded-xl border bg-card p-5 shadow-card">
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

function ProfileSection({ student, refresh }: { student: Student; refresh: () => void }) {
  const [phone, setPhone] = useState(student.phone ?? "");
  const [altPhone, setAltPhone] = useState(student.alt_phone ?? "");
  const [town, setTown] = useState(student.town ?? "");
  const [address, setAddress] = useState(student.address ?? "");
  const [busy, setBusy] = useState(false);
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
        <Button disabled={busy}>{busy ? "Saving…" : "Save contact details"}</Button>
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
    <div
      role="status"
      className="animate-pulse rounded-xl border bg-card p-8 text-sm text-muted-foreground"
    >
      Loading…
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
