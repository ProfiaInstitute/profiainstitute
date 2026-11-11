import { Fragment, useMemo, useRef, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  ArrowDownToLine,
  Ban,
  BookOpen,
  CalendarDays,
  ChartNoAxesCombined,
  ClipboardList,
  ClipboardCheck,
  CreditCard,
  Eye,
  EyeOff,
  FileText,
  GraduationCap,
  LayoutDashboard,
  LogOut,
  Mail,
  Megaphone,
  MonitorPlay,
  Newspaper,
  Search,
  Settings,
  ShieldCheck,
  KeyRound,
  RotateCcw,
  Trash2,
  UserPlus,
  Users,
  UsersRound,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { createExcelWorkbook, exportColumnLabel, sanitizeExportRows } from "@/lib/excel-export";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { LevelTargetPicker } from "@/components/academics/LevelTargetPicker";
import { AdmissionLetterDownload } from "@/components/academics/AdmissionLetterDownload";
import { EmailFileShareDialog } from "@/components/admin/EmailFileShareDialog";
import { ProfilePhotoAvatar } from "@/components/profile/ProfilePhotoAvatar";
import { ManagementPanel } from "@/components/admin/ManagementPanel";
import { FaqManagementPanel } from "@/components/admin/FaqManagementPanel";
import { StudentProgressionPanel } from "@/components/admin/StudentProgressionPanel";
import { AssignmentSubmissionsPanel } from "@/components/admin/AssignmentSubmissionsPanel";
import { CatManagementPanel } from "@/components/admin/CatManagementPanel";
import { CatResultsPanel } from "@/components/admin/CatResultsPanel";
import { OnlineCourseLmsPanel } from "@/components/admin/OnlineCourseLmsPanel";
import { PayHeroSettingsPanel } from "@/components/admin/PayHeroSettingsPanel";
import { FeeStatementTemplatePanel } from "@/components/admin/FeeStatementTemplatePanel";
import { SiteMediaManager } from "@/components/admin/SiteMediaManager";
import { SiteCopyManager } from "@/components/admin/SiteCopyManager";
import { PasswordResetPage } from "@/components/auth/PasswordResetPage";
import { PortalInboxPanel } from "@/components/admin/PortalInboxPanel";
import { CourseFeedbackPanel } from "@/components/admin/CourseFeedbackPanel";
import { FacilitatorManager } from "@/components/admin/FacilitatorManager";
import { SystemUsersPanel } from "@/components/admin/SystemUsersPanel";
import { RegulatoryActionTracker } from "@/components/admin/RegulatoryActionTracker";
import { ExamCandidateManager } from "@/components/admin/ExamCandidateManager";
import { HolidayProgramAdminPanel } from "@/components/admin/HolidayProgramAdminPanel";
import { NotificationBell } from "@/components/site/NotificationBell";
import { supabase } from "@/integrations/supabase/client";
import { can, signOutWithAudit, useRoles, useUser, type AppRole } from "@/lib/auth";
import type { Enums, Json, Tables } from "@/integrations/supabase/types";
import {
  contentKind,
  MAX_CONTENT_UPLOAD_SIZE,
  safeUploadFileName,
  supportedContentType,
} from "@/lib/file-uploads";
import { downloadContentAttachment } from "@/lib/content-download";
import { formatKES } from "@/lib/site";
import { useScrollReveal } from "@/lib/motion";
import { fetchProfilePhotos } from "@/lib/profile-photos";
import { formatAuditTime, summarizeAuditChange } from "@/lib/audit-log";

type DashboardSection =
  | "dashboard"
  | "applications"
  | "students"
  | "faqs"
  | "courses"
  | "schools"
  | "admissions"
  | "holiday-program"
  | "academics"
  | "results"
  | "fees"
  | "payhero"
  | "materials"
  | "lms"
  | "assignments"
  | "progression"
  | "regulatory"
  | "exam-candidates"
  | "articles"
  | "announcements"
  | "memos"
  | "media"
  | "site-copy"
  | "messages"
  | "student-inbox"
  | "course-feedback"
  | "facilitators"
  | "reports"
  | "online-users"
  | "audit"
  | "staff"
  | "users"
  | "settings";

type StaffAccount = {
  user_id: string;
  email: string | null;
  full_name: string;
  roles: AppRole[];
  status: "active" | "pending" | "suspended";
  created_at: string;
};

function isStaffStatus(status: string): status is StaffAccount["status"] {
  return status === "active" || status === "pending" || status === "suspended";
}

const navItems: { id: DashboardSection; title: string; icon: LucideIcon; roles: AppRole[] }[] = [
  {
    id: "dashboard",
    title: "Dashboard",
    icon: LayoutDashboard,
    roles: ["super_admin", "admissions_admin", "academic_admin", "content_admin"],
  },
  {
    id: "applications",
    title: "Applications",
    icon: ClipboardList,
    roles: ["super_admin", "admissions_admin"],
  },
  {
    id: "students",
    title: "Students",
    icon: Users,
    roles: ["super_admin", "academic_admin", "admissions_admin"],
  },
  {
    id: "faqs",
    title: "FAQs & Search Insights",
    icon: Search,
    roles: ["super_admin", "content_admin"],
  },
  { id: "courses", title: "Courses", icon: BookOpen, roles: ["super_admin", "academic_admin"] },
  {
    id: "schools",
    title: "Schools",
    icon: GraduationCap,
    roles: ["super_admin", "academic_admin", "content_admin"],
  },
  {
    id: "admissions",
    title: "Admissions",
    icon: CalendarDays,
    roles: ["super_admin", "admissions_admin", "academic_admin"],
  },
  {
    id: "holiday-program",
    title: "Holiday program",
    icon: CalendarDays,
    roles: ["super_admin", "admissions_admin"],
  },
  { id: "academics", title: "Academics", icon: BookOpen, roles: ["super_admin", "academic_admin"] },
  { id: "results", title: "Results", icon: FileText, roles: ["super_admin", "academic_admin"] },
  { id: "fees", title: "Fees", icon: Wallet, roles: ["super_admin"] },
  { id: "payhero", title: "PayHero payments", icon: CreditCard, roles: ["super_admin"] },
  {
    id: "materials",
    title: "Learning Materials",
    icon: FileText,
    roles: ["super_admin", "academic_admin"],
  },
  {
    id: "lms",
    title: "Online Course LMS",
    icon: MonitorPlay,
    roles: ["super_admin", "academic_admin"],
  },
  {
    id: "assignments",
    title: "Assignments",
    icon: ClipboardList,
    roles: ["super_admin", "academic_admin"],
  },
  {
    id: "progression",
    title: "Student Progression",
    icon: GraduationCap,
    roles: ["super_admin", "academic_admin"],
  },
  {
    id: "regulatory",
    title: "Regulatory & exams",
    icon: ShieldCheck,
    roles: ["super_admin", "admissions_admin", "academic_admin"],
  },
  {
    id: "exam-candidates",
    title: "Exam candidates",
    icon: ClipboardCheck,
    roles: ["super_admin", "academic_admin"],
  },
  { id: "articles", title: "Articles", icon: Newspaper, roles: ["super_admin", "content_admin"] },
  {
    id: "announcements",
    title: "Announcements",
    icon: Megaphone,
    roles: ["super_admin"],
  },
  { id: "memos", title: "Memos", icon: FileText, roles: ["super_admin", "content_admin"] },
  {
    id: "site-copy",
    title: "Homepage & About copy",
    icon: Newspaper,
    roles: ["super_admin", "content_admin"],
  },
  {
    id: "media",
    title: "Site media & banners",
    icon: FileText,
    roles: ["super_admin", "content_admin"],
  },
  { id: "messages", title: "Messages", icon: Mail, roles: ["super_admin", "admissions_admin"] },
  {
    id: "student-inbox",
    title: "Student portal inbox",
    icon: Mail,
    roles: ["super_admin", "admissions_admin", "academic_admin"],
  },
  {
    id: "course-feedback",
    title: "Student feedback",
    icon: Mail,
    roles: ["super_admin", "admissions_admin", "academic_admin"],
  },
  {
    id: "reports",
    title: "Reports",
    icon: ChartNoAxesCombined,
    roles: ["super_admin", "admissions_admin", "academic_admin"],
  },
  { id: "online-users", title: "Online users", icon: UsersRound, roles: ["super_admin"] },
  { id: "audit", title: "Audit Logs", icon: Activity, roles: ["super_admin"] },
  { id: "staff", title: "Staff", icon: Users, roles: ["super_admin"] },
  { id: "users", title: "System users", icon: UsersRound, roles: ["super_admin"] },
  { id: "facilitators", title: "Facilitators", icon: Users, roles: ["super_admin"] },
  {
    id: "settings",
    title: "Account settings",
    icon: Settings,
    roles: ["super_admin", "admissions_admin", "academic_admin", "content_admin"],
  },
];

const navGroups: { title: string; ids: DashboardSection[] }[] = [
  { title: "Overview", ids: ["dashboard"] },
  {
    title: "Students & admissions",
    ids: [
      "applications",
      "students",
      "admissions",
      "holiday-program",
      "messages",
      "student-inbox",
      "course-feedback",
    ],
  },
  {
    title: "Academics & finance",
    ids: [
      "courses",
      "schools",
      "academics",
      "results",
      "fees",
      "payhero",
      "materials",
      "lms",
      "assignments",
      "progression",
      "regulatory",
      "exam-candidates",
    ],
  },
  {
    title: "Website content",
    ids: ["faqs", "articles", "announcements", "memos", "media", "site-copy"],
  },
  {
    title: "Administration",
    ids: ["reports", "online-users", "audit", "staff", "users", "facilitators", "settings"],
  },
];

export function StaffDashboard() {
  const { user, loading, error: sessionError } = useUser();
  const rolesQuery = useRoles(user?.id);
  const roles = rolesQuery.data ?? [];
  const visibleNav = navItems.filter((item) => item.roles.some((role) => can(roles, [role])));
  const [section, setSection] = useState<DashboardSection>("dashboard");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  useScrollReveal(contentRef, `${section}:${roles.join(",")}`, true);
  const [passwordSetup, setPasswordSetup] = useState(
    () =>
      typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).get("setupPassword") === "1",
  );
  const [passwordReset, setPasswordReset] = useState(
    () =>
      typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).get("resetPassword") === "1",
  );

  if (loading) return <FullPageMessage title="Loading secure workspace…" />;
  if (sessionError)
    return (
      <FullPageMessage
        title="Could not load your sign-in session"
        detail={sessionError.message}
        retry={() => window.location.reload()}
      />
    );
  if (passwordReset) {
    return (
      <PasswordResetPage
        destination="/admin"
        forced={user?.app_metadata?.["password_reset_required"] === true}
        onComplete={() => {
          window.history.replaceState({}, "", "/admin");
          setPasswordReset(false);
        }}
      />
    );
  }
  if (user && rolesQuery.isLoading) return <FullPageMessage title="Loading secure workspace…" />;
  if (user?.app_metadata?.["password_reset_required"] === true) {
    return (
      <PasswordResetPage
        destination="/admin"
        forced
        onComplete={() => {
          window.history.replaceState({}, "", "/admin");
          setPasswordReset(false);
        }}
      />
    );
  }
  if (passwordSetup) {
    return (
      <StaffPasswordSetup
        email={user?.email ?? null}
        onComplete={() => {
          window.history.replaceState({}, "", "/admin");
          setPasswordSetup(false);
        }}
        onExpired={() => {
          window.history.replaceState({}, "", "/admin");
          setPasswordSetup(false);
        }}
      />
    );
  }
  if (!user) return <StaffSignIn />;
  if (rolesQuery.error)
    return (
      <FullPageMessage
        title="Could not verify your staff role"
        detail={rolesQuery.error.message}
        retry={() => rolesQuery.refetch()}
      />
    );
  if (
    roles.includes("facilitator") &&
    !roles.some((role) =>
      ["super_admin", "admissions_admin", "academic_admin", "content_admin"].includes(role),
    )
  ) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
        <section className="w-full max-w-lg rounded-xl border bg-card p-6 shadow-card">
          <h1 className="text-xl font-bold text-brand">Use the facilitator portal</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            This account is assigned to teach specific course units.
          </p>
          <Button asChild className="mt-4">
            <a href="/facilitator">Open facilitator portal</a>
          </Button>
        </section>
      </div>
    );
  }
  if (visibleNav.length === 0) return <InitialAdminSetup userId={user.id} email={user.email} />;

  const sectionTitle = navItems.find((item) => item.id === section)?.title ?? "Dashboard";
  const content =
    section === "dashboard" ? (
      <Overview onNavigate={setSection} />
    ) : section === "media" ? (
      <SiteMediaManager />
    ) : section === "site-copy" ? (
      <SiteCopyManager />
    ) : section === "applications" ? (
      <ApplicationsPanel />
    ) : section === "students" ? (
      <StudentsPanel
        canManage={can(roles, ["academic_admin"])}
        canViewDocuments={can(roles, ["admissions_admin"])}
        canManageDocuments={can(roles, ["admissions_admin"])}
        canViewAcademicRecords={can(roles, ["academic_admin"])}
        canViewFinancialRecords={can(roles, ["super_admin"])}
        userId={user.id}
      />
    ) : section === "faqs" ? (
      <FaqManagementPanel />
    ) : section === "courses" || section === "admissions" ? (
      <ManagementPanel />
    ) : section === "reports" ? (
      <ReportsPanel />
    ) : section === "online-users" ? (
      <OnlineUsersPanel />
    ) : section === "audit" ? (
      <AuditLogPanel />
    ) : section === "settings" ? (
      <StaffPasswordSettings email={user.email ?? ""} />
    ) : section === "staff" ? (
      <StaffSettings />
    ) : section === "users" ? (
      <SystemUsersPanel />
    ) : section === "progression" ? (
      <StudentProgressionPanel />
    ) : section === "regulatory" ? (
      <RegulatoryActionTracker />
    ) : section === "exam-candidates" ? (
      <ExamCandidateManager />
    ) : section === "student-inbox" ? (
      <PortalInboxPanel />
    ) : section === "course-feedback" ? (
      <CourseFeedbackPanel />
    ) : section === "facilitators" ? (
      <FacilitatorManager />
    ) : section === "holiday-program" ? (
      <HolidayProgramAdminPanel />
    ) : section === "lms" ? (
      <OnlineCourseLmsPanel />
    ) : section === "fees" ? (
      <>
        <FeeManagementPanel />
        <FeeStatementTemplatePanel />
        <DataDirectory section={section} />
      </>
    ) : section === "payhero" ? (
      <PayHeroSettingsPanel />
    ) : (
      <DataDirectory section={section} />
    );

  return (
    <div className="admin-workspace min-h-screen bg-muted/40 text-foreground">
      <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-border/70 bg-background/95 px-4 text-foreground shadow-sm backdrop-blur sm:px-6">
        <div className="flex items-center gap-3">
          <button
            type="button"
            className="rounded-lg p-2 text-brand hover:bg-accent lg:hidden"
            aria-label="Toggle navigation"
            onClick={() => setMobileNavOpen(!mobileNavOpen)}
          >
            <LayoutDashboard className="h-5 w-5" />
          </button>
          <a href="/" className="flex items-center gap-2.5">
            <img src="/images/logo.png" alt="" className="h-10 w-auto" />
            <span>
              <span className="block text-sm font-extrabold leading-tight text-brand">PROFIA</span>
              <span className="hidden text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground sm:block">
                Administration
              </span>
            </span>
          </a>
        </div>
        <div className="flex items-center gap-3">
          <NotificationBell
            userId={user.id}
            onNavigate={(category) =>
              setSection(
                category === "messages"
                  ? "student-inbox"
                  : category === "academics"
                    ? "progression"
                    : "course-feedback",
              )
            }
          />
          <span className="hidden max-w-48 truncate text-sm text-muted-foreground sm:block">
            {user.email}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              const result = await signOutWithAudit();
              if (result.error) {
                toast.error(
                  result.signedOut
                    ? "Signed out, but activity recording was incomplete"
                    : "Could not sign out",
                  { description: result.error.message },
                );
              }
            }}
          >
            <LogOut /> <span className="hidden sm:inline">Sign out</span>
          </Button>
        </div>
      </header>
      <div className="mx-auto flex max-w-[1600px]">
        <aside
          className={`${mobileNavOpen ? "block" : "hidden"} fixed inset-y-16 left-0 z-20 w-72 overflow-y-auto border-r bg-card p-4 shadow-card lg:sticky lg:top-16 lg:block lg:h-[calc(100vh-4rem)] lg:shrink-0 lg:shadow-none`}
        >
          <p className="px-3 pb-2 pt-2 text-xs font-semibold uppercase tracking-widest text-primary">
            Profia workspace
          </p>
          <nav className="space-y-5" aria-label="Admin workspace">
            {navGroups.map((group) => {
              const items = visibleNav.filter((item) => group.ids.includes(item.id));
              if (!items.length) return null;
              return (
                <div key={group.title}>
                  <p className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/80">
                    {group.title}
                  </p>
                  <div className="space-y-0.5">
                    {items.map(({ id, title, icon: Icon }) => (
                      <button
                        key={id}
                        type="button"
                        onClick={() => {
                          setSection(id);
                          setMobileNavOpen(false);
                        }}
                        className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition ${section === id ? "bg-accent text-brand shadow-sm ring-1 ring-primary/15" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
                      >
                        <Icon className="h-4 w-4 shrink-0" />
                        {title}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </nav>
          <div className="mt-8 rounded-xl border bg-cream p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-primary">
              Signed in as
            </p>
            <p className="mt-1 truncate text-sm font-semibold text-brand">
              {roles.map((role) => role.replaceAll("_", " ")).join(", ")}
            </p>
          </div>
        </aside>
        <main className="min-w-0 flex-1 p-4 sm:p-6 lg:p-8">
          <div className="mx-auto max-w-6xl">
            <div className="mb-6 flex items-center justify-between gap-3">
              <div>
                <p className="eyebrow">Profia Institute · Administration</p>
                <h1 className="mt-1 text-2xl font-bold text-brand sm:text-3xl">{sectionTitle}</h1>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="hidden sm:inline-flex"
                aria-label="Go to staff dashboard"
                onClick={() => setSection("dashboard")}
              >
                Staff workspace
              </Button>
            </div>
            <div key={section} ref={contentRef} className="dashboard-section-transition">
              {content}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

function InitialAdminSetup({ userId, email }: { userId: string; email: string | undefined }) {
  const queryClient = useQueryClient();
  const setupQuery = useQuery({
    queryKey: ["admin", "bootstrap-available"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("super_admin_exists");
      if (error) throw error;
      return !data;
    },
  });
  const [claiming, setClaiming] = useState(false);
  async function claim() {
    setClaiming(true);
    const { data, error } = await supabase.rpc("claim_first_super_admin");
    setClaiming(false);
    if (error) toast.error("Could not claim initial admin role", { description: error.message });
    else if (!data) toast.error("This account is not allowlisted for initial setup.");
    else {
      toast.success("Initial Super Admin role claimed");
      await queryClient.invalidateQueries({ queryKey: ["my_roles", userId] });
    }
  }
  if (setupQuery.isLoading) return <FullPageMessage title="Checking admin setup…" />;
  if (setupQuery.error)
    return (
      <FullPageMessage
        title="Could not check admin setup"
        detail={setupQuery.error.message}
        retry={() => void setupQuery.refetch()}
      />
    );
  if (setupQuery.data)
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
        <section className="w-full max-w-lg space-y-4 rounded-xl border bg-card p-6 shadow-card">
          <ShieldCheck className="h-7 w-7 text-primary" />
          <h1 className="text-xl font-bold text-brand">Complete first Super Admin setup</h1>
          <p className="text-sm text-muted-foreground">
            Signed in as{" "}
            <span className="font-semibold text-foreground">
              {email || "an account without an email"}
            </span>
            . This exact email must be allowlisted in the Supabase database before this account can
            claim the first Super Admin role. Add it to <code>public.super_admin_setup</code> in the
            Supabase SQL Editor, then return here and claim the role.
          </p>
          <Button disabled={claiming} onClick={() => void claim()}>
            {claiming ? "Verifying account…" : "Claim first Super Admin role"}
          </Button>
        </section>
      </div>
    );
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <section className="w-full max-w-lg space-y-4 rounded-xl border bg-card p-6 shadow-card">
        <ShieldCheck className="h-7 w-7 text-primary" />
        <h1 className="text-xl font-bold text-brand">Awaiting staff approval</h1>
        <p className="text-sm text-muted-foreground">
          Your account{email ? ` (${email})` : ""} does not have a staff role. Staff access is
          created through an invitation from a Super Admin. Ask the Institute administrator to
          invite you to the correct role.
        </p>
        <Button
          variant="outline"
          onClick={async () => {
            const result = await signOutWithAudit();
            if (result.error) {
              toast.error(
                result.signedOut
                  ? "Signed out, but activity recording was incomplete"
                  : "Could not sign out",
                { description: result.error.message },
              );
            }
          }}
        >
          <LogOut className="mr-2 h-4 w-4" />
          Sign out
        </Button>
      </section>
    </div>
  );
}

function StaffPasswordSetup({
  email,
  onComplete,
  onExpired,
}: {
  email: string | null;
  onComplete: () => void;
  onExpired: () => void;
}) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (password.length < 8) {
      setError("Use a password with at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("The passwords do not match.");
      return;
    }
    setBusy(true);
    const { error: passwordError } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (passwordError) {
      setError(passwordError.message);
      return;
    }
    toast.success("Password set", {
      description: "Your staff account is ready. You can now use the admin workspace.",
    });
    onComplete();
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-brand px-4 py-10">
      {email ? (
        <form
          onSubmit={submit}
          className="w-full max-w-md space-y-5 rounded-2xl border bg-card p-7 shadow-card"
        >
          <p className="eyebrow">Staff account setup</p>
          <div>
            <h1 className="mt-2 text-2xl font-bold text-brand">Set your staff password</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Invitation accepted for {email}. Choose a password to finish setting up your account.
            </p>
          </div>
          <label className="block space-y-1.5 text-sm font-medium">
            New password
            <Input
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          <label className="block space-y-1.5 text-sm font-medium">
            Confirm new password
            <Input
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
            />
          </label>
          {error && <ErrorBanner message={error} />}
          <Button className="w-full" disabled={busy} loading={busy}>
            {busy ? "Saving password…" : "Save password and continue"}
          </Button>
        </form>
      ) : (
        <section className="w-full max-w-md space-y-4 rounded-2xl border bg-card p-7 shadow-card">
          <ShieldCheck className="h-8 w-8 text-primary" />
          <h1 className="text-2xl font-bold text-brand">Invitation link unavailable</h1>
          <p className="text-sm text-muted-foreground">
            This invitation link may have expired or already been used. Ask your Super Admin to send
            a new invitation, then open its link again.
          </p>
          <Button className="w-full" onClick={onExpired}>
            Return to staff sign in
          </Button>
        </section>
      )}
    </div>
  );
}

function StaffPasswordSettings({ email }: { email: string }) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const queryClient = useQueryClient();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (password.length < 8) {
      toast.error("Use a password with at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      toast.error("The passwords do not match.");
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) toast.error("Could not update password", { description: error.message });
    else {
      toast.success("Password updated");
      setPassword("");
      setConfirmPassword("");
      await queryClient.invalidateQueries({ queryKey: ["my_roles"] });
    }
  }

  return (
    <form
      onSubmit={submit}
      className="max-w-2xl space-y-5 rounded-xl border bg-card p-5 shadow-card"
    >
      <div className="flex items-start gap-3">
        <KeyRound className="mt-0.5 h-5 w-5 text-primary" />
        <div>
          <h2 className="font-semibold text-brand">Change your password</h2>
          <p className="mt-1 text-sm text-muted-foreground">Update the password for {email}.</p>
        </div>
      </div>
      <label className="block space-y-1.5 text-sm font-medium">
        New password
        <Input
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </label>
      <label className="block space-y-1.5 text-sm font-medium">
        Confirm new password
        <Input
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
        />
      </label>
      <Button disabled={busy} loading={busy}>
        {busy ? "Saving password…" : "Update password"}
      </Button>
    </form>
  );
}

function StaffSignIn() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [recoveryBusy, setRecoveryBusy] = useState(false);
  const [error, setError] = useState("");

  async function sendPasswordReset() {
    if (!email.trim()) {
      setError("Enter your email address first.");
      return;
    }
    setRecoveryBusy(true);
    setError("");
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(
      email.trim().toLowerCase(),
      { redirectTo: `${window.location.origin}/admin?resetPassword=1` },
    );
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
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });
      if (signInError) setError(signInError.message);
      else toast.success("Signed in successfully");
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : "An unexpected error occurred.",
      );
    } finally {
      setBusy(false);
    }
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
            alt="Profia Institute campus"
            className="absolute inset-0 h-full w-full object-cover"
          />
          <div className="absolute inset-0 bg-hero-overlay" />
          <div className="absolute inset-x-0 bottom-0 p-10">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">
              Profia Institute · Homa Bay
            </p>
            <h2 className="mt-3 max-w-lg text-4xl font-extrabold leading-tight">
              Supporting every step of the student journey.
            </h2>
            <p className="mt-4 max-w-md leading-7 text-white/80">
              Manage admissions, academics and student services from your secure workspace.
            </p>
          </div>
        </section>
        <form
          onSubmit={submit}
          className="mx-auto w-full max-w-md space-y-5 rounded-2xl border bg-card p-7 shadow-lift sm:p-9"
        >
          <div>
            <p className="eyebrow">Secure staff access</p>
            <h1 className="mt-2 text-2xl font-bold text-brand">Admin sign in</h1>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Staff accounts are created by invitation from a Super Admin. If you need access,
              contact the Institute administrator.
            </p>
          </div>
          <label className="block space-y-1.5 text-sm font-medium">
            Email
            <Input
              type="email"
              required
              autoComplete="username"
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
                autoComplete="current-password"
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
          <button
            type="button"
            className="text-sm font-semibold text-primary underline"
            disabled={recoveryBusy}
            onClick={() => void sendPasswordReset()}
          >
            {recoveryBusy ? "Sending reset link…" : "Forgot password?"}
          </button>
          {error && <ErrorBanner message={error} />}
          <Button className="w-full" disabled={busy} loading={busy}>
            {busy ? "Signing in…" : "Sign in"}
          </Button>
        </form>
      </main>
    </div>
  );
}

function Overview({ onNavigate }: { onNavigate: (section: DashboardSection) => void }) {
  const queryClient = useQueryClient();
  const stats = useQuery({
    queryKey: ["admin", "overview"],
    queryFn: async () => {
      const [
        applications,
        submittedApplications,
        reviewApplications,
        students,
        activeStudents,
        courses,
        publishedCourses,
        openIntakes,
        unreadMessages,
      ] = await Promise.all([
        supabase.from("applications").select("id", { count: "exact", head: true }),
        supabase
          .from("applications")
          .select("id", { count: "exact", head: true })
          .eq("status", "submitted"),
        supabase
          .from("applications")
          .select("id", { count: "exact", head: true })
          .eq("status", "under_review"),
        supabase.from("students").select("id", { count: "exact", head: true }),
        supabase
          .from("students")
          .select("id", { count: "exact", head: true })
          .eq("status", "active"),
        supabase.from("courses").select("id", { count: "exact", head: true }),
        supabase.from("courses").select("id", { count: "exact", head: true }).eq("published", true),
        supabase.from("intakes").select("id", { count: "exact", head: true }).eq("is_open", true),
        supabase
          .from("contact_messages")
          .select("id", { count: "exact", head: true })
          .eq("status", "new"),
      ]);
      const results = [
        applications,
        submittedApplications,
        reviewApplications,
        students,
        activeStudents,
        courses,
        publishedCourses,
        openIntakes,
        unreadMessages,
      ];
      const failed = results.find((result) => result.error);
      if (failed?.error) throw failed.error;
      return {
        applications: applications.count ?? 0,
        submittedApplications: submittedApplications.count ?? 0,
        reviewApplications: reviewApplications.count ?? 0,
        students: students.count ?? 0,
        activeStudents: activeStudents.count ?? 0,
        courses: courses.count ?? 0,
        publishedCourses: publishedCourses.count ?? 0,
        openIntakes: openIntakes.count ?? 0,
        unreadMessages: unreadMessages.count ?? 0,
      };
    },
  });

  if (stats.isLoading) return <LoadingState />;
  if (stats.error) return <ErrorPanel error={stats.error} retry={() => stats.refetch()} />;

  const data = stats.data!;
  const metrics = [
    {
      label: "Applications",
      value: data.applications,
      hint: `${data.submittedApplications + data.reviewApplications} need review`,
      icon: ClipboardList,
      section: "applications" as const,
    },
    {
      label: "Students",
      value: data.students,
      hint: `${data.activeStudents} active`,
      icon: Users,
      section: "students" as const,
    },
    {
      label: "Active courses",
      value: data.publishedCourses,
      hint: `${data.courses} courses total`,
      icon: BookOpen,
      section: "courses" as const,
    },
    {
      label: "Open intakes",
      value: data.openIntakes,
      hint: "Accepting applications",
      icon: CalendarDays,
      section: "admissions" as const,
    },
  ];

  return (
    <div className="space-y-6">
      <section
        data-scroll-reveal
        className="rounded-2xl bg-gradient-brand p-6 text-brand-foreground shadow-card sm:p-8"
      >
        <p className="text-sm font-semibold text-brand-foreground/75">Administration overview</p>
        <h2 className="mt-2 text-2xl font-bold sm:text-3xl">Welcome to the Profia workspace</h2>
        <p className="mt-2 max-w-2xl text-sm text-brand-foreground/80">
          Review current activity and continue managing admissions, learners and academic records.
        </p>
      </section>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map(({ label, value, hint, icon: Icon, section }) => (
          <button
            key={label}
            type="button"
            onClick={() => onNavigate(section)}
            data-scroll-reveal
            className="rounded-xl border bg-card p-5 text-left shadow-card transition hover:-translate-y-0.5 hover:shadow-lift"
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-muted-foreground">{label}</span>
              <span className="rounded-lg bg-accent p-2 text-primary">
                <Icon className="h-4 w-4" />
              </span>
            </div>
            <p className="mt-4 text-3xl font-bold text-brand">{value}</p>
            <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
          </button>
        ))}
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div data-scroll-reveal className="rounded-xl border bg-card p-5 shadow-card">
          <h3 className="font-semibold text-brand">Admissions queue</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Applications awaiting initial review.
          </p>
          <p className="mt-5 text-3xl font-bold text-primary">{data.submittedApplications}</p>
          <Button
            variant="outline"
            size="sm"
            className="mt-4"
            onClick={() => onNavigate("applications")}
          >
            Review applications
          </Button>
        </div>
        <div data-scroll-reveal className="rounded-xl border bg-card p-5 shadow-card">
          <h3 className="font-semibold text-brand">Messages awaiting response</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            New enquiries from the public contact form.
          </p>
          <p className="mt-5 text-3xl font-bold text-primary">{data.unreadMessages}</p>
          <Button
            variant="outline"
            size="sm"
            className="mt-4"
            onClick={() => onNavigate("messages")}
          >
            Open messages
          </Button>
        </div>
      </div>
      <Button
        variant="outline"
        onClick={() =>
          void queryClient.invalidateQueries({
            queryKey: ["admin", "overview"],
          })
        }
      >
        <Activity /> Refresh dashboard
      </Button>
    </div>
  );
}
function ApplicationsPanel() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<Enums<"application_status"> | "all">("all");
  const appsQuery = useQuery({
    queryKey: ["admin", "applications"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("applications")
        .select(
          "id,application_number,first_name,last_name,email,phone,status,created_at,admin_message,study_mode,level_id,courses(title),course_levels(name),intakes(name)",
        )
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
  const enroll = async (id: string) => {
    const { error } = await supabase.rpc("enroll_application", { _application_id: id });
    if (error) {
      toast.error("Could not enroll applicant", { description: error.message });
      return;
    }
    toast.success("Student record and course enrollment are up to date");
    await queryClient.invalidateQueries({ queryKey: ["admin"] });
  };
  const update = async (id: string, nextStatus: Enums<"application_status">) => {
    if (nextStatus === "enrolled") {
      await enroll(id);
      return;
    }
    const { error } = await supabase
      .from("applications")
      .update({ status: nextStatus })
      .eq("id", id);
    if (error) toast.error("Could not update application", { description: error.message });
    else {
      toast.success("Application status updated");
      await queryClient.invalidateQueries({ queryKey: ["admin", "applications"] });
      await queryClient.invalidateQueries({ queryKey: ["admin", "overview"] });
    }
  };
  const filtered = useMemo(
    () =>
      (appsQuery.data ?? []).filter((app) => {
        const text =
          `${app.application_number} ${app.first_name} ${app.last_name} ${app.email}`.toLowerCase();
        return text.includes(search.toLowerCase()) && (status === "all" || app.status === status);
      }),
    [appsQuery.data, search, status],
  );
  const exportRows = filtered.map((app) => ({
    "Application Number": app.application_number,
    Name: [app.first_name, app.last_name].filter(Boolean).join(" "),
    "Course Name": relationName(app.courses),
    Level: relationName(app.course_levels),
    Intake: relationName(app.intakes),
    Email: app.email,
    "Phone Number": app.phone,
    "Study Mode": app.study_mode,
    Status: statusLabel(app.status),
    "Applied On": app.created_at,
  }));

  if (appsQuery.isLoading) return <LoadingState />;
  if (appsQuery.error)
    return <ErrorPanel error={appsQuery.error} retry={() => appsQuery.refetch()} />;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-xl border bg-card p-4 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            aria-label="Search applications"
            className="pl-9"
            placeholder="Search applicant, email or number"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <select
          className={selectClass}
          value={status}
          onChange={(event) => setStatus(event.target.value as typeof status)}
        >
          <option value="all">All statuses</option>
          {applicationStatuses.map((s) => (
            <option key={s} value={s}>
              {statusLabel(s)}
            </option>
          ))}
        </select>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => exportCsv("applications.csv", exportRows)}>
            <ArrowDownToLine /> Export CSV
          </Button>
          <Button variant="outline" onClick={() => exportExcel("applications.xlsx", exportRows)}>
            <ArrowDownToLine /> Export Excel
          </Button>
        </div>
      </div>
      {filtered.length ? (
        filtered.map((app) => (
          <article key={app.id} className="rounded-xl border bg-card p-4 shadow-card sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-primary">
                  {app.application_number}
                </p>
                <h3 className="mt-1 font-semibold text-brand">
                  {app.first_name} {app.last_name}
                </h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  {app.email} · {app.phone}
                </p>
              </div>
              <Badge
                variant={
                  app.status === "accepted" || app.status === "enrolled" ? "default" : "secondary"
                }
              >
                {statusLabel(app.status)}
              </Badge>
            </div>
            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted-foreground">
              <span>Course: {relationName(app.courses)}</span>
              <span>Level: {relationName(app.course_levels)}</span>
              <span>Intake: {relationName(app.intakes)}</span>
              <span>Received: {new Date(app.created_at).toLocaleDateString("en-KE")}</span>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <select
                aria-label={`Update status for ${app.application_number}`}
                className={selectClass}
                value={app.status}
                onChange={(event) =>
                  void update(app.id, event.target.value as Enums<"application_status">)
                }
              >
                {applicationStatuses.map((s) => (
                  <option key={s} value={s}>
                    {statusLabel(s)}
                  </option>
                ))}
              </select>
              {(app.status === "accepted" || app.status === "enrolled") && (
                <Button size="sm" onClick={() => void enroll(app.id)}>
                  {app.status === "accepted" ? "Enroll applicant" : "Sync student record"}
                </Button>
              )}
            </div>
          </article>
        ))
      ) : (
        <EmptyPanel
          title="No applications found"
          detail="Try changing the search or status filter."
        />
      )}
    </div>
  );
}

const applicationStatuses: Enums<"application_status">[] = [
  "submitted",
  "under_review",
  "accepted",
  "rejected",
  "waitlisted",
  "more_info_required",
  "enrolled",
];

function StudentsPanel({
  canManage,
  canViewDocuments,
  canManageDocuments,
  canViewAcademicRecords,
  canViewFinancialRecords,
  userId,
}: {
  canManage: boolean;
  canViewDocuments: boolean;
  canManageDocuments: boolean;
  canViewAcademicRecords: boolean;
  canViewFinancialRecords: boolean;
  userId: string;
}) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const studentsQuery = useQuery({
    queryKey: ["admin", "students"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("students")
        .select(
          "id,user_id,student_number,application_id,first_name,middle_name,last_name,email,phone,status,course_id,level_id,intake_id,study_mode,kasneb_number,date_of_birth,gender,county,town,address,current_semester,level:course_levels(name),intake:intakes(name)",
        )
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
  const profileUserIds = (studentsQuery.data ?? [])
    .map((student) => student.user_id)
    .filter((id): id is string => !!id);
  const profilePhotosQuery = useQuery({
    queryKey: ["admin", "student-profile-photos", profileUserIds],
    enabled: profileUserIds.length > 0,
    queryFn: () => fetchProfilePhotos(profileUserIds),
  });
  const applicationIds = (studentsQuery.data ?? [])
    .map((student) => student.application_id)
    .filter((id): id is string => !!id);
  const studentDocumentsQuery = useQuery({
    queryKey: ["admin", "student-application-documents", applicationIds],
    enabled: canViewDocuments && applicationIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("application_documents")
        .select("id,application_id,doc_type,file_name,file_path,created_at")
        .in("application_id", applicationIds);
      if (error) throw error;
      return data;
    },
  });
  const studentIds = (studentsQuery.data ?? []).map((student) => student.id);
  const studentCourseQuery = useQuery({
    queryKey: ["admin", "student-course-enrollments", studentIds],
    enabled: studentIds.length > 0,
    queryFn: async () => {
      const [academic, online] = await Promise.all([
        supabase
          .from("enrollments")
          .select("student_id,course_id,status")
          .in("student_id", studentIds),
        supabase
          .from("online_course_enrollments")
          .select("student_id,course_id,status")
          .in("student_id", studentIds),
      ]);
      if (academic.error) throw academic.error;
      if (online.error) throw online.error;

      const courseIds = [
        ...new Set([
          ...(studentsQuery.data ?? []).flatMap((student) =>
            student.course_id ? [student.course_id] : [],
          ),
          ...(academic.data ?? []).map((enrollment) => enrollment.course_id),
          ...(online.data ?? []).map((enrollment) => enrollment.course_id),
        ]),
      ];
      const { data: courses, error: coursesError } = courseIds.length
        ? await supabase.from("courses").select("id,title").in("id", courseIds)
        : { data: [], error: null };
      if (coursesError) throw coursesError;
      const courseNames = new Map(courses.map((course) => [course.id, course.title]));
      const rows = new Map<
        string,
        Map<string, { title: string; modes: Set<string>; statuses: Set<string> }>
      >();
      const addCourse = (studentId: string, courseId: string, mode: string, status: string) => {
        const studentCourses = rows.get(studentId) ?? new Map();
        const course = studentCourses.get(courseId) ?? {
          title: courseNames.get(courseId) ?? "Course no longer available",
          modes: new Set<string>(),
          statuses: new Set<string>(),
        };
        course.modes.add(mode);
        course.statuses.add(status);
        studentCourses.set(courseId, course);
        rows.set(studentId, studentCourses);
      };
      for (const enrollment of academic.data ?? [])
        addCourse(enrollment.student_id, enrollment.course_id, "Academic", enrollment.status);
      for (const enrollment of online.data ?? [])
        addCourse(enrollment.student_id, enrollment.course_id, "Online", enrollment.status);
      for (const student of studentsQuery.data ?? []) {
        if (student.course_id && !rows.get(student.id)?.has(student.course_id)) {
          addCourse(
            student.id,
            student.course_id,
            student.study_mode === "online" ? "Online" : "Academic",
            "assigned",
          );
        }
      }

      return Object.fromEntries(
        [...rows].map(([studentId, coursesForStudent]) => [
          studentId,
          [...coursesForStudent.entries()].map(([courseId, course]) => ({
            course_id: courseId,
            title: course.title,
            modes: [...course.modes],
            statuses: [...course.statuses],
          })),
        ]),
      );
    },
  });
  const enrolledStudentDocumentsQuery = useQuery({
    queryKey: ["admin", "student-documents", studentIds],
    enabled: canViewDocuments && studentIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("student_documents")
        .select("id,student_id,document_type,file_name,file_path,created_at")
        .in("student_id", studentIds)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
  const [adding, setAdding] = useState(false);
  const [editingStudentId, setEditingStudentId] = useState<string | null>(null);
  const [detailsStudentId, setDetailsStudentId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState({
    student_number: "",
    first_name: "",
    last_name: "",
    email: "",
    phone: "",
    course_id: "",
    intake_id: "",
  });
  const catalogue = useQuery({
    queryKey: ["admin", "student-form-options"],
    enabled: canManage && (adding || !!editingStudentId || studentsQuery.data !== undefined),
    queryFn: async () => {
      const [courses, intakes] = await Promise.all([
        supabase
          .from("courses")
          .select("id,title,available_online")
          .eq("published", true)
          .order("title"),
        supabase.from("intakes").select("id,name").order("start_date", { ascending: false }),
      ]);
      if (courses.error) throw courses.error;
      if (intakes.error) throw intakes.error;
      return { courses: courses.data, intakes: intakes.data };
    },
  });
  const filtered = (studentsQuery.data ?? []).filter((s) =>
    `${s.student_number} ${s.first_name} ${s.last_name} ${s.email}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  const exportRows = filtered.map((student) => ({
    "Student Number": student.student_number,
    Name: [student.first_name, student.middle_name, student.last_name].filter(Boolean).join(" "),
    "Course Name":
      studentCourseQuery.data?.[student.id]?.map((course) => course.title).join(", ") ||
      "Not assigned",
    Level: relationName(student.level),
    Intake: relationName(student.intake),
    Email: student.email,
    "Phone Number": student.phone,
    "Study Mode": student.study_mode ? statusLabel(student.study_mode) : "Not assigned",
    Status: statusLabel(student.status),
  }));

  async function saveStudent(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    const values = {
      student_number: draft.student_number.trim(),
      first_name: draft.first_name.trim(),
      last_name: draft.last_name.trim(),
      email: draft.email.trim().toLowerCase(),
      phone: draft.phone.trim() || null,
      course_id: draft.course_id || null,
      intake_id: draft.intake_id || null,
    };
    const { error } = editingStudentId
      ? await supabase.from("students").update(values).eq("id", editingStudentId)
      : await supabase.from("students").insert({ ...values, student_number: "" });
    setSaving(false);
    if (error)
      toast.error(editingStudentId ? "Could not update student" : "Could not create student", {
        description: error.message,
      });
    else {
      toast.success(
        editingStudentId
          ? "Student profile and enrolment updated"
          : "Student created with a unique student number",
      );
      setAdding(false);
      setEditingStudentId(null);
      setDraft({
        student_number: "",
        first_name: "",
        last_name: "",
        email: "",
        phone: "",
        course_id: "",
        intake_id: "",
      });
      await queryClient.invalidateQueries({ queryKey: ["admin", "students"] });
      await queryClient.invalidateQueries({ queryKey: ["admin", "overview"] });
    }
  }

  async function setStudentStatus(id: string, next: "active" | "suspended" | "graduated") {
    const { error } = await supabase.rpc("set_student_status", { _student_id: id, _status: next });
    if (error) toast.error("Could not update student", { description: error.message });
    else {
      toast.success(`Student marked ${next}`);
      await queryClient.invalidateQueries({ queryKey: ["admin", "students"] });
    }
  }

  function editStudent(student: NonNullable<typeof studentsQuery.data>[number]) {
    setEditingStudentId(student.id);
    setAdding(false);
    setDraft({
      student_number: student.student_number,
      first_name: student.first_name,
      last_name: student.last_name,
      email: student.email,
      phone: student.phone ?? "",
      course_id: student.course_id ?? "",
      intake_id: student.intake_id ?? "",
    });
  }

  if (studentsQuery.isLoading) return <LoadingState />;
  if (studentsQuery.error)
    return <ErrorPanel error={studentsQuery.error} retry={() => studentsQuery.refetch()} />;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-xl border bg-card p-4 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            aria-label="Search students"
            className="pl-9"
            placeholder="Search name, email or student number"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            disabled={studentCourseQuery.isLoading || !!studentCourseQuery.error}
            onClick={() => exportCsv("students.csv", exportRows)}
          >
            <ArrowDownToLine /> Export CSV
          </Button>
          <Button
            variant="outline"
            disabled={studentCourseQuery.isLoading || !!studentCourseQuery.error}
            onClick={() => exportExcel("students.xlsx", exportRows)}
          >
            <ArrowDownToLine /> Export Excel
          </Button>
        </div>
        {canManage && (
          <Button
            onClick={() => {
              setEditingStudentId(null);
              setAdding(!adding);
              setDraft({
                student_number: "",
                first_name: "",
                last_name: "",
                email: "",
                phone: "",
                course_id: "",
                intake_id: "",
              });
            }}
          >
            {adding ? "Cancel" : "Add student"}
          </Button>
        )}
      </div>
      {profilePhotosQuery.error && (
        <p
          role="alert"
          className="rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive"
        >
          Could not load student profile photos: {profilePhotosQuery.error.message}
          <button
            type="button"
            className="ml-2 font-semibold underline"
            onClick={() => void profilePhotosQuery.refetch()}
          >
            Retry
          </button>
        </p>
      )}
      {(adding || editingStudentId) && canManage && (
        <form
          className="grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-2"
          onSubmit={saveStudent}
        >
          <Input
            required={!!editingStudentId}
            placeholder={
              editingStudentId ? "Student number" : "Student number generated automatically"
            }
            value={draft.student_number}
            onChange={(e) => setDraft({ ...draft, student_number: e.target.value })}
            disabled={!editingStudentId}
          />
          <Input
            required
            placeholder="First name"
            value={draft.first_name}
            onChange={(e) => setDraft({ ...draft, first_name: e.target.value })}
          />
          <Input
            required
            placeholder="Last name"
            value={draft.last_name}
            onChange={(e) => setDraft({ ...draft, last_name: e.target.value })}
          />
          <Input
            required
            type="email"
            placeholder="Email"
            value={draft.email}
            onChange={(e) => setDraft({ ...draft, email: e.target.value })}
          />
          <Input
            placeholder="Phone"
            value={draft.phone}
            onChange={(e) => setDraft({ ...draft, phone: e.target.value })}
          />
          <select
            className={selectClass}
            value={draft.course_id}
            onChange={(e) => setDraft({ ...draft, course_id: e.target.value })}
          >
            <option value="">Assign course (optional)</option>
            {catalogue.data?.courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </select>
          <select
            className={selectClass}
            value={draft.intake_id}
            onChange={(e) => setDraft({ ...draft, intake_id: e.target.value })}
          >
            <option value="">Assign intake (optional)</option>
            {catalogue.data?.intakes.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
              </option>
            ))}
          </select>
          <Button className="sm:col-span-2" disabled={saving || catalogue.isLoading}>
            {saving ? "Saving…" : editingStudentId ? "Save student changes" : "Create student"}
          </Button>
          {catalogue.error && (
            <p className="text-sm text-destructive sm:col-span-2">{catalogue.error.message}</p>
          )}
        </form>
      )}
      {filtered.length ? (
        filtered.map((student) => (
          <article
            key={student.id}
            className="flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-card sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-3">
                <ProfilePhotoAvatar
                  src={
                    student.user_id ? profilePhotosQuery.data?.get(student.user_id)?.url : undefined
                  }
                  name={`${student.first_name} ${student.last_name}`}
                  className="h-12 w-12 border"
                />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold text-brand">
                      {student.first_name} {student.middle_name} {student.last_name}
                    </h3>
                    <Badge variant={student.status === "active" ? "default" : "secondary"}>
                      {student.status}
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs font-semibold text-primary">
                    {student.student_number}
                  </p>
                </div>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {student.email}
                {student.phone ? ` · ${student.phone}` : ""}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Level: {relationName(student.level)} · Intake: {relationName(student.intake)}
              </p>
              {studentCourseQuery.error ? (
                <p role="alert" className="mt-2 text-xs text-destructive">
                  Could not load course enrolments: {studentCourseQuery.error.message}
                  <button
                    type="button"
                    className="ml-2 font-semibold underline"
                    onClick={() => void studentCourseQuery.refetch()}
                  >
                    Retry
                  </button>
                </p>
              ) : (
                <div className="mt-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Course enrolments
                  </p>
                  {studentCourseQuery.isLoading ? (
                    <p className="mt-1 text-xs text-muted-foreground">Loading courses…</p>
                  ) : studentCourseQuery.data?.[student.id]?.length ? (
                    <ul className="mt-1 space-y-1">
                      {studentCourseQuery.data?.[student.id]?.map((course) => (
                        <li
                          key={course.course_id}
                          className="flex flex-wrap items-center gap-1.5 text-xs"
                        >
                          <span className="font-medium">{course.title}</span>
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
                          {(canViewDocuments || canViewAcademicRecords) &&
                            course.statuses.includes("active") && (
                              <AdmissionLetterDownload
                                studentId={student.id}
                                courseId={course.course_id}
                              />
                            )}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-1 text-xs text-muted-foreground">No course enrolments.</p>
                  )}
                  {catalogue.error && (
                    <p role="alert" className="mt-2 text-xs text-destructive">
                      Could not load courses for enrollment: {catalogue.error.message}
                    </p>
                  )}
                  {canManage && (
                    <StudentCourseEnrollmentManager
                      student={student}
                      courses={catalogue.data?.courses ?? []}
                      intakes={catalogue.data?.intakes ?? []}
                      enrolledCourseIds={(studentCourseQuery.data?.[student.id] ?? [])
                        .filter((course) => course.statuses.includes("active"))
                        .map((course) => course.course_id)}
                      disabled={catalogue.isLoading}
                      onEnrolled={async () => {
                        await Promise.all([
                          queryClient.invalidateQueries({
                            queryKey: ["admin", "student-course-enrollments"],
                          }),
                          queryClient.invalidateQueries({ queryKey: ["admin", "students"] }),
                        ]);
                      }}
                    />
                  )}
                </div>
              )}
              {canViewDocuments && (
                <div className="mt-3 border-t pt-3">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Student documents
                    </p>
                    <EmailFileShareDialog studentId={student.id} studentEmail={student.email} />
                  </div>
                  {enrolledStudentDocumentsQuery.isLoading ? (
                    <p className="text-xs text-muted-foreground">Loading student documents…</p>
                  ) : enrolledStudentDocumentsQuery.error ? (
                    <p role="alert" className="text-xs text-destructive">
                      Could not load student documents:{" "}
                      {enrolledStudentDocumentsQuery.error.message}
                      <button
                        type="button"
                        className="ml-2 font-semibold underline"
                        onClick={() => void enrolledStudentDocumentsQuery.refetch()}
                      >
                        Retry
                      </button>
                    </p>
                  ) : canManageDocuments ? (
                    <StudentDocumentUpload
                      studentId={student.id}
                      userId={userId}
                      documents={(enrolledStudentDocumentsQuery.data ?? []).filter(
                        (document) => document.student_id === student.id,
                      )}
                      onUploaded={() =>
                        void queryClient.invalidateQueries({
                          queryKey: ["admin", "student-documents"],
                        })
                      }
                    />
                  ) : (
                    (enrolledStudentDocumentsQuery.data ?? [])
                      .filter((document) => document.student_id === student.id)
                      .map((document) => (
                        <StudentDocumentDownload key={document.id} document={document} />
                      ))
                  )}
                  {student.application_id && (
                    <div className="mt-3 border-t pt-2">
                      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Application documents
                      </p>
                      {studentDocumentsQuery.isLoading ? (
                        <p className="text-xs text-muted-foreground">Loading documents…</p>
                      ) : studentDocumentsQuery.error ? (
                        <p role="alert" className="text-xs text-destructive">
                          Could not load application documents:{" "}
                          {studentDocumentsQuery.error.message}
                        </p>
                      ) : (
                        (studentDocumentsQuery.data ?? [])
                          .filter((document) => document.application_id === student.application_id)
                          .map((document) => (
                            <ApplicationDocumentDownload key={document.id} document={document} />
                          ))
                      )}
                    </div>
                  )}
                </div>
              )}
              {detailsStudentId === student.id && (
                <StudentRecordDetails
                  student={student}
                  canViewAcademicRecords={canViewAcademicRecords}
                  canViewFinancialRecords={canViewFinancialRecords}
                />
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                aria-expanded={detailsStudentId === student.id}
                onClick={() =>
                  setDetailsStudentId((current) => (current === student.id ? null : student.id))
                }
              >
                {detailsStudentId === student.id ? "Hide details" : "View full record"}
              </Button>
              {canManage && (
                <>
                  <Button size="sm" variant="outline" onClick={() => editStudent(student)}>
                    Edit profile
                  </Button>
                  <select
                    aria-label={`Student status: ${student.first_name} ${student.last_name}`}
                    className={selectClass}
                    value={student.status}
                    onChange={(e) =>
                      void setStudentStatus(
                        student.id,
                        e.target.value as "active" | "suspended" | "graduated",
                      )
                    }
                  >
                    <option value="active">Active</option>
                    <option value="suspended">Suspended</option>
                    <option value="graduated">Graduated</option>
                  </select>
                </>
              )}
            </div>
          </article>
        ))
      ) : (
        <EmptyPanel title="No students found" detail="Try another search term or add a student." />
      )}
    </div>
  );
}

function StudentRecordDetails({
  student,
  canViewAcademicRecords,
  canViewFinancialRecords,
}: {
  student: Pick<
    Tables<"students">,
    | "id"
    | "student_number"
    | "kasneb_number"
    | "date_of_birth"
    | "gender"
    | "county"
    | "town"
    | "address"
    | "current_semester"
    | "email"
    | "phone"
  >;
  canViewAcademicRecords: boolean;
  canViewFinancialRecords: boolean;
}) {
  const resultsQuery = useQuery({
    queryKey: ["admin", "student-record-results", student.id],
    enabled: canViewAcademicRecords,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("results")
        .select("id,unit_name,score,grade,semester,academic_year,published,created_at")
        .eq("student_id", student.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
  const feesQuery = useQuery({
    queryKey: ["admin", "student-record-fees", student.id],
    enabled: canViewFinancialRecords,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fees")
        .select("id,description,amount,academic_year,due_date,created_at")
        .eq("student_id", student.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
  const paymentsQuery = useQuery({
    queryKey: ["admin", "student-record-payments", student.id],
    enabled: canViewFinancialRecords,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payments")
        .select("id,amount,method,reference,status,paid_at,provider")
        .eq("student_id", student.id)
        .order("paid_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
  const feeTotal = (feesQuery.data ?? []).reduce((total, fee) => total + Number(fee.amount), 0);
  const confirmedPayments = (paymentsQuery.data ?? []).filter(
    (payment) => payment.status.toLowerCase() === "confirmed",
  );
  const paymentTotal = confirmedPayments.reduce(
    (total, payment) => total + Number(payment.amount),
    0,
  );

  return (
    <section
      className="mt-4 space-y-4 rounded-lg border bg-muted/20 p-4"
      aria-label="Student record details"
    >
      <div>
        <h4 className="text-sm font-semibold text-brand">Personal and academic profile</h4>
        <dl className="mt-2 grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <dt className="text-muted-foreground">Student number</dt>
            <dd>{student.student_number}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">KASNEB number</dt>
            <dd>{student.kasneb_number || "Not recorded"}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Date of birth</dt>
            <dd>{student.date_of_birth || "Not recorded"}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Gender</dt>
            <dd>{student.gender || "Not recorded"}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">County / town</dt>
            <dd>{[student.county, student.town].filter(Boolean).join(" / ") || "Not recorded"}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Current semester</dt>
            <dd>{student.current_semester || "Not recorded"}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Email</dt>
            <dd>{student.email}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Phone</dt>
            <dd>{student.phone || "Not recorded"}</dd>
          </div>
          <div className="sm:col-span-2 lg:col-span-3">
            <dt className="text-muted-foreground">Address</dt>
            <dd>{student.address || "Not recorded"}</dd>
          </div>
        </dl>
      </div>

      {canViewAcademicRecords && (
        <div className="border-t pt-3">
          <h4 className="text-sm font-semibold text-brand">Academic results</h4>
          {resultsQuery.isLoading ? (
            <p className="mt-2 text-sm text-muted-foreground">Loading academic results…</p>
          ) : resultsQuery.error ? (
            <p role="alert" className="mt-2 text-sm text-destructive">
              Could not load academic results: {resultsQuery.error.message}
            </p>
          ) : resultsQuery.data?.length ? (
            <div className="mt-2 overflow-x-auto">
              <table className="w-full min-w-[32rem] text-left text-sm">
                <thead>
                  <tr className="border-b text-xs text-muted-foreground">
                    <th className="py-2 pr-3">Unit</th>
                    <th className="py-2 pr-3">Score</th>
                    <th className="py-2 pr-3">Grade</th>
                    <th className="py-2 pr-3">Semester</th>
                    <th className="py-2 pr-3">Academic year</th>
                    <th className="py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {resultsQuery.data.map((result) => (
                    <tr key={result.id} className="border-b last:border-0">
                      <td className="py-2 pr-3">{result.unit_name}</td>
                      <td className="py-2 pr-3">{result.score ?? "—"}</td>
                      <td className="py-2 pr-3">{result.grade ?? "—"}</td>
                      <td className="py-2 pr-3">{result.semester ?? "—"}</td>
                      <td className="py-2 pr-3">{result.academic_year ?? "—"}</td>
                      <td className="py-2">{result.published ? "Published" : "Unpublished"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">No academic results recorded.</p>
          )}
        </div>
      )}

      {canViewFinancialRecords && (
        <div className="grid gap-4 border-t pt-3 lg:grid-cols-2">
          <div>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h4 className="text-sm font-semibold text-brand">Fee charges</h4>
              <span className="text-sm font-semibold">Total: {formatKES(feeTotal)}</span>
            </div>
            {feesQuery.isLoading ? (
              <p className="mt-2 text-sm text-muted-foreground">Loading fee records…</p>
            ) : feesQuery.error ? (
              <p role="alert" className="mt-2 text-sm text-destructive">
                Could not load fees: {feesQuery.error.message}
              </p>
            ) : feesQuery.data?.length ? (
              <ul className="mt-2 divide-y text-sm">
                {feesQuery.data.map((fee) => (
                  <li key={fee.id} className="flex justify-between gap-3 py-2">
                    <span>
                      {fee.description}
                      {fee.academic_year ? ` · ${fee.academic_year}` : ""}
                    </span>
                    <span className="shrink-0">{formatKES(Number(fee.amount))}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">No fee charges recorded.</p>
            )}
          </div>
          <div>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h4 className="text-sm font-semibold text-brand">Payments</h4>
              <span className="text-sm font-semibold">Confirmed: {formatKES(paymentTotal)}</span>
            </div>
            {paymentsQuery.isLoading ? (
              <p className="mt-2 text-sm text-muted-foreground">Loading payment records…</p>
            ) : paymentsQuery.error ? (
              <p role="alert" className="mt-2 text-sm text-destructive">
                Could not load payments: {paymentsQuery.error.message}
              </p>
            ) : paymentsQuery.data?.length ? (
              <ul className="mt-2 divide-y text-sm">
                {paymentsQuery.data.map((payment) => (
                  <li key={payment.id} className="flex justify-between gap-3 py-2">
                    <span>
                      {new Date(payment.paid_at).toLocaleDateString()} · {payment.method}
                      {payment.reference ? ` · ${payment.reference}` : ""}
                      <Badge
                        className="ml-2"
                        variant={payment.status === "confirmed" ? "default" : "secondary"}
                      >
                        {payment.status}
                      </Badge>
                    </span>
                    <span className="shrink-0">{formatKES(Number(payment.amount))}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">No payment records found.</p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

function StudentCourseEnrollmentManager({
  student,
  courses,
  intakes,
  enrolledCourseIds,
  disabled,
  onEnrolled,
}: {
  student: Pick<Tables<"students">, "id" | "study_mode">;
  courses: Pick<Tables<"courses">, "id" | "title" | "available_online">[];
  intakes: Pick<Tables<"intakes">, "id" | "name">[];
  enrolledCourseIds: string[];
  disabled: boolean;
  onEnrolled: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [courseId, setCourseId] = useState("");
  const [levelId, setLevelId] = useState("");
  const [intakeId, setIntakeId] = useState("");
  const [saving, setSaving] = useState(false);
  const levelsQuery = useQuery({
    queryKey: ["admin", "enrollment-course-levels", courseId],
    enabled: open && !!courseId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("course_levels")
        .select("id,name,sort_order")
        .eq("course_id", courseId)
        .eq("published", true)
        .order("sort_order");
      if (error) throw error;
      return data;
    },
  });
  const availableCourses = courses.filter(
    (course) => student.study_mode !== "online" || course.available_online,
  );
  const remainingCourses = availableCourses.filter(
    (course) => !enrolledCourseIds.includes(course.id),
  );

  async function enroll(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!courseId) return;
    setSaving(true);
    const { data, error } = await supabase.rpc("admin_enroll_student_course", {
      _student_id: student.id,
      _course_id: courseId,
      _level_id: levelId || null,
      _intake_id: intakeId || null,
    });
    setSaving(false);
    if (error) {
      toast.error("Could not enroll student", { description: error.message });
      return;
    }
    if (data === "already_enrolled") {
      toast.info("Student is already actively enrolled in this course.");
      return;
    }
    toast.success("Student enrolled in course", {
      description:
        data === "online"
          ? "Online course access will continue to follow its payment requirements."
          : "Course materials, assignments, CATs, and assigned facilitators are now available.",
    });
    setOpen(false);
    setCourseId("");
    setLevelId("");
    setIntakeId("");
    await onEnrolled();
  }

  if (disabled) return null;

  return (
    <div className="mt-3">
      {!open ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!remainingCourses.length}
          onClick={() => setOpen(true)}
        >
          Enroll in another course
        </Button>
      ) : (
        <form
          className="grid gap-2 rounded-lg border bg-muted/30 p-3 sm:grid-cols-2"
          onSubmit={(event) => void enroll(event)}
        >
          <label className="grid gap-1 text-xs font-medium sm:col-span-2">
            Course
            <select
              required
              className={selectClass}
              value={courseId}
              onChange={(event) => {
                setCourseId(event.target.value);
                setLevelId("");
              }}
            >
              <option value="">Select a course</option>
              {remainingCourses.map((course) => (
                <option key={course.id} value={course.id}>
                  {course.title}
                </option>
              ))}
            </select>
          </label>
          {levelsQuery.data?.length ? (
            <label className="grid gap-1 text-xs font-medium">
              Course level
              <select
                required
                className={selectClass}
                value={levelId}
                onChange={(event) => setLevelId(event.target.value)}
              >
                <option value="">Select a level</option>
                {levelsQuery.data.map((level) => (
                  <option key={level.id} value={level.id}>
                    {level.name}
                  </option>
                ))}
              </select>
            </label>
          ) : levelsQuery.isLoading ? (
            <p className="text-xs text-muted-foreground">Loading course levels…</p>
          ) : null}
          <label className="grid gap-1 text-xs font-medium">
            Intake (optional)
            <select
              className={selectClass}
              value={intakeId}
              onChange={(event) => setIntakeId(event.target.value)}
            >
              <option value="">No intake selected</option>
              {intakes.map((intake) => (
                <option key={intake.id} value={intake.id}>
                  {intake.name}
                </option>
              ))}
            </select>
          </label>
          {levelsQuery.error && (
            <p role="alert" className="text-xs text-destructive sm:col-span-2">
              Could not load course levels: {levelsQuery.error.message}
            </p>
          )}
          <div className="flex flex-wrap gap-2 sm:col-span-2">
            <Button
              type="submit"
              size="sm"
              disabled={
                saving ||
                !courseId ||
                levelsQuery.isLoading ||
                !!levelsQuery.error ||
                (!!levelsQuery.data?.length && !levelId)
              }
            >
              {saving ? "Enrolling…" : "Enroll student"}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}

function ReportsPanel() {
  const reports = useQuery({
    queryKey: ["admin", "reports"],
    queryFn: async () => {
      const [applications, students, courses, schools, fees, payments, results, articles, intakes] =
        await Promise.all([
          supabase.from("applications").select("status,course_id,intake_id,created_at"),
          supabase.from("students").select("id,status,course_id"),
          supabase.from("courses").select("id,title,school_id"),
          supabase.from("schools").select("id,name"),
          supabase.from("fees").select("student_id,amount"),
          supabase.from("payments").select("student_id,amount,status"),
          supabase.from("results").select("student_id,score,published"),
          supabase.from("articles").select("id,status"),
          supabase.from("intakes").select("id,name"),
        ]);
      const errors = [
        applications,
        students,
        courses,
        schools,
        fees,
        payments,
        results,
        articles,
        intakes,
      ].find((result) => result.error);
      if (errors?.error) throw errors.error;
      return {
        applications: applications.data ?? [],
        students: students.data ?? [],
        courses: courses.data ?? [],
        schools: schools.data ?? [],
        fees: fees.data ?? [],
        payments: payments.data ?? [],
        results: results.data ?? [],
        articles: articles.data ?? [],
        intakes: intakes.data ?? [],
      };
    },
  });
  if (reports.isLoading) return <LoadingState />;
  if (reports.error) return <ErrorPanel error={reports.error} retry={() => reports.refetch()} />;
  const d = reports.data!;
  const courseName = new Map(d.courses.map((c) => [c.id, c.title]));
  const schoolName = new Map(d.schools.map((s) => [s.id, s.name]));
  const byCourse = countBy(d.applications, (item) =>
    item.course_id ? (courseName.get(item.course_id) ?? "Unknown course") : "Unassigned",
  );
  const intakeName = new Map(d.intakes.map((intake) => [intake.id, intake.name]));
  const byIntake = countBy(d.applications, (item) =>
    item.intake_id ? (intakeName.get(item.intake_id) ?? "Unknown intake") : "Unassigned",
  );
  const bySchool = countBy(d.students, (student) => {
    const course = d.courses.find((c) => c.id === student.course_id);
    return course ? (schoolName.get(course.school_id) ?? "Unknown school") : "Unassigned";
  });
  const byStudentCourse = countBy(d.students, (student) =>
    student.course_id ? (courseName.get(student.course_id) ?? "Unknown course") : "Unassigned",
  );
  const billed = d.fees.reduce((sum, fee) => sum + Number(fee.amount), 0);
  const paid = d.payments
    .filter((p) => p.status === "confirmed")
    .reduce((sum, payment) => sum + Number(payment.amount), 0);
  const publishedResults = d.results.filter((r) => r.published && r.score !== null);
  const average = publishedResults.length
    ? publishedResults.reduce((sum, r) => sum + Number(r.score), 0) / publishedResults.length
    : null;
  return (
    <div className="space-y-5">
      <div className="flex justify-end">
        <div className="flex flex-wrap justify-end gap-2">
          <Button
            variant="outline"
            onClick={() =>
              exportCsv(
                "applications-by-course.csv",
                Object.entries(byCourse).map(([course, count]) => ({
                  course,
                  applications: count,
                })),
              )
            }
          >
            <ArrowDownToLine /> Export CSV
          </Button>
          <Button
            variant="outline"
            onClick={() =>
              exportExcel(
                "applications-by-course.xlsx",
                Object.entries(byCourse).map(([course, count]) => ({
                  course,
                  applications: count,
                })),
              )
            }
          >
            <ArrowDownToLine /> Export Excel
          </Button>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <ReportCard
          title="Applications by course"
          rows={Object.entries(byCourse).map(([k, v]) => `${k}: ${v}`)}
        />
        <ReportCard
          title="Applications by intake"
          rows={Object.entries(byIntake).map(([k, v]) => `${k}: ${v}`)}
        />
        <ReportCard
          title="Students by school"
          rows={Object.entries(bySchool).map(([k, v]) => `${k}: ${v}`)}
        />
        <ReportCard
          title="Students by course"
          rows={Object.entries(byStudentCourse).map(([k, v]) => `${k}: ${v}`)}
        />
        <ReportCard
          title="Accepted vs rejected"
          rows={[
            `Accepted: ${d.applications.filter((a) => a.status === "accepted").length}`,
            `Rejected: ${d.applications.filter((a) => a.status === "rejected").length}`,
          ]}
        />
        <ReportCard
          title="Fee balances"
          rows={[
            `Billed: ${formatKES(billed)}`,
            `Confirmed payments: ${formatKES(paid)}`,
            `Balance: ${formatKES(billed - paid)}`,
          ]}
        />
        <ReportCard
          title="Academic performance"
          rows={[
            `Published results: ${publishedResults.length}`,
            `Average score: ${average === null ? "Not available" : `${average.toFixed(1)}%`}`,
          ]}
        />
        <ReportCard
          title="Content statistics"
          rows={[
            `Articles: ${d.articles.length}`,
            `Published: ${d.articles.filter((a) => a.status === "published").length}`,
          ]}
        />
      </div>
    </div>
  );
}

function StaffSettings() {
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<AppRole>("admissions_admin");
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [accountAction, setAccountAction] = useState<string | null>(null);
  const staffQuery = useQuery({
    queryKey: ["admin", "staff"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("list_staff");
      if (error) throw error;
      return data.map((staff) => {
        if (!isStaffStatus(staff.status))
          throw new Error("The staff directory returned an unknown account status.");
        return { ...staff, status: staff.status };
      });
    },
  });
  const [bootstrap, setBootstrap] = useState<boolean | null>(null);
  useQuery({
    queryKey: ["admin", "super-admin-exists"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("super_admin_exists");
      if (error) throw error;
      setBootstrap(!data);
      return data;
    },
  });
  async function claimSuperAdmin() {
    const { data, error } = await supabase.rpc("claim_first_super_admin");
    if (error) toast.error("Could not claim Super Admin access", { description: error.message });
    else if (!data)
      toast.error(
        "This account is not allowlisted for initial setup or setup is already complete.",
      );
    else {
      toast.success("Super Admin access is now active");
      await queryClient.invalidateQueries({ queryKey: ["my_roles"] });
      await queryClient.invalidateQueries({ queryKey: ["admin"] });
    }
  }
  async function inviteStaff() {
    const normalizedEmail = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      toast.error("Enter a valid staff email address.");
      return;
    }
    setSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke("invite-staff", {
        body: { email: normalizedEmail, role },
      });
      if (error) {
        let description = error.message;
        if ("context" in error && error.context instanceof Response) {
          const responseBody = await error.context
            .clone()
            .json()
            .catch(() => null);
          if (typeof responseBody?.error === "string") description = responseBody.error;
        }
        toast.error("Could not invite staff member", { description });
      } else if (!data?.success) {
        toast.error("Could not invite staff member", {
          description: data?.error ?? "The invitation service returned an unexpected response.",
        });
      } else {
        toast.success("Staff invitation sent", {
          description: `Supabase Auth accepted an invitation request for ${normalizedEmail}. Delivery depends on the configured Auth email provider.`,
        });
        setEmail("");
        await queryClient.invalidateQueries({ queryKey: ["admin", "staff"] });
      }
    } catch (error) {
      toast.error("Could not invite staff member", {
        description: error instanceof Error ? error.message : "An unexpected error occurred.",
      });
    } finally {
      setSaving(false);
    }
  }
  async function manageStaffAccount(
    staff: StaffAccount,
    action: "suspend" | "reactivate" | "delete",
  ) {
    const label = staff.full_name || staff.email || "this account";
    if (
      action === "delete" &&
      !window.confirm(`Permanently delete ${label}? This removes the account and cannot be undone.`)
    )
      return;
    setAccountAction(staff.user_id);
    try {
      const { data, error } = await supabase.functions.invoke("manage-staff", {
        body: { action, userId: staff.user_id },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error ?? "The request could not be completed.");
      toast.success(
        action === "delete"
          ? "Staff account deleted"
          : action === "suspend"
            ? "Staff account suspended"
            : "Staff account reactivated",
      );
      await queryClient.invalidateQueries({ queryKey: ["admin", "staff"] });
    } catch (error) {
      let description = error instanceof Error ? error.message : "An unexpected error occurred.";
      if (
        error &&
        typeof error === "object" &&
        "context" in error &&
        error.context instanceof Response
      ) {
        const body = await error.context
          .clone()
          .json()
          .catch(() => null);
        if (typeof body?.error === "string") description = body.error;
      }
      toast.error("Could not update staff account", { description });
    } finally {
      setAccountAction(null);
    }
  }
  const visibleStaff = (staffQuery.data ?? []).filter((staff) => {
    const term = search.trim().toLowerCase();
    return (
      !term ||
      [staff.full_name, staff.email, staff.user_id, ...staff.roles]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(term))
    );
  });
  return (
    <div className="space-y-5">
      {bootstrap && (
        <section className="rounded-xl border border-primary/30 bg-cream p-5">
          <h2 className="font-semibold text-brand">Initial Super Admin setup</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Only the email allowlisted in the database setup table can claim the first Super Admin
            role.
          </p>
          <Button className="mt-4" onClick={() => void claimSuperAdmin()}>
            Claim first Super Admin role
          </Button>
        </section>
      )}
      <section className="space-y-4 rounded-xl border bg-card p-5 shadow-card">
        <div>
          <h2 className="font-semibold text-brand">Invite staff</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Send a secure invitation with the selected role. Staff set their password from the
            invitation link before entering the workspace. Invitation email delivery requires a
            working Supabase Auth email/SMTP configuration.
          </p>
        </div>
        <Input
          type="email"
          placeholder="Staff email address"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
        />
        <select
          className={selectClass}
          value={role}
          onChange={(e) => setRole(e.target.value as AppRole)}
        >
          <option value="admissions_admin">Admissions Admin</option>
          <option value="academic_admin">Academic Admin</option>
          <option value="content_admin">Content Admin</option>
          <option value="facilitator">Facilitator</option>
          <option value="super_admin">Super Admin</option>
        </select>
        <Button disabled={saving} onClick={() => void inviteStaff()}>
          <UserPlus className="mr-2 h-4 w-4" />
          {saving ? "Sending invitation…" : "Invite staff"}
        </Button>
      </section>
      {staffQuery.error ? (
        <ErrorPanel error={staffQuery.error} retry={() => staffQuery.refetch()} />
      ) : staffQuery.isLoading ? (
        <LoadingState />
      ) : (
        <section className="space-y-4 rounded-xl border bg-card p-5 shadow-card">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="font-semibold text-brand">Staff directory</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {visibleStaff.length}{" "}
                {visibleStaff.length === 1 ? "staff account" : "staff accounts"} · roles from the
                database
              </p>
            </div>
            <Input
              className="max-w-sm"
              placeholder="Search staff by name, email or role"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              aria-label="Search staff"
            />
          </div>
          {visibleStaff.length === 0 ? (
            <EmptyPanel
              title={
                staffQuery.data?.length ? "No staff match your search" : "No staff accounts yet"
              }
              detail={
                staffQuery.data?.length
                  ? "Try a different name, email or role."
                  : "Invite a staff member above to add the first account."
              }
            />
          ) : (
            <div className="divide-y">
              {visibleStaff.map((staff) => (
                <div
                  key={staff.user_id}
                  className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">
                      {staff.full_name || staff.email || staff.user_id}
                    </p>
                    {staff.email && <p className="truncate text-muted-foreground">{staff.email}</p>}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {staff.roles.map((staffRole) => (
                      <Badge key={staffRole} variant="secondary">
                        {staffRole.replaceAll("_", " ")}
                      </Badge>
                    ))}
                    {staff.roles.length === 0 && <Badge variant="outline">No role assigned</Badge>}
                    <Badge
                      variant={staff.status === "active" ? "secondary" : "outline"}
                      className={
                        staff.status === "suspended"
                          ? "border-destructive/40 text-destructive"
                          : undefined
                      }
                    >
                      {staff.status === "pending"
                        ? "Email pending"
                        : staff.status === "suspended"
                          ? "Suspended"
                          : "Active"}
                    </Badge>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {staff.roles.length > 0 && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={accountAction === staff.user_id}
                        onClick={() =>
                          void manageStaffAccount(
                            staff,
                            staff.status === "suspended" ? "reactivate" : "suspend",
                          )
                        }
                      >
                        {staff.status === "suspended" ? (
                          <>
                            <RotateCcw className="mr-1 h-4 w-4" /> Reactivate
                          </>
                        ) : (
                          <>
                            <Ban className="mr-1 h-4 w-4" /> Suspend
                          </>
                        )}
                      </Button>
                    )}
                    {staff.roles.every((staffRole) => staffRole !== "super_admin") && (
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={accountAction === staff.user_id}
                        onClick={() => void manageStaffAccount(staff, "delete")}
                      >
                        <Trash2 className="mr-1 h-4 w-4" />
                        Delete
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function FeeManagementPanel() {
  const { user } = useUser();
  const queryClient = useQueryClient();
  const [manualPaymentId, setManualPaymentId] = useState<string | null>(null);
  const [manualPayment, setManualPayment] = useState({
    student_id: "",
    amount: "",
    method: "Cash",
    reference: "",
    explanation: "",
    paid_at: new Date().toISOString().slice(0, 10),
  });
  const query = useQuery({
    queryKey: ["admin", "fee-management"],
    queryFn: async () => {
      const [accounts, payments] = await Promise.all([
        supabase.rpc("admin_fee_account_summary"),
        supabase
          .from("payments")
          .select("id,student_id,amount,method,provider,reference,status,paid_at,raw")
          .order("paid_at", { ascending: false })
          .limit(200),
      ]);
      if (accounts.error) throw accounts.error;
      if (payments.error) throw payments.error;
      return { accounts: accounts.data, payments: payments.data };
    },
    refetchInterval: 20_000,
  });
  const manualPaymentMutation = useMutation({
    mutationFn: async () => {
      const amount = Number(manualPayment.amount);
      if (!manualPayment.student_id) throw new Error("Select the student for this payment.");
      if (!Number.isFinite(amount) || amount <= 0) throw new Error("Enter a positive amount.");
      if (!manualPayment.explanation.trim())
        throw new Error("Add an explanation for this manual transaction.");
      const update = {
        amount,
        method: manualPayment.method.trim(),
        reference: manualPayment.reference.trim() || null,
        paid_at: new Date(`${manualPayment.paid_at}T12:00:00`).toISOString(),
        raw: { manually_recorded: true, explanation: manualPayment.explanation.trim() } as Json,
      };
      if (manualPaymentId) {
        const { data, error } = await supabase
          .from("payments")
          .update(update)
          .eq("id", manualPaymentId)
          .is("provider", null)
          .select("id")
          .maybeSingle();
        if (error) throw error;
        if (!data) throw new Error("Only manually recorded payments can be edited.");
      } else {
        const { error } = await supabase.from("payments").insert({
          ...update,
          student_id: manualPayment.student_id,
          provider: null,
          status: "confirmed",
          recorded_by: user?.id ?? null,
        });
        if (error) throw error;
      }
    },
    onSuccess: async () => {
      toast.success(manualPaymentId ? "Manual payment updated" : "Manual payment recorded");
      setManualPaymentId(null);
      setManualPayment({
        student_id: "",
        amount: "",
        method: "Cash",
        reference: "",
        explanation: "",
        paid_at: new Date().toISOString().slice(0, 10),
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["admin", "fee-management"] }),
        queryClient.invalidateQueries({ queryKey: ["admin", "directory", "fees"] }),
        queryClient.invalidateQueries({ queryKey: ["student", "fees"] }),
        queryClient.invalidateQueries({ queryKey: ["student", "payment-total"] }),
      ]);
    },
    onError: (error) =>
      toast.error("Could not save manual payment", {
        description: error instanceof Error ? error.message : "Please retry.",
      }),
  });
  if (query.error) return <ErrorPanel error={query.error} retry={() => query.refetch()} />;
  if (query.isLoading || !query.data) return <LoadingState />;

  const { accounts: accountRows, payments } = query.data;
  const totalBilled = accountRows.reduce((sum, account) => sum + Number(account.billed), 0);
  const totalPaid = accountRows.reduce((sum, account) => sum + Number(account.paid), 0);
  const accounts = accountRows
    .filter((account) => Number(account.billed) > 0 || Number(account.paid) > 0)
    .map((account) => ({ ...account, billed: Number(account.billed), paid: Number(account.paid) }))
    .sort((a, b) => b.billed - b.paid - (a.billed - a.paid));
  const studentById = new Map(accountRows.map((account) => [account.student_id, account]));

  return (
    <section className="space-y-5 rounded-xl border bg-card p-5 shadow-card">
      <div>
        <h2 className="font-semibold text-brand">Fees and transactions</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Confirmed PayHero and Paybill transactions are credited to each student account.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {[
          ["Total billed", totalBilled],
          ["Confirmed payments", totalPaid],
          ["Outstanding balance", totalBilled - totalPaid],
        ].map(([label, value]) => (
          <div key={String(label)} className="rounded-lg border bg-muted/30 p-4">
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="mt-2 text-lg font-bold text-brand">{formatKES(Number(value))}</p>
          </div>
        ))}
      </div>
      <details open={Boolean(manualPaymentId)} className="rounded-lg border bg-muted/20 p-4">
        <summary className="cursor-pointer text-sm font-semibold text-brand">
          {manualPaymentId ? "Edit manual payment" : "Record a manual payment"}
        </summary>
        <form
          className="mt-4 grid gap-3 sm:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault();
            manualPaymentMutation.mutate();
          }}
        >
          <label className="space-y-1 text-sm font-medium">
            Student
            <select
              required
              className={selectClass}
              value={manualPayment.student_id}
              disabled={Boolean(manualPaymentId)}
              onChange={(event) =>
                setManualPayment({ ...manualPayment, student_id: event.target.value })
              }
            >
              <option value="">Select student</option>
              {accountRows.map((student) => (
                <option key={student.student_id} value={student.student_id}>
                  {student.student_number} · {student.first_name} {student.last_name}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-sm font-medium">
            Amount (KES)
            <Input
              required
              type="number"
              min="0.01"
              step="0.01"
              value={manualPayment.amount}
              onChange={(event) =>
                setManualPayment({ ...manualPayment, amount: event.target.value })
              }
            />
          </label>
          <label className="space-y-1 text-sm font-medium">
            Payment method
            <Input
              required
              value={manualPayment.method}
              onChange={(event) =>
                setManualPayment({ ...manualPayment, method: event.target.value })
              }
              placeholder="Cash, bank deposit, M-Pesa…"
            />
          </label>
          <label className="space-y-1 text-sm font-medium">
            Transaction reference (optional)
            <Input
              value={manualPayment.reference}
              onChange={(event) =>
                setManualPayment({ ...manualPayment, reference: event.target.value })
              }
            />
          </label>
          <label className="space-y-1 text-sm font-medium">
            Payment date
            <Input
              required
              type="date"
              value={manualPayment.paid_at}
              onChange={(event) =>
                setManualPayment({ ...manualPayment, paid_at: event.target.value })
              }
            />
          </label>
          <label className="space-y-1 text-sm font-medium sm:col-span-2">
            Explanation / transaction notes
            <Textarea
              required
              rows={2}
              value={manualPayment.explanation}
              onChange={(event) =>
                setManualPayment({ ...manualPayment, explanation: event.target.value })
              }
              placeholder="Explain what this manual payment covers and who recorded it"
            />
          </label>
          <div className="flex gap-2 sm:col-span-2">
            <Button type="submit" disabled={manualPaymentMutation.isPending}>
              {manualPaymentMutation.isPending
                ? "Saving…"
                : manualPaymentId
                  ? "Save payment changes"
                  : "Record payment"}
            </Button>
            {manualPaymentId && (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setManualPaymentId(null);
                  setManualPayment({
                    student_id: "",
                    amount: "",
                    method: "Cash",
                    reference: "",
                    explanation: "",
                    paid_at: new Date().toISOString().slice(0, 10),
                  });
                }}
              >
                Cancel edit
              </Button>
            )}
          </div>
        </form>
      </details>
      <div>
        <h3 className="mb-2 text-sm font-semibold text-brand">Student balances</h3>
        {accounts.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px] text-left text-sm">
              <thead>
                <tr className="border-b text-xs uppercase text-muted-foreground">
                  <th className="px-3 py-2">Student</th>
                  <th className="px-3 py-2">Billed</th>
                  <th className="px-3 py-2">Paid</th>
                  <th className="px-3 py-2">Balance</th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((student) => (
                  <tr key={student.student_id} className="border-b last:border-0">
                    <td className="px-3 py-2.5">
                      {student.first_name} {student.last_name} ({student.student_number})
                    </td>
                    <td className="px-3 py-2.5">{formatKES(student.billed)}</td>
                    <td className="px-3 py-2.5">{formatKES(student.paid)}</td>
                    <td className="px-3 py-2.5">{formatKES(student.billed - student.paid)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No student fee accounts are available.</p>
        )}
      </div>
      <div>
        <h3 className="mb-2 text-sm font-semibold text-brand">Latest payment transactions</h3>
        {payments.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead>
                <tr className="border-b text-xs uppercase text-muted-foreground">
                  <th className="px-3 py-2">Student</th>
                  <th className="px-3 py-2">Transaction reference</th>
                  <th className="px-3 py-2">Method</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Date</th>
                  <th className="px-3 py-2 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((payment) => {
                  const student = studentById.get(payment.student_id);
                  const raw =
                    payment.raw && typeof payment.raw === "object" && !Array.isArray(payment.raw)
                      ? (payment.raw as Record<string, unknown>)
                      : {};
                  return (
                    <tr key={payment.id} className="border-b last:border-0">
                      <td className="px-3 py-2.5">
                        {student
                          ? `${student.first_name} ${student.last_name} (${student.student_number})`
                          : "Unknown student"}
                      </td>
                      <td className="px-3 py-2.5">
                        <span>{payment.reference ?? "—"}</span>
                        {typeof raw["explanation"] === "string" && (
                          <span className="block text-xs text-muted-foreground">
                            {raw["explanation"]}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2.5">{payment.method}</td>
                      <td className="px-3 py-2.5 capitalize">{payment.status}</td>
                      <td className="px-3 py-2.5">
                        {new Date(payment.paid_at).toLocaleDateString("en-KE")}
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {formatKES(payment.amount)}
                          {!payment.provider && payment.status === "confirmed" && (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                const rawValue =
                                  payment.raw &&
                                  typeof payment.raw === "object" &&
                                  !Array.isArray(payment.raw)
                                    ? (payment.raw as Record<string, unknown>)
                                    : {};
                                setManualPaymentId(payment.id);
                                setManualPayment({
                                  student_id: payment.student_id,
                                  amount: String(payment.amount),
                                  method: payment.method,
                                  reference: payment.reference ?? "",
                                  explanation:
                                    typeof rawValue["explanation"] === "string"
                                      ? rawValue["explanation"]
                                      : "",
                                  paid_at: new Date(payment.paid_at).toISOString().slice(0, 10),
                                });
                              }}
                            >
                              Edit
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            No payment transactions have been recorded.
          </p>
        )}
      </div>
    </section>
  );
}

function OnlineUsersPanel() {
  const query = useQuery({
    queryKey: ["admin", "online-users"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("list_online_users");
      if (error) throw error;
      return data ?? [];
    },
    refetchInterval: 15_000,
  });

  if (query.isLoading) return <LoadingState />;
  if (query.error) return <ErrorPanel error={query.error} retry={() => void query.refetch()} />;

  return (
    <section className="space-y-4 rounded-xl border bg-card p-5 shadow-card">
      <div>
        <h2 className="font-semibold text-brand">Online users</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {query.data?.length ?? 0} users currently online. This list refreshes automatically.
        </p>
      </div>
      {query.data?.length ? (
        <ul className="divide-y">
          {query.data.map((onlineUser, index) => (
            <li
              key={`${onlineUser.name}-${onlineUser.role}-${index}`}
              className="flex items-center justify-between gap-4 py-3"
            >
              <div className="min-w-0">
                <p className="truncate font-medium">{onlineUser.name}</p>
                <p className="text-sm text-muted-foreground">{onlineUser.role}</p>
              </div>
              <Badge variant="secondary" className="shrink-0 gap-1.5">
                <span className="h-2 w-2 rounded-full bg-emerald-500" aria-hidden="true" />
                Online
              </Badge>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyPanel title="No users online" detail="Currently active users will appear here." />
      )}
    </section>
  );
}

function AuditLogPanel() {
  const query = useQuery({
    queryKey: ["admin", "audit-log"],
    queryFn: async () => {
      const { data: entries, error } = await supabase
        .from("audit_logs")
        .select("id,actor_id,action,entity,details,created_at")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;

      const actorIds = [
        ...new Set((entries ?? []).flatMap((entry) => (entry.actor_id ? [entry.actor_id] : []))),
      ];
      const { data: actors, error: actorsError } = actorIds.length
        ? await supabase.from("profiles").select("id,full_name").in("id", actorIds)
        : { data: [], error: null };
      if (actorsError) throw actorsError;

      const actorNames = new Map((actors ?? []).map((actor) => [actor.id, actor.full_name]));
      return (entries ?? []).map((entry) => ({
        id: entry.id,
        actor:
          (entry.actor_id && actorNames.get(entry.actor_id)?.trim()) ||
          (entry.actor_id ? "Unknown actor" : "System"),
        change: summarizeAuditChange(entry.action, entry.entity, entry.details),
        createdAt: entry.created_at,
      }));
    },
  });

  if (query.isLoading) return <LoadingState />;
  if (query.error) return <ErrorPanel error={query.error} retry={() => void query.refetch()} />;

  return (
    <section className="space-y-4 rounded-xl border bg-card p-5 shadow-card">
      <div>
        <h2 className="font-semibold text-brand">Audit log</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Latest {Math.min(query.data?.length ?? 0, 200)} changes · read-only
        </p>
      </div>
      {query.data?.length ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[480px] border-collapse text-left text-sm">
            <thead>
              <tr>
                <th className="border-b px-3 py-2 text-xs font-semibold uppercase text-muted-foreground">
                  Actor
                </th>
                <th className="border-b px-3 py-2 text-xs font-semibold uppercase text-muted-foreground">
                  Change
                </th>
                <th className="border-b px-3 py-2 text-xs font-semibold uppercase text-muted-foreground">
                  Time
                </th>
              </tr>
            </thead>
            <tbody>
              {query.data.map((entry) => (
                <tr key={entry.id} className="border-b last:border-0">
                  <td className="px-3 py-3 font-medium">{entry.actor}</td>
                  <td className="px-3 py-3">{entry.change}</td>
                  <td className="whitespace-nowrap px-3 py-3 text-muted-foreground">
                    <time dateTime={entry.createdAt}>{formatAuditTime(entry.createdAt)}</time>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyPanel title="No audit activity yet" detail="Recorded changes will appear here." />
      )}
    </section>
  );
}

function DataDirectory({ section }: { section: DashboardSection }) {
  const queryClient = useQueryClient();
  const [assignmentView, setAssignmentView] = useState<
    "cats" | "cat-results" | "submissions" | "assignments"
  >("cats");
  const [savingRecord, setSavingRecord] = useState(false);
  const [editingContentId, setEditingContentId] = useState<string | null>(null);
  const [editingFee, setEditingFee] = useState<{
    id: string;
    description: string;
    amount: string;
  } | null>(null);
  const updateFeeMutation = useMutation({
    mutationFn: async (fee: { id: string; description: string; amount: number }) => {
      const { error } = await supabase
        .from("fees")
        .update({ description: fee.description, amount: fee.amount })
        .eq("id", fee.id);
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("Fee charge updated");
      setEditingFee(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["admin", "directory", "fees"] }),
        queryClient.invalidateQueries({ queryKey: ["admin", "fee-management"] }),
        queryClient.invalidateQueries({ queryKey: ["admin", "overview"] }),
        queryClient.invalidateQueries({ queryKey: ["student", "fees"] }),
        queryClient.invalidateQueries({ queryKey: ["student", "fee-total"] }),
      ]);
    },
    onError: (error: Error) =>
      toast.error("Could not update fee charge", { description: error.message }),
  });
  const configuration: Partial<
    Record<DashboardSection, { table: string; label: string; order: string }>
  > = {
    schools: { table: "schools", label: "schools", order: "sort_order" },
    academics: { table: "course_units", label: "course units", order: "sort_order" },
    results: { table: "results", label: "results", order: "created_at" },
    fees: { table: "fees", label: "fee charges", order: "created_at" },
    materials: { table: "learning_materials", label: "learning materials", order: "created_at" },
    assignments: { table: "assignments", label: "assignments", order: "due_date" },
    articles: { table: "articles", label: "articles", order: "created_at" },
    announcements: { table: "announcements", label: "announcements", order: "created_at" },
    memos: { table: "announcements", label: "memos", order: "created_at" },
    media: { table: "media", label: "media items", order: "created_at" },
    messages: { table: "contact_messages", label: "messages", order: "created_at" },
    audit: { table: "audit_logs", label: "audit log entries", order: "created_at" },
  };
  const config = configuration[section];
  const query = useQuery({
    queryKey: ["admin", "directory", section],
    enabled: !!config,
    queryFn: async () => {
      let data: unknown[] | null = null;
      let error: { message: string } | null = null;
      switch (section) {
        case "schools": {
          const result = await supabase.from("schools").select("*").order("sort_order");
          data = result.data;
          error = result.error;
          break;
        }
        case "academics": {
          const result = await supabase.from("course_units").select("*").order("sort_order");
          data = result.data;
          error = result.error;
          break;
        }
        case "results": {
          const result = await supabase
            .from("results")
            .select(
              "*,student:students(student_number,first_name,middle_name,last_name),unit:course_units(title)",
            )
            .order("created_at", { ascending: false });
          data = result.data;
          error = result.error;
          break;
        }
        case "fees": {
          const result = await supabase
            .from("fees")
            .select("*,student:students(student_number,first_name,middle_name,last_name)")
            .order("created_at", { ascending: false });
          data = result.data;
          error = result.error;
          break;
        }
        case "materials": {
          const result = await supabase
            .from("learning_materials")
            .select("*")
            .order("created_at", { ascending: false });
          data = result.data;
          error = result.error;
          break;
        }
        case "assignments": {
          const result = await supabase
            .from("assignments")
            .select("*,course:courses(title),unit:course_units(title)")
            .order("due_date");
          data = result.data;
          error = result.error;
          break;
        }
        case "articles": {
          const result = await supabase
            .from("articles")
            .select("*")
            .order("created_at", { ascending: false });
          data = result.data;
          error = result.error;
          break;
        }
        case "announcements": {
          const result = await supabase
            .from("announcements")
            .select("*")
            .order("created_at", { ascending: false });
          data = result.data;
          error = result.error;
          break;
        }
        case "memos": {
          const result = await supabase
            .from("announcements")
            .select("*")
            .eq("category", "memo")
            .order("created_at", { ascending: false });
          data = result.data;
          error = result.error;
          break;
        }
        case "media": {
          const result = await supabase
            .from("media")
            .select("*")
            .order("created_at", { ascending: false });
          data = result.data;
          error = result.error;
          break;
        }
        case "messages": {
          const result = await supabase
            .from("contact_messages")
            .select("*")
            .order("created_at", { ascending: false });
          data = result.data;
          error = result.error;
          break;
        }
        case "audit": {
          const result = await supabase
            .from("audit_logs")
            .select("*")
            .order("created_at", { ascending: false })
            .limit(200);
          data = result.data;
          error = result.error;
          break;
        }
      }
      if (error) throw new Error(error.message);
      return (data ?? []) as Record<string, unknown>[];
    },
  });

  if (!config)
    return (
      <EmptyPanel
        title="This section is not available"
        detail="Ask a Super Admin to check your role permissions."
      />
    );
  if (query.isLoading) return <LoadingState />;
  if (query.error) return <ErrorPanel error={query.error} retry={() => query.refetch()} />;
  async function invalidatePublicContent() {
    if (section === "announcements" || section === "memos") {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["public-announcements"] }),
        queryClient.invalidateQueries({ queryKey: ["home_announcements"] }),
        queryClient.invalidateQueries({ queryKey: ["student-announcements"] }),
      ]);
    } else if (section === "articles") {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["articles"] }),
        queryClient.invalidateQueries({ queryKey: ["article"] }),
      ]);
    }
  }
  async function updateRecord(row: Record<string, unknown>) {
    if (!row["id"]) return;
    let error: { message: string } | null = null;
    switch (section) {
      case "schools": {
        const result = await supabase
          .from("schools")
          .update({ published: !row["published"] })
          .eq("id", String(row["id"]));
        error = result.error;
        break;
      }
      case "results": {
        const result = await supabase
          .from("results")
          .update({ published: !row["published"] })
          .eq("id", String(row["id"]));
        error = result.error;
        break;
      }
      case "fees": {
        return;
      }
      case "materials": {
        const result = await supabase
          .from("learning_materials")
          .update({ published: !row["published"] })
          .eq("id", String(row["id"]));
        error = result.error;
        break;
      }
      case "assignments": {
        const result = await supabase
          .from("assignments")
          .update({ published: !row["published"] })
          .eq("id", String(row["id"]));
        error = result.error;
        break;
      }
      case "announcements":
      case "memos": {
        const result = await supabase
          .from("announcements")
          .update({
            published: !row["published"],
            ...(row["published"]
              ? {}
              : { show_public: true, show_on_homepage: true, show_to_students: true }),
          })
          .eq("id", String(row["id"]));
        error = result.error;
        break;
      }
      case "media": {
        const result = await supabase
          .from("media")
          .update({ published: !row["published"] })
          .eq("id", String(row["id"]));
        error = result.error;
        break;
      }
      case "articles": {
        const nextStatus = row["status"] === "published" ? "draft" : "published";
        const result = await supabase
          .from("articles")
          .update({
            status: nextStatus,
            published_at: nextStatus === "published" ? new Date().toISOString() : null,
          })
          .eq("id", String(row["id"]));
        error = result.error;
        break;
      }
      case "messages": {
        const result = await supabase
          .from("contact_messages")
          .update({ status: row["status"] === "new" ? "responded" : "new" })
          .eq("id", String(row["id"]));
        error = result.error;
        break;
      }
      default:
        return;
    }
    if (error) toast.error("Could not update record", { description: error.message });
    else {
      toast.success("Record updated");
      await queryClient.invalidateQueries({ queryKey: ["admin", "directory", section] });
      await queryClient.invalidateQueries({ queryKey: ["admin", "overview"] });
      await invalidatePublicContent();
      if (section === "media") await queryClient.invalidateQueries({ queryKey: ["media"] });
    }
  }
  async function deleteContentRecord(row: Record<string, unknown>) {
    if (!row["id"] || !["articles", "announcements", "memos"].includes(section)) return;
    if (!window.confirm(`Delete “${String(row["title"] ?? "this item")}”? This cannot be undone.`))
      return;
    const result =
      section === "articles"
        ? await supabase.from("articles").delete().eq("id", String(row["id"]))
        : await supabase.from("announcements").delete().eq("id", String(row["id"]));
    if (result.error) {
      toast.error("Could not delete content", { description: result.error.message });
      return;
    }
    const storagePath = storagePathFromPublicUrl(row["attachment_url"]);
    if (storagePath) {
      const { error } = await supabase.storage.from("media").remove([storagePath]);
      if (error) toast.error("Content deleted, but its attachment could not be removed");
    }
    toast.success("Content deleted");
    setEditingContentId(null);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["admin", "directory", section] }),
      queryClient.invalidateQueries({ queryKey: ["admin", "overview"] }),
    ]);
    await invalidatePublicContent();
  }
  const getRowEntries = (row: Record<string, unknown>) => {
    const entries = Object.entries(row).filter(
      ([key]) =>
        !["raw", "details", "upload_token"].includes(key) &&
        key !== "source_submission_id" &&
        !(section === "fees" && (key === "student" || key === "id" || key.endsWith("_id"))),
    );
    if (section === "fees") entries.unshift(["student", row["student"]]);
    return entries.slice(0, 8);
  };
  return (
    <section className="space-y-4 rounded-xl border bg-card p-5 shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold text-brand">
            {section === "assignments" ? "Assignments & CATs" : config.label}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {section === "assignments"
              ? "Manage CATs, assignment submissions, and published assignments."
              : `Latest ${Math.min(query.data?.length ?? 0, 200)} records`}
          </p>
        </div>
        {section !== "assignments" || assignmentView === "assignments" ? (
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() =>
                exportCsv(`${section}.csv`, directoryExportRows(section, query.data ?? []))
              }
            >
              <ArrowDownToLine /> Export CSV
            </Button>
            <Button
              variant="outline"
              onClick={() =>
                exportExcel(`${section}.xlsx`, directoryExportRows(section, query.data ?? []))
              }
            >
              <ArrowDownToLine /> Export Excel
            </Button>
          </div>
        ) : null}
      </div>
      {section === "assignments" && (
        <div className="grid gap-2 rounded-lg bg-muted/40 p-1 sm:grid-cols-4">
          {(
            [
              ["cats", "CAT management"],
              ["cat-results", "CAT results"],
              ["submissions", "Assignment submissions"],
              ["assignments", "Assignment list"],
            ] as const
          ).map(([view, label]) => (
            <button
              key={view}
              type="button"
              aria-pressed={assignmentView === view}
              className={`min-h-10 rounded-md px-3 py-2 text-sm font-medium transition ${
                assignmentView === view
                  ? "bg-background text-brand shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              onClick={() => setAssignmentView(view)}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      {["schools", "academics", "results", "fees", "materials", "assignments"].includes(section) &&
        (section !== "assignments" || assignmentView === "assignments") && (
          <DirectoryCreateForm
            section={section}
            onSaved={() => {
              void queryClient.invalidateQueries({ queryKey: ["admin", "directory", section] });
              void queryClient.invalidateQueries({ queryKey: ["admin", "overview"] });
              if (section === "fees") {
                void queryClient.invalidateQueries({ queryKey: ["admin", "fee-management"] });
                void queryClient.invalidateQueries({ queryKey: ["student", "fees"] });
                void queryClient.invalidateQueries({ queryKey: ["student", "fee-total"] });
              }
            }}
            setSaving={setSavingRecord}
            saving={savingRecord}
          />
        )}
      {["articles", "announcements", "memos", "media"].includes(section) && (
        <ContentCreateForm
          section={section}
          onSaved={() =>
            void Promise.all([
              queryClient.invalidateQueries({ queryKey: ["admin", "directory", section] }),
              invalidatePublicContent(),
            ])
          }
        />
      )}
      {section === "assignments" &&
        (assignmentView === "cats" ? (
          <CatManagementPanel />
        ) : assignmentView === "cat-results" ? (
          <CatResultsPanel />
        ) : assignmentView === "submissions" ? (
          <AssignmentSubmissionsPanel />
        ) : null)}
      {(section !== "assignments" || assignmentView === "assignments") &&
        (query.data?.length ? (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-left text-sm">
              <thead>
                <tr>
                  {getRowEntries(query.data[0] ?? {}).map(([key]) => (
                    <th
                      key={key}
                      className="border-b px-3 py-2 text-xs font-semibold uppercase text-muted-foreground"
                    >
                      {key === "student" ? "Student" : key.replaceAll("_", " ")}
                    </th>
                  ))}
                  {[
                    "schools",
                    "results",
                    "materials",
                    "assignments",
                    "articles",
                    "announcements",
                    "memos",
                    "media",
                    "messages",
                    "fees",
                  ].includes(section) && (
                    <th className="border-b px-3 py-2 text-xs font-semibold uppercase text-muted-foreground">
                      Action
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {query.data.map((row, i) => (
                  <Fragment key={String(row["id"] ?? i)}>
                    <tr className="border-b last:border-0">
                      {getRowEntries(row).map(([key, value]) => (
                        <td key={key} className="max-w-64 truncate px-3 py-2.5">
                          {section === "fees" &&
                          editingFee?.id === String(row["id"]) &&
                          key === "description" ? (
                            <Input
                              aria-label="Fee charge description"
                              value={editingFee.description}
                              onChange={(event) =>
                                setEditingFee({ ...editingFee, description: event.target.value })
                              }
                            />
                          ) : section === "fees" &&
                            editingFee?.id === String(row["id"]) &&
                            key === "amount" ? (
                            <Input
                              aria-label="Fee charge amount"
                              type="number"
                              min="0"
                              step="0.01"
                              value={editingFee.amount}
                              onChange={(event) =>
                                setEditingFee({ ...editingFee, amount: event.target.value })
                              }
                            />
                          ) : section === "fees" && key === "student" ? (
                            feeStudentLabel(value)
                          ) : (
                            formatValue(value)
                          )}
                        </td>
                      ))}
                      {[
                        "schools",
                        "results",
                        "materials",
                        "assignments",
                        "articles",
                        "announcements",
                        "memos",
                        "media",
                        "messages",
                        "fees",
                      ].includes(section) && (
                        <td className="px-3 py-2.5">
                          <div className="flex flex-wrap items-center gap-2">
                            {(section === "materials" || section === "assignments") &&
                              typeof row["file_path"] === "string" && (
                                <AdminCourseFile path={row["file_path"]} />
                              )}
                            {(section === "articles" ||
                              section === "announcements" ||
                              section === "memos") &&
                              typeof row["attachment_url"] === "string" && (
                                <ContentAttachmentDownload
                                  url={row["attachment_url"]}
                                  filename={
                                    typeof row["attachment_file_name"] === "string"
                                      ? row["attachment_file_name"]
                                      : String(row["title"] ?? "attachment")
                                  }
                                />
                              )}
                            {(section === "articles" ||
                              section === "announcements" ||
                              section === "memos") && (
                              <>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() =>
                                    setEditingContentId(
                                      editingContentId === String(row["id"])
                                        ? null
                                        : String(row["id"]),
                                    )
                                  }
                                >
                                  {editingContentId === String(row["id"]) ? "Close edit" : "Edit"}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  disabled={savingRecord}
                                  onClick={() => void deleteContentRecord(row)}
                                >
                                  Delete
                                </Button>
                              </>
                            )}
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={savingRecord || updateFeeMutation.isPending}
                              onClick={() => {
                                if (section !== "fees") {
                                  void updateRecord(row);
                                  return;
                                }
                                if (editingFee?.id !== String(row["id"])) {
                                  setEditingFee({
                                    id: String(row["id"]),
                                    description: String(row["description"] ?? ""),
                                    amount: String(row["amount"] ?? ""),
                                  });
                                  return;
                                }
                                const amount = Number(editingFee.amount);
                                if (
                                  !editingFee.description.trim() ||
                                  !Number.isFinite(amount) ||
                                  amount < 0
                                ) {
                                  toast.error(
                                    "Enter a description and a valid non-negative fee amount.",
                                  );
                                  return;
                                }
                                updateFeeMutation.mutate({
                                  id: editingFee.id,
                                  description: editingFee.description.trim(),
                                  amount,
                                });
                              }}
                            >
                              {section === "fees"
                                ? editingFee?.id === String(row["id"])
                                  ? updateFeeMutation.isPending
                                    ? "Saving…"
                                    : "Save charge"
                                  : "Edit charge"
                                : section === "messages"
                                  ? row["status"] === "new"
                                    ? "Mark responded"
                                    : "Reopen"
                                  : section === "articles"
                                    ? row["status"] === "published"
                                      ? "Unpublish"
                                      : "Publish"
                                    : row["published"]
                                      ? "Deactivate"
                                      : "Activate"}
                            </Button>
                            {section === "fees" && editingFee?.id === String(row["id"]) && (
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                disabled={updateFeeMutation.isPending}
                                onClick={() => setEditingFee(null)}
                              >
                                Cancel
                              </Button>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                    {editingContentId === String(row["id"]) &&
                      (section === "articles" ||
                        section === "announcements" ||
                        section === "memos") && (
                        <tr>
                          <td colSpan={getRowEntries(row).length + 1} className="bg-muted/20 p-3">
                            <ContentEditForm
                              section={section}
                              record={row}
                              onCancel={() => setEditingContentId(null)}
                              onSaved={async () => {
                                setEditingContentId(null);
                                await queryClient.invalidateQueries({
                                  queryKey: ["admin", "directory", section],
                                });
                                await invalidatePublicContent();
                              }}
                            />
                          </td>
                        </tr>
                      )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyPanel
            title={`No ${config.label} yet`}
            detail="Records will appear here as they are created."
          />
        ))}
    </section>
  );
}

function DirectoryCreateForm({
  section,
  onSaved,
  setSaving,
  saving,
}: {
  section: DashboardSection;
  onSaved: () => void;
  setSaving: (saving: boolean) => void;
  saving: boolean;
}) {
  const { user } = useUser();
  const needsStudents = section === "results" || section === "fees";
  const needsCourses =
    section === "academics" || section === "materials" || section === "assignments";
  const optionsQuery = useQuery({
    queryKey: ["admin", "directory-options", section],
    queryFn: async () => {
      const [students, courses] = await Promise.all([
        needsStudents
          ? supabase
              .from("students")
              .select("id,student_number,first_name,last_name,course_id,level_id")
              .order("last_name")
          : Promise.resolve({ data: [], error: null }),
        needsCourses
          ? supabase.from("courses").select("id,title").order("title")
          : Promise.resolve({ data: [], error: null }),
      ]);
      if (students.error) throw students.error;
      if (courses.error) throw courses.error;
      return { students: students.data, courses: courses.data };
    },
  });
  const [values, setValues] = useState({
    title: "",
    slug: "",
    description: "",
    course_id: "",
    student_id: "",
    unit_id: "",
    code: "",
    semester: "",
    score: "",
    grade: "",
    academic_year: "",
    amount: "",
    due_date: "",
    url: "",
    file: null as File | null,
  });
  const assignmentUnitsQuery = useQuery({
    queryKey: ["admin", "assignment-unit-options", values.course_id],
    enabled: section === "assignments" && Boolean(values.course_id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("course_units")
        .select("id,title,code,level_id")
        .eq("course_id", values.course_id)
        .order("sort_order");
      if (error) throw error;
      return data;
    },
  });
  const resultUnitsQuery = useQuery({
    queryKey: ["admin", "result-unit-options", values.student_id],
    enabled: section === "results" && Boolean(values.student_id),
    queryFn: async () => {
      const student = optionsQuery.data?.students.find((item) => item.id === values.student_id);
      if (!student) return [];
      const [enrollments, onlineEnrollments] = await Promise.all([
        supabase
          .from("enrollments")
          .select("course_id,level_id")
          .eq("student_id", student.id)
          .eq("status", "active"),
        supabase
          .from("online_course_enrollments")
          .select("course_id,level_id")
          .eq("student_id", student.id)
          .eq("status", "active"),
      ]);
      if (enrollments.error) throw enrollments.error;
      if (onlineEnrollments.error) throw onlineEnrollments.error;
      const activeEnrollments = [...(enrollments.data ?? []), ...(onlineEnrollments.data ?? [])];
      const courseIds = [...new Set(activeEnrollments.map((enrollment) => enrollment.course_id))];
      if (!courseIds.length) return [];
      const { data, error } = await supabase
        .from("course_units")
        .select("id,title,code,course_id,level_id")
        .in("course_id", courseIds)
        .order("sort_order");
      if (error) throw error;
      return (data ?? []).filter((unit) =>
        activeEnrollments.some((enrollment) => {
          if (enrollment.course_id !== unit.course_id) return false;
          const levelId =
            enrollment.level_id ??
            (student.course_id === enrollment.course_id ? student.level_id : null);
          return unit.level_id === null || unit.level_id === levelId;
        }),
      );
    },
  });
  const [selectedLevelIds, setSelectedLevelIds] = useState<string[]>([]);
  const formTitle: Partial<Record<DashboardSection, string>> = {
    schools: "Add school",
    academics: "Add course unit",
    results: "Record result",
    fees: "Add fee charge",
    materials: "Add learning material",
    assignments: "Create assignment",
  };

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if ((section === "materials" || section === "assignments") && !values.course_id) {
      toast.error("Select a course before uploading course materials.");
      return;
    }
    if (section === "assignments") {
      const deadline = new Date(values.due_date);
      if (!values.due_date || !Number.isFinite(deadline.getTime())) {
        toast.error("Set a valid assignment submission deadline.");
        return;
      }
      if (!values.unit_id) {
        toast.error("Select the course unit this assignment is for.");
        return;
      }
      if (!selectedLevelIds.length) {
        toast.error("Select at least one course level for this assignment.");
        return;
      }
    }
    if (section === "results" && !values.unit_id) {
      toast.error("Select an enrolled course unit for this result.");
      return;
    }
    if (
      section === "results" &&
      !resultUnitsQuery.data?.some((unit) => unit.id === values.unit_id)
    ) {
      toast.error("Choose a course unit from the student's active enrollment.");
      return;
    }
    const fileType = values.file ? supportedContentType(values.file) : null;
    if (values.file && (!fileType || values.file.size > MAX_CONTENT_UPLOAD_SIZE)) {
      toast.error(
        !fileType
          ? "Choose a PDF, Word document, image, audio, or video file."
          : "Each file must be 100 MB or smaller.",
      );
      return;
    }
    setSaving(true);
    let error: { message: string } | null = null;
    let uploadedPath: string | null = null;
    if (values.file && fileType && (section === "materials" || section === "assignments")) {
      uploadedPath = `${values.course_id}/${section}/${crypto.randomUUID()}-${safeUploadFileName(values.file.name)}`;
      const { error: uploadError } = await supabase.storage
        .from("learning")
        .upload(uploadedPath, values.file, {
          contentType: fileType,
          upsert: false,
        });
      if (uploadError) {
        setSaving(false);
        toast.error("Could not upload course file", { description: uploadError.message });
        return;
      }
    }
    switch (section) {
      case "schools": {
        const slug =
          values.slug.trim() ||
          values.title
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-|-$/g, "");
        const result = await supabase.from("schools").insert({
          name: values.title.trim(),
          slug,
          description: values.description.trim() || null,
          published: true,
        });
        error = result.error;
        break;
      }
      case "academics": {
        const result = await supabase.from("course_units").insert({
          course_id: values.course_id,
          title: values.title.trim(),
          code: values.code.trim() || null,
          semester: values.semester.trim() || null,
        });
        error = result.error;
        break;
      }
      case "results": {
        const unit = resultUnitsQuery.data?.find((item) => item.id === values.unit_id);
        if (!unit) {
          error = { message: "Select a valid unit for this student's active enrollment." };
          break;
        }
        const result = await supabase.from("results").insert({
          student_id: values.student_id,
          unit_id: unit.id,
          unit_name: unit.title,
          score: values.score === "" ? null : Number(values.score),
          grade: values.grade.trim() || null,
          semester: values.semester.trim() || null,
          academic_year: values.academic_year.trim() || null,
          published: false,
        });
        error = result.error;
        break;
      }
      case "fees": {
        const result = await supabase.from("fees").insert({
          student_id: values.student_id,
          description: values.title.trim(),
          amount: Number(values.amount),
          academic_year: values.academic_year.trim() || null,
          due_date: values.due_date || null,
        });
        error = result.error;
        break;
      }
      case "materials": {
        const result = await supabase.from("learning_materials").insert({
          course_id: values.course_id,
          title: values.title.trim(),
          description: values.description.trim() || null,
          external_url: values.url.trim() || null,
          file_path: uploadedPath,
          material_type: values.file && fileType ? contentKind(fileType) : "link",
          uploaded_by: user?.id ?? null,
          published: true,
        });
        error = result.error;
        break;
      }
      case "assignments": {
        const result = await supabase.from("assignments").insert({
          course_id: values.course_id,
          unit_id: values.unit_id,
          title: values.title.trim(),
          instructions: values.description.trim() || null,
          due_date: values.due_date ? new Date(values.due_date).toISOString() : null,
          file_path: uploadedPath,
          level_ids: selectedLevelIds,
          created_by: user?.id ?? null,
          published: false,
        });
        error = result.error;
        break;
      }
    }
    setSaving(false);
    if (error) {
      if (uploadedPath) {
        const { error: cleanupError } = await supabase.storage
          .from("learning")
          .remove([uploadedPath]);
        if (cleanupError)
          toast.error("Could not clean up the uploaded file", {
            description: cleanupError.message,
          });
      }
      toast.error("Could not save record", { description: error.message });
    } else {
      toast.success("Record saved");
      setValues({
        title: "",
        slug: "",
        description: "",
        course_id: "",
        student_id: "",
        unit_id: "",
        code: "",
        semester: "",
        score: "",
        grade: "",
        academic_year: "",
        amount: "",
        due_date: "",
        url: "",
        file: null,
      });
      setSelectedLevelIds([]);
      onSaved();
    }
  }

  return (
    <details className="rounded-lg border bg-muted/30 p-4">
      <summary className="cursor-pointer text-sm font-semibold text-brand">
        {formTitle[section]}
      </summary>
      {optionsQuery.error && (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {optionsQuery.error.message}
        </p>
      )}
      <form className="mt-4 grid gap-3 sm:grid-cols-2" onSubmit={submit}>
        {(section === "schools" ||
          section === "academics" ||
          section === "fees" ||
          section === "materials" ||
          section === "assignments") && (
          <Input
            required
            placeholder={
              section === "schools"
                ? "School name"
                : section === "fees"
                  ? "Fee description"
                  : "Title"
            }
            value={values.title}
            onChange={(e) => setValues({ ...values, title: e.target.value })}
          />
        )}
        {section === "schools" && (
          <>
            <Input
              placeholder="URL slug (optional)"
              value={values.slug}
              onChange={(e) => setValues({ ...values, slug: e.target.value })}
            />
            <Textarea
              className="sm:col-span-2"
              placeholder="School description"
              value={values.description}
              onChange={(e) => setValues({ ...values, description: e.target.value })}
            />
          </>
        )}
        {section === "academics" && (
          <>
            <select
              required
              className={selectClass}
              value={values.course_id}
              onChange={(e) => {
                setValues({ ...values, course_id: e.target.value });
                setSelectedLevelIds([]);
              }}
            >
              <option value="">Select course</option>
              {optionsQuery.data?.courses.map((course) => (
                <option key={course.id} value={course.id}>
                  {course.title}
                </option>
              ))}
            </select>
            <Input
              placeholder="Unit code"
              value={values.code}
              onChange={(e) => setValues({ ...values, code: e.target.value })}
            />
            <Input
              placeholder="Semester"
              value={values.semester}
              onChange={(e) => setValues({ ...values, semester: e.target.value })}
            />
          </>
        )}
        {(section === "results" || section === "fees") && (
          <select
            required
            className={selectClass}
            value={values.student_id}
            onChange={(e) =>
              setValues({
                ...values,
                student_id: e.target.value,
                unit_id: "",
              })
            }
          >
            <option value="">Select student</option>
            {optionsQuery.data?.students.map((student) => (
              <option key={student.id} value={student.id}>
                {student.student_number} · {student.first_name} {student.last_name}
              </option>
            ))}
          </select>
        )}
        {section === "results" && (
          <>
            <select
              required
              className={selectClass}
              value={values.unit_id}
              onChange={(e) => {
                const unit = resultUnitsQuery.data?.find((item) => item.id === e.target.value);
                setValues({
                  ...values,
                  unit_id: e.target.value,
                  title: unit?.title ?? "",
                });
              }}
              disabled={!values.student_id || resultUnitsQuery.isLoading}
            >
              <option value="">
                {resultUnitsQuery.isLoading ? "Loading enrolled units…" : "Select enrolled unit"}
              </option>
              {resultUnitsQuery.data?.map((unit) => (
                <option key={unit.id} value={unit.id}>
                  {unit.code ? `${unit.code} · ` : ""}
                  {unit.title}
                </option>
              ))}
            </select>
            {resultUnitsQuery.error && (
              <p role="alert" className="text-sm text-destructive sm:col-span-2">
                Could not load the student's enrolled units: {resultUnitsQuery.error.message}
              </p>
            )}
            <Input
              type="number"
              min="0"
              max="100"
              step="0.01"
              placeholder="Score (%)"
              value={values.score}
              onChange={(e) => setValues({ ...values, score: e.target.value })}
            />
            <Input
              placeholder="Grade"
              value={values.grade}
              onChange={(e) => setValues({ ...values, grade: e.target.value })}
            />
            <Input
              placeholder="Semester"
              value={values.semester}
              onChange={(e) => setValues({ ...values, semester: e.target.value })}
            />
            <Input
              placeholder="Academic year"
              value={values.academic_year}
              onChange={(e) => setValues({ ...values, academic_year: e.target.value })}
            />
          </>
        )}
        {section === "fees" && (
          <>
            <Input
              required
              type="number"
              min="0"
              step="0.01"
              placeholder="Amount (KES)"
              value={values.amount}
              onChange={(e) => setValues({ ...values, amount: e.target.value })}
            />
            <Input
              type="date"
              aria-label="Fee due date"
              value={values.due_date}
              onChange={(e) => setValues({ ...values, due_date: e.target.value })}
            />
            <Input
              placeholder="Academic year"
              value={values.academic_year}
              onChange={(e) => setValues({ ...values, academic_year: e.target.value })}
            />
          </>
        )}
        {(section === "materials" || section === "assignments") && (
          <>
            <select
              required
              className={selectClass}
              value={values.course_id}
              onChange={(e) => {
                setValues({ ...values, course_id: e.target.value, unit_id: "" });
                setSelectedLevelIds([]);
              }}
            >
              <option value="">Select course</option>
              {optionsQuery.data?.courses.map((course) => (
                <option key={course.id} value={course.id}>
                  {course.title}
                </option>
              ))}
            </select>
            {section === "assignments" && (
              <select
                required
                className={selectClass}
                value={values.unit_id}
                onChange={(e) => {
                  const unit = assignmentUnitsQuery.data?.find(
                    (item) => item.id === e.target.value,
                  );
                  setValues({ ...values, unit_id: e.target.value });
                  setSelectedLevelIds(unit?.level_id ? [unit.level_id] : []);
                }}
                disabled={!values.course_id || assignmentUnitsQuery.isLoading}
              >
                <option value="">
                  {assignmentUnitsQuery.isLoading ? "Loading units…" : "Select course unit"}
                </option>
                {assignmentUnitsQuery.data?.map((unit) => (
                  <option key={unit.id} value={unit.id}>
                    {unit.code ? `${unit.code} · ` : ""}
                    {unit.title}
                  </option>
                ))}
              </select>
            )}
            {section === "assignments" && assignmentUnitsQuery.error && (
              <p role="alert" className="text-sm text-destructive sm:col-span-2">
                Could not load course units: {assignmentUnitsQuery.error.message}
              </p>
            )}
            <Textarea
              className="sm:col-span-2"
              placeholder={section === "assignments" ? "Instructions" : "Description"}
              value={values.description}
              onChange={(e) => setValues({ ...values, description: e.target.value })}
            />
          </>
        )}
        {section === "materials" && (
          <>
            <Input
              className="sm:col-span-2"
              type="url"
              placeholder="External learning resource URL (optional)"
              value={values.url}
              onChange={(e) => setValues({ ...values, url: e.target.value })}
            />
            <ContentFileInput
              file={values.file}
              onFile={(file) => setValues({ ...values, file })}
            />
          </>
        )}
        {section === "assignments" && (
          <>
            <LevelTargetPicker
              courseId={values.course_id}
              selectedLevelIds={selectedLevelIds}
              onChange={setSelectedLevelIds}
              allowedLevelId={
                assignmentUnitsQuery.data?.find((unit) => unit.id === values.unit_id)?.level_id ??
                null
              }
            />
            <label className="space-y-1 text-sm font-medium sm:col-span-2">
              Submission deadline (local date and time)
              <Input
                type="datetime-local"
                aria-label="Assignment submission deadline"
                required
                value={values.due_date}
                onChange={(e) => setValues({ ...values, due_date: e.target.value })}
              />
            </label>
            <ContentFileInput
              file={values.file}
              onFile={(file) => setValues({ ...values, file })}
            />
          </>
        )}
        <Button
          className="sm:col-span-2"
          disabled={
            saving ||
            optionsQuery.isLoading ||
            (section === "results" && resultUnitsQuery.isLoading) ||
            (section === "assignments" && assignmentUnitsQuery.isLoading)
          }
        >
          {saving ? "Saving…" : "Save record"}
        </Button>
      </form>
    </details>
  );
}

function ContentCreateForm({
  section,
  onSaved,
}: {
  section: DashboardSection;
  onSaved: () => void;
}) {
  const { user } = useUser();
  const [saving, setSaving] = useState(false);
  const [values, setValues] = useState({
    title: "",
    content: "",
    excerpt: "",
    url: "",
    caption: "",
    alt: "",
    category: "homepage",
    file: null as File | null,
    starts_at: "",
    ends_at: "",
    show_to_students: section === "memos",
    show_to_facilitators: false,
    cta_label: "",
    cta_url: "",
    published: false,
  });
  const labels = {
    articles: "Write article",
    announcements: "Create announcement",
    memos: "Add memo",
    media: "Add media item",
  };

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const startsAt = dateTimeIsoOrNull(values.starts_at);
    const endsAt = dateTimeIsoOrNull(values.ends_at);
    if (startsAt && endsAt && new Date(endsAt) < new Date(startsAt)) {
      toast.error("The announcement end date must be after its start date.");
      return;
    }
    if (section === "memos" && !values.file) {
      toast.error("Attach a memo document before saving.");
      return;
    }
    if (section === "announcements") {
      const hasCtaLabel = Boolean(values.cta_label.trim());
      const hasCtaUrl = Boolean(values.cta_url.trim());
      if (hasCtaLabel !== hasCtaUrl) {
        toast.error("Enter both a CTA button label and URL, or leave both blank.");
        return;
      }
      if (hasCtaUrl && !isSafeAnnouncementUrl(values.cta_url.trim())) {
        toast.error("Enter a valid HTTP or HTTPS link for the announcement button.");
        return;
      }
    }
    const contentType = values.file ? supportedContentType(values.file) : null;
    if (values.file && (!contentType || values.file.size > MAX_CONTENT_UPLOAD_SIZE)) {
      toast.error(
        !contentType
          ? "Choose a PDF, Word document, image, audio, or video file."
          : "Each file must be 100 MB or smaller.",
      );
      return;
    }
    setSaving(true);
    let error: { message: string } | null = null;
    let uploadedPath: string | null = null;
    let uploadedUrl: string | null = null;
    if (values.file && contentType) {
      uploadedPath = `content/${crypto.randomUUID()}-${safeUploadFileName(values.file.name)}`;
      const { error: uploadError } = await supabase.storage
        .from("media")
        .upload(uploadedPath, values.file, {
          contentType,
          upsert: false,
        });
      if (uploadError) {
        setSaving(false);
        toast.error("Could not upload content file", {
          description: uploadError.message,
        });
        return;
      }
      uploadedUrl = supabase.storage.from("media").getPublicUrl(uploadedPath).data.publicUrl;
    }
    if (section === "articles") {
      const slug = values.title
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
      const result = await supabase.from("articles").insert({
        title: values.title.trim(),
        slug,
        excerpt: values.excerpt.trim() || null,
        content: values.content.trim(),
        author: user?.email ?? null,
        created_by: user?.id ?? null,
        attachment_url: uploadedUrl,
        attachment_type: contentType ? contentKind(contentType) : null,
        attachment_file_name: values.file?.name ?? null,
        featured_image: contentType?.startsWith("image/") ? uploadedUrl : null,
        status: "draft",
      });
      error = result.error;
    } else if (section === "announcements" || section === "memos") {
      const result = await supabase.from("announcements").insert({
        title: values.title.trim(),
        body: values.content.trim(),
        category: section === "memos" ? "memo" : "general",
        created_by: user?.id ?? null,
        attachment_url: uploadedUrl,
        attachment_type: contentType ? contentKind(contentType) : null,
        attachment_file_name: values.file?.name ?? null,
        starts_at: startsAt,
        ends_at: endsAt,
        show_public: true,
        show_on_homepage: true,
        show_to_students: values.show_to_students,
        show_to_facilitators: section === "memos" && values.show_to_facilitators,
        cta_label: values.cta_label.trim() || null,
        cta_url: values.cta_url.trim() || null,
        published: values.published,
      });
      error = result.error;
    } else {
      const result = await supabase.from("media").insert({
        url: values.url.trim(),
        category: values.category,
        caption: values.caption.trim() || null,
        alt: values.alt.trim() || null,
        uploaded_by: user?.id ?? null,
        published: false,
      });
      error = result.error;
    }
    setSaving(false);
    if (error) {
      if (uploadedPath) {
        const { error: cleanupError } = await supabase.storage.from("media").remove([uploadedPath]);
        if (cleanupError)
          toast.error("Could not clean up the uploaded file", {
            description: cleanupError.message,
          });
      }
      toast.error("Could not save content", { description: error.message });
    } else {
      toast.success(
        section === "announcements" && values.published
          ? "Announcement published"
          : section === "memos" && values.published
            ? "Memo published"
            : "Content saved as a draft",
      );
      setValues({
        title: "",
        content: "",
        excerpt: "",
        url: "",
        caption: "",
        alt: "",
        category: "homepage",
        file: null,
        starts_at: "",
        ends_at: "",
        show_to_students: section === "memos",
        show_to_facilitators: false,
        cta_label: "",
        cta_url: "",
        published: false,
      });
      onSaved();
    }
  }

  return (
    <details className="rounded-lg border bg-muted/30 p-4">
      <summary className="cursor-pointer text-sm font-semibold text-brand">
        {labels[section as keyof typeof labels]}
      </summary>
      <form onSubmit={submit} className="mt-4 grid gap-3">
        {section === "media" ? (
          <>
            <select
              className={selectClass}
              value={values.category}
              onChange={(event) => setValues({ ...values, category: event.target.value })}
            >
              <option value="homepage">Homepage gallery</option>
              <option value="partners">Partners</option>
            </select>
            <Input
              type="url"
              required
              placeholder="Image or media URL"
              value={values.url}
              onChange={(e) => setValues({ ...values, url: e.target.value })}
            />
            <Input
              placeholder="Caption"
              value={values.caption}
              onChange={(e) => setValues({ ...values, caption: e.target.value })}
            />
            <Input
              placeholder="Accessible alt text"
              value={values.alt}
              onChange={(e) => setValues({ ...values, alt: e.target.value })}
            />
          </>
        ) : (
          <>
            <Input
              required
              placeholder={
                section === "articles"
                  ? "Article title"
                  : section === "memos"
                    ? "Memo title"
                    : "Announcement title"
              }
              value={values.title}
              onChange={(e) => setValues({ ...values, title: e.target.value })}
            />
            {section === "articles" && (
              <Input
                placeholder="Short excerpt"
                value={values.excerpt}
                onChange={(e) => setValues({ ...values, excerpt: e.target.value })}
              />
            )}
            <RichTextEditor
              required
              rows={section === "articles" ? 8 : 4}
              placeholder={section === "articles" ? "Article content" : "Announcement details"}
              value={values.content}
              onChange={(content) => setValues({ ...values, content })}
            />
            {(section === "announcements" || section === "memos") && (
              <>
                <label className="flex items-center gap-2 text-sm font-medium">
                  <input
                    type="checkbox"
                    checked={values.published}
                    onChange={(event) => setValues({ ...values, published: event.target.checked })}
                  />
                  {section === "memos" ? "Publish memo" : "Publish announcement"}
                </label>
                <label className="flex items-center gap-2 text-sm font-medium">
                  <input
                    type="checkbox"
                    checked={values.show_to_students}
                    onChange={(event) =>
                      setValues({ ...values, show_to_students: event.target.checked })
                    }
                  />
                  Show in student portal
                </label>
                {section === "memos" && (
                  <label className="flex items-center gap-2 text-sm font-medium">
                    <input
                      type="checkbox"
                      checked={values.show_to_facilitators}
                      onChange={(event) =>
                        setValues({ ...values, show_to_facilitators: event.target.checked })
                      }
                    />
                    Show in facilitator portal
                  </label>
                )}
                {section === "announcements" && (
                  <>
                    <Input
                      aria-label="Announcement call-to-action label"
                      placeholder="Button label (optional)"
                      value={values.cta_label}
                      onChange={(event) => setValues({ ...values, cta_label: event.target.value })}
                    />
                    <Input
                      type="url"
                      aria-label="Announcement call-to-action URL"
                      placeholder="Button link, e.g. https://example.com (optional)"
                      value={values.cta_url}
                      onChange={(event) => setValues({ ...values, cta_url: event.target.value })}
                    />
                  </>
                )}
                <label className="grid gap-1 text-sm font-medium sm:grid-cols-2">
                  Starts at
                  <Input
                    type="datetime-local"
                    value={values.starts_at}
                    onChange={(event) => setValues({ ...values, starts_at: event.target.value })}
                  />
                </label>
                <label className="grid gap-1 text-sm font-medium sm:grid-cols-2">
                  Ends at
                  <Input
                    type="datetime-local"
                    value={values.ends_at}
                    onChange={(event) => setValues({ ...values, ends_at: event.target.value })}
                  />
                </label>
              </>
            )}
            <ContentFileInput
              file={values.file}
              onFile={(file) => setValues({ ...values, file })}
              className="sm:col-span-2"
            />
            {section === "memos" && (
              <p className="text-xs text-muted-foreground">
                Attach a memo document; students and facilitators can download it from their portals
                when enabled above.
              </p>
            )}
          </>
        )}
        <Button disabled={saving}>
          {saving
            ? "Saving…"
            : (section === "announcements" || section === "memos") && values.published
              ? "Publish"
              : "Save draft"}
        </Button>
      </form>
    </details>
  );
}

function dateTimeLocalValue(value: unknown) {
  if (typeof value !== "string") return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function dateTimeIsoOrNull(value: string) {
  return value ? new Date(value).toISOString() : null;
}

function isSafeAnnouncementUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function RichTextEditor({
  value,
  onChange,
  ...textareaProps
}: {
  value: string;
  onChange: (value: string) => void;
} & Omit<React.ComponentProps<typeof Textarea>, "onChange" | "value">) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  function insertFormatting(format: "bold" | "italic" | "heading" | "list" | "link") {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = value.slice(start, end);
    let inserted = selected;
    if (format === "bold") inserted = `**${selected || "bold text"}**`;
    if (format === "italic") inserted = `*${selected || "italic text"}*`;
    if (format === "heading") inserted = `## ${selected || "Heading"}`;
    if (format === "list")
      inserted = (selected || "List item")
        .split("\n")
        .map((line) => `- ${line}`)
        .join("\n");
    if (format === "link") inserted = `[${selected || "link text"}](https://example.com)`;
    const next = `${value.slice(0, start)}${inserted}${value.slice(end)}`;
    onChange(next);
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(start + inserted.length, start + inserted.length);
    });
  }

  return (
    <div className="grid gap-2 sm:col-span-2">
      <div role="toolbar" aria-label="Text formatting" className="flex flex-wrap gap-1">
        {(
          [
            ["bold", "Bold"],
            ["italic", "Italic"],
            ["heading", "Heading"],
            ["list", "List"],
            ["link", "Link"],
          ] as const
        ).map(([format, label]) => (
          <Button
            key={format}
            type="button"
            size="sm"
            variant="outline"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => insertFormatting(format)}
          >
            {label}
          </Button>
        ))}
      </div>
      <Textarea
        {...textareaProps}
        ref={textareaRef}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      <span className="text-xs text-muted-foreground">
        Formatting is safe to publish. Use the toolbar or Markdown-style syntax.
      </span>
    </div>
  );
}

function ContentEditForm({
  section,
  record,
  onCancel,
  onSaved,
}: {
  section: "articles" | "announcements" | "memos";
  record: Record<string, unknown>;
  onCancel: () => void;
  onSaved: () => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [removeAttachment, setRemoveAttachment] = useState(false);
  const [values, setValues] = useState({
    title: String(record["title"] ?? ""),
    content: String(record[section === "articles" ? "content" : "body"] ?? ""),
    excerpt: String(record["excerpt"] ?? ""),
    published: section === "articles" ? record["status"] === "published" : !!record["published"],
    starts_at: dateTimeLocalValue(record["starts_at"]),
    ends_at: dateTimeLocalValue(record["ends_at"]),
    show_to_students: record["show_to_students"] === true,
    show_to_facilitators: record["show_to_facilitators"] === true,
    cta_label: String(record["cta_label"] ?? ""),
    cta_url: String(record["cta_url"] ?? ""),
  });

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const startsAt = dateTimeIsoOrNull(values.starts_at);
    const endsAt = dateTimeIsoOrNull(values.ends_at);
    if (
      section === "announcements" &&
      startsAt &&
      endsAt &&
      new Date(endsAt) < new Date(startsAt)
    ) {
      toast.error("The announcement end date must be after its start date.");
      return;
    }
    if (section === "announcements") {
      const hasCtaLabel = Boolean(values.cta_label.trim());
      const hasCtaUrl = Boolean(values.cta_url.trim());
      if (hasCtaLabel !== hasCtaUrl) {
        toast.error("Enter both a CTA button label and URL, or leave both blank.");
        return;
      }
      if (hasCtaUrl && !isSafeAnnouncementUrl(values.cta_url.trim())) {
        toast.error("Enter a valid HTTP or HTTPS link for the announcement button.");
        return;
      }
    }
    if (
      section === "memos" &&
      !file &&
      (removeAttachment || typeof record["attachment_url"] !== "string")
    ) {
      toast.error("A downloadable file is required for every memo.");
      return;
    }
    const contentType = file ? supportedContentType(file) : null;
    if (file && (!contentType || file.size > MAX_CONTENT_UPLOAD_SIZE)) {
      toast.error(
        !contentType
          ? "Choose a PDF, Word document, image, audio, or video file."
          : "Each file must be 100 MB or smaller.",
      );
      return;
    }

    setSaving(true);
    const previousUrl =
      typeof record["attachment_url"] === "string" ? record["attachment_url"] : null;
    const previousPath = storagePathFromPublicUrl(previousUrl);
    let uploadedPath: string | null = null;
    let attachmentUrl = removeAttachment ? null : previousUrl;
    let attachmentType = removeAttachment ? null : record["attachment_type"];
    let attachmentFileName = removeAttachment
      ? null
      : typeof record["attachment_file_name"] === "string"
        ? record["attachment_file_name"]
        : null;
    if (file && contentType) {
      uploadedPath = `content/${crypto.randomUUID()}-${safeUploadFileName(file.name)}`;
      const { error } = await supabase.storage.from("media").upload(uploadedPath, file, {
        contentType,
        upsert: false,
      });
      if (error) {
        setSaving(false);
        toast.error("Could not upload content file", {
          description: error.message,
        });
        return;
      }
      attachmentUrl = supabase.storage.from("media").getPublicUrl(uploadedPath).data.publicUrl;
      attachmentType = contentKind(contentType);
      attachmentFileName = file.name;
    }

    const result =
      section === "articles"
        ? await supabase
            .from("articles")
            .update({
              title: values.title.trim(),
              slug: values.title
                .trim()
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, "-")
                .replace(/^-|-$/g, ""),
              excerpt: values.excerpt.trim() || null,
              content: values.content.trim(),
              attachment_url: attachmentUrl,
              attachment_type: typeof attachmentType === "string" ? attachmentType : null,
              attachment_file_name: attachmentFileName,
              featured_image:
                attachmentType === "image"
                  ? attachmentUrl
                  : (removeAttachment || !!file) && record["attachment_type"] === "image"
                    ? null
                    : typeof record["featured_image"] === "string"
                      ? record["featured_image"]
                      : null,
            })
            .eq("id", String(record["id"]))
        : await supabase
            .from("announcements")
            .update({
              title: values.title.trim(),
              body: values.content.trim(),
              starts_at: startsAt,
              ends_at: endsAt,
              published: values.published,
              show_to_students: values.show_to_students,
              show_to_facilitators: section === "memos" && values.show_to_facilitators,
              cta_label: section === "announcements" ? values.cta_label.trim() || null : null,
              cta_url: section === "announcements" ? values.cta_url.trim() || null : null,
              show_public: true,
              show_on_homepage: true,
              attachment_url: attachmentUrl,
              attachment_type: typeof attachmentType === "string" ? attachmentType : null,
              attachment_file_name: attachmentFileName,
            })
            .eq("id", String(record["id"]));

    if (result.error) {
      if (uploadedPath) await supabase.storage.from("media").remove([uploadedPath]);
      setSaving(false);
      toast.error("Could not update content", {
        description: result.error.message,
      });
      return;
    }
    if ((file || removeAttachment) && previousPath)
      await supabase.storage.from("media").remove([previousPath]);
    setSaving(false);
    toast.success("Content updated");
    await onSaved();
  }

  return (
    <form onSubmit={submit} className="grid gap-3 rounded-lg border bg-card p-4">
      <Input
        required
        aria-label="Content title"
        value={values.title}
        onChange={(event) => setValues({ ...values, title: event.target.value })}
      />
      {section === "articles" && (
        <Input
          aria-label="Article excerpt"
          placeholder="Short excerpt"
          value={values.excerpt}
          onChange={(event) => setValues({ ...values, excerpt: event.target.value })}
        />
      )}
      <RichTextEditor
        required
        rows={section === "articles" ? 8 : 4}
        aria-label={section === "articles" ? "Article content" : "Announcement details"}
        value={values.content}
        onChange={(content) => setValues({ ...values, content })}
      />
      {(section === "announcements" || section === "memos") && (
        <>
          <label className="flex items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              checked={values.published}
              onChange={(event) => setValues({ ...values, published: event.target.checked })}
            />
            {section === "memos" ? "Publish memo" : "Publish announcement"}
          </label>
          <label className="flex items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              checked={values.show_to_students}
              onChange={(event) => setValues({ ...values, show_to_students: event.target.checked })}
            />
            Show in student portal
          </label>
          {section === "memos" && (
            <label className="flex items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                checked={values.show_to_facilitators}
                onChange={(event) =>
                  setValues({ ...values, show_to_facilitators: event.target.checked })
                }
              />
              Show in facilitator portal
            </label>
          )}
          {section === "announcements" && (
            <>
              <Input
                aria-label="Announcement call-to-action label"
                placeholder="Button label (optional)"
                value={values.cta_label}
                onChange={(event) => setValues({ ...values, cta_label: event.target.value })}
              />
              <Input
                type="url"
                aria-label="Announcement call-to-action URL"
                placeholder="Button link, e.g. https://example.com (optional)"
                value={values.cta_url}
                onChange={(event) => setValues({ ...values, cta_url: event.target.value })}
              />
            </>
          )}
          <label className="grid gap-1 text-sm font-medium">
            Starts at
            <Input
              type="datetime-local"
              value={values.starts_at}
              onChange={(event) => setValues({ ...values, starts_at: event.target.value })}
            />
          </label>
          <label className="grid gap-1 text-sm font-medium">
            Ends at
            <Input
              type="datetime-local"
              value={values.ends_at}
              onChange={(event) => setValues({ ...values, ends_at: event.target.value })}
            />
          </label>
        </>
      )}
      <ContentFileInput file={file} onFile={setFile} />
      {typeof record["attachment_file_name"] === "string" && (
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={removeAttachment}
            onChange={(event) => setRemoveAttachment(event.target.checked)}
          />
          Remove current attachment ({String(record["attachment_file_name"])})
        </label>
      )}
      <div className="flex gap-2">
        <Button disabled={saving}>{saving ? "Saving…" : "Save changes"}</Button>
        <Button type="button" variant="outline" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function ContentAttachmentDownload({ url, filename }: { url: string; filename: string }) {
  const [downloading, setDownloading] = useState(false);
  return (
    <Button
      type="button"
      size="sm"
      variant="link"
      disabled={downloading}
      onClick={async () => {
        setDownloading(true);
        try {
          await downloadContentAttachment(url, filename);
        } catch (error) {
          toast.error("Could not download attachment", {
            description: error instanceof Error ? error.message : undefined,
          });
        } finally {
          setDownloading(false);
        }
      }}
    >
      {downloading ? "Preparing…" : "Download"}
    </Button>
  );
}

function storagePathFromPublicUrl(value: unknown) {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    const prefix = "/storage/v1/object/public/media/";
    const position = url.pathname.indexOf(prefix);
    if (position === -1) return null;
    return decodeURIComponent(url.pathname.slice(position + prefix.length));
  } catch {
    return null;
  }
}
function ContentFileInput({
  file,
  onFile,
  className,
}: {
  file: File | null;
  onFile: (file: File | null) => void;
  className?: string;
}) {
  return (
    <label className={`grid gap-1.5 text-sm font-medium ${className ?? ""}`}>
      Attach a file (PDF, Word, image, audio, or video; up to 100 MB)
      <Input
        key={file?.name ?? "no-file"}
        type="file"
        accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.gif,.webp,.mp4,.m4v,.webm,.mov,.ogg,.oga,.mp3,.wav,.m4a,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/*,video/*,audio/*"
        onChange={(event) => {
          const selected = event.target.files?.[0] ?? null;
          if (selected && selected.size > MAX_CONTENT_UPLOAD_SIZE) {
            toast.error("Each file must be 100 MB or smaller.");
            event.target.value = "";
            onFile(null);
            return;
          }
          if (selected && !supportedContentType(selected)) {
            toast.error("Choose a PDF, Word document, image, audio, or video file.");
            event.target.value = "";
            onFile(null);
            return;
          }
          onFile(selected);
        }}
      />
      {file && (
        <span className="text-xs font-normal text-muted-foreground">
          Selected: {file.name} ({(file.size / (1024 * 1024)).toFixed(1)} MB)
        </span>
      )}
    </label>
  );
}

function ReportCard({ title, rows }: { title: string; rows: string[] }) {
  return (
    <section className="rounded-xl border bg-card p-5 shadow-card">
      <h3 className="font-semibold text-brand">{title}</h3>
      <ul className="mt-3 space-y-2">
        {rows.length ? (
          rows.map((row) => (
            <li key={row} className="border-b pb-2 text-sm text-muted-foreground last:border-0">
              {row}
            </li>
          ))
        ) : (
          <li className="text-sm text-muted-foreground">No records yet</li>
        )}
      </ul>
    </section>
  );
}

function FullPageMessage({
  title,
  detail,
  retry,
}: {
  title: string;
  detail?: string;
  retry?: () => void;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <section className="w-full max-w-lg rounded-xl border bg-card p-6 shadow-card">
        <h1 className="text-xl font-bold text-brand">{title}</h1>
        {detail && (
          <p role="alert" className="mt-3 text-sm text-destructive">
            {detail}
          </p>
        )}
        {retry && (
          <Button variant="outline" className="mt-4" onClick={retry}>
            Retry
          </Button>
        )}
      </section>
    </div>
  );
}
function LoadingState() {
  return (
    <div role="status" aria-label="Loading workspace data" className="space-y-4">
      <span className="sr-only">Loading workspace data…</span>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="loading-shimmer h-28 rounded-xl" />
        <div className="loading-shimmer h-28 rounded-xl" />
        <div className="loading-shimmer h-28 rounded-xl" />
        <div className="loading-shimmer h-28 rounded-xl" />
      </div>
      <div className="loading-shimmer h-64 rounded-xl" />
    </div>
  );
}

function ApplicationDocumentDownload({ document }: { document: Tables<"application_documents"> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function download() {
    setBusy(true);
    setError("");
    const { data, error: signedUrlError } = await supabase.storage
      .from("application-docs")
      .createSignedUrl(document.file_path, 60, {
        download: document.file_name || true,
      });
    setBusy(false);
    if (signedUrlError) {
      setError(signedUrlError.message);
      return;
    }
    window.location.assign(data.signedUrl);
  }

  return (
    <div className="mt-1 flex flex-wrap items-center gap-2 text-sm">
      <span className="text-muted-foreground">
        {document.doc_type}: {document.file_name ?? "Uploaded document"}
      </span>
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={busy}
        onClick={() => void download()}
      >
        {busy ? "Preparing…" : "Download"}
      </Button>
      {error && (
        <span role="alert" className="text-xs text-destructive">
          Could not download: {error}
        </span>
      )}
    </div>
  );
}

type StudentDocumentRow = Pick<
  Tables<"student_documents">,
  "id" | "student_id" | "document_type" | "file_name" | "file_path" | "created_at"
>;

function StudentDocumentUpload({
  studentId,
  userId,
  documents,
  onUploaded,
}: {
  studentId: string;
  userId: string;
  documents: StudentDocumentRow[];
  onUploaded: () => void;
}) {
  const [documentType, setDocumentType] = useState("KCSE certificate");
  const [busy, setBusy] = useState(false);

  async function upload(event: React.ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Student documents must be 5 MB or smaller.");
      return;
    }
    const extension = file.name.split(".").pop()?.toLowerCase();
    const mime = ["application/pdf", "image/jpeg", "image/png"].includes(file.type)
      ? file.type
      : extension === "pdf"
        ? "application/pdf"
        : extension === "jpg" || extension === "jpeg"
          ? "image/jpeg"
          : extension === "png"
            ? "image/png"
            : "";
    if (!["application/pdf", "image/jpeg", "image/png"].includes(mime)) {
      toast.error("Upload a PDF, JPG, or PNG document.");
      return;
    }

    setBusy(true);
    const filePath = `${studentId}/${crypto.randomUUID()}-${safeUploadFileName(file.name)}`;
    const { error: uploadError } = await supabase.storage
      .from("student-documents")
      .upload(filePath, file, { contentType: mime, upsert: false });
    if (uploadError) {
      setBusy(false);
      toast.error("Could not upload student document", { description: uploadError.message });
      return;
    }

    const { error: metadataError } = await supabase.from("student_documents").insert({
      student_id: studentId,
      document_type: documentType,
      file_name: file.name,
      file_path: filePath,
      uploaded_by: userId,
    });
    setBusy(false);
    if (metadataError) {
      const { error: cleanupError } = await supabase.storage
        .from("student-documents")
        .remove([filePath]);
      if (cleanupError)
        console.error("Could not clean up unlinked student document:", cleanupError.message);
      toast.error("Could not save student document", { description: metadataError.message });
      return;
    }
    toast.success("Student document uploaded");
    onUploaded();
  }

  return (
    <div className="mt-3 space-y-2">
      {!documents.length && (
        <p className="text-xs text-muted-foreground">No student documents uploaded.</p>
      )}
      {documents.map((document) => (
        <StudentDocumentDownload key={document.id} document={document} />
      ))}
      <div className="flex flex-col gap-2 sm:flex-row">
        <select
          aria-label="Student document type"
          className={selectClass}
          value={documentType}
          onChange={(event) => setDocumentType(event.target.value)}
          disabled={busy}
        >
          <option>KCSE certificate</option>
          <option>KCPE certificate</option>
          <option>Other certificate</option>
          <option>Birth certificate</option>
          <option>ID or passport</option>
        </select>
        <Input
          aria-label="Upload student document"
          type="file"
          accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
          disabled={busy}
          onChange={(event) => void upload(event)}
        />
      </div>
      {busy && <p className="text-xs text-muted-foreground">Uploading document…</p>}
      <p className="text-xs text-muted-foreground">
        PDF, JPG, or PNG · up to 5 MB per file. Uploading again keeps previous versions.
      </p>
    </div>
  );
}

function StudentDocumentDownload({ document }: { document: StudentDocumentRow }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function download() {
    setBusy(true);
    setError("");
    const { data, error: signedUrlError } = await supabase.storage
      .from("student-documents")
      .createSignedUrl(document.file_path, 60, { download: document.file_name });
    setBusy(false);
    if (signedUrlError) {
      setError(signedUrlError.message);
      return;
    }
    window.location.assign(data.signedUrl);
  }

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="text-muted-foreground">
        {document.document_type}: {document.file_name}
      </span>
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={busy}
        onClick={() => void download()}
      >
        {busy ? "Preparing…" : "Download"}
      </Button>
      {error && (
        <span role="alert" className="text-xs text-destructive">
          Could not download: {error}
        </span>
      )}
    </div>
  );
}

function AdminCourseFile({ path }: { path: string }) {
  const fileQuery = useQuery({
    queryKey: ["admin", "course-file-url", path],
    queryFn: async () => {
      const { data, error } = await supabase.storage.from("learning").createSignedUrl(path, 300);
      if (error) throw error;
      return data.signedUrl;
    },
    staleTime: 4 * 60_000,
  });
  if (fileQuery.error)
    return (
      <button
        type="button"
        className="text-xs text-destructive underline"
        onClick={() => void fileQuery.refetch()}
      >
        Retry attachment
      </button>
    );
  if (fileQuery.isLoading) return <span className="text-xs text-muted-foreground">Preparing…</span>;
  return (
    <a
      className="text-sm font-medium text-primary underline"
      href={fileQuery.data}
      target="_blank"
      rel="noreferrer"
    >
      Open attachment
    </a>
  );
}

function ErrorPanel({ error, retry }: { error: Error; retry: () => void }) {
  return (
    <section className="rounded-xl border border-destructive/30 bg-card p-5">
      <p role="alert" className="text-sm text-destructive">
        {error.message}
      </p>
      <Button variant="outline" className="mt-3" onClick={retry}>
        Retry
      </Button>
    </section>
  );
}
function ErrorBanner({ message }: { message: string }) {
  return (
    <p
      role="alert"
      className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
    >
      {message}
    </p>
  );
}
function EmptyPanel({ title, detail }: { title: string; detail: string }) {
  return (
    <section className="rounded-xl border border-dashed bg-card p-8 text-center">
      <p className="font-semibold text-brand">{title}</p>
      <p className="mt-1 text-sm text-muted-foreground">{detail}</p>
    </section>
  );
}
const selectClass = "h-9 rounded-md border border-input bg-background px-3 text-sm";
function statusLabel(status: string) {
  return status.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}
function relationName(value: unknown): string {
  if (Array.isArray(value)) return relationName(value[0]);
  if (value && typeof value === "object" && "title" in value) return String(value.title);
  if (value && typeof value === "object" && "name" in value) return String(value.name);
  return value && typeof value === "object" ? "Assigned" : "Not assigned";
}
function countBy<T>(items: T[], key: (item: T) => string) {
  return items.reduce<Record<string, number>>((counts, item) => {
    const name = key(item);
    counts[name] = (counts[name] ?? 0) + 1;
    return counts;
  }, {});
}
function formatValue(value: unknown) {
  if (value === null || value === undefined) return "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}
function feeStudentLabel(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "Unknown student";
  const student = value as {
    student_number?: unknown;
    first_name?: unknown;
    middle_name?: unknown;
    last_name?: unknown;
  };
  const name = [student.first_name, student.middle_name, student.last_name]
    .filter((part): part is string => typeof part === "string" && part.trim().length > 0)
    .join(" ");
  const admissionNumber =
    typeof student.student_number === "string" ? student.student_number : "No admission number";
  return `${admissionNumber} · ${name || "Name unavailable"}`;
}
function directoryExportRows(section: DashboardSection, rows: Record<string, unknown>[]) {
  if (section === "results") {
    return rows.map((row) => {
      const student =
        row["student"] && typeof row["student"] === "object" && !Array.isArray(row["student"])
          ? (row["student"] as Record<string, unknown>)
          : {};
      const studentName = [student["first_name"], student["middle_name"], student["last_name"]]
        .filter((part): part is string => typeof part === "string" && part.trim().length > 0)
        .join(" ");
      const unit = relationName(row["unit"]);
      return {
        "Student Number": student["student_number"] ?? "Not assigned",
        "Student Name": studentName || "Name unavailable",
        Unit: unit === "Not assigned" ? row["unit_name"] : unit,
        Score: row["score"],
        Grade: row["grade"],
        Semester: row["semester"],
        "Academic Year": row["academic_year"],
        Published: row["published"],
        "Recorded On": row["created_at"],
      };
    });
  }
  if (section === "assignments") {
    return rows.map((row) => ({
      Assignment: row["title"],
      Course: relationName(row["course"]),
      Unit: relationName(row["unit"]),
      Instructions: row["instructions"],
      "Due Date": row["due_date"],
      Published: row["published"],
      "Created On": row["created_at"],
    }));
  }
  if (section === "fees") {
    return rows.map((row) => ({
      ...Object.fromEntries(Object.entries(row).filter(([key]) => key !== "student")),
      Student: feeStudentLabel(row["student"]),
    }));
  }
  return rows;
}
function exportCsv(fileName: string, rows: readonly object[]) {
  if (!rows.length) {
    toast.error("There are no records to export.");
    return;
  }
  const safeRows = sanitizeExportRows(rows);
  const columns = [...new Set(safeRows.flatMap((row) => Object.keys(row)))];
  const escape = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  const csv = [
    columns.map((column) => escape(exportColumnLabel(column))).join(","),
    ...safeRows.map((record) => {
      return columns
        .map((column) =>
          escape(
            typeof record[column] === "object" ? JSON.stringify(record[column]) : record[column],
          ),
        )
        .join(",");
    }),
  ].join("\r\n");
  const url = URL.createObjectURL(new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}
function exportExcel(fileName: string, rows: readonly object[]) {
  if (!rows.length) {
    toast.error("There are no records to export.");
    return;
  }
  try {
    const workbook = createExcelWorkbook(rows);
    const url = URL.createObjectURL(
      new Blob([new Uint8Array(workbook)], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName.replace(/\.csv$/i, ".xlsx");
    link.click();
    URL.revokeObjectURL(url);
  } catch (error) {
    toast.error("Could not export Excel workbook", {
      description: error instanceof Error ? error.message : String(error),
    });
  }
}
