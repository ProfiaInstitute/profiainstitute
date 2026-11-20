import { useState, type FormEvent } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  CheckCircle2,
  Clock3,
  ChevronDown,
  ExternalLink,
  GraduationCap,
  MapPin,
  MessageCircle,
  Newspaper,
  Phone,
  Send,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  CardGridSkeleton,
  EmptyState,
  ErrorNote,
  FaqSection,
  PageHero,
  SectionTitle,
} from "@/components/site/common";
import { FeeStructureActions } from "@/components/site/FeeStructureActions";
import { supabase } from "@/integrations/supabase/client";
import { getYouTubeEmbedUrl, renderContentMarkup } from "@/lib/content-format";
import { downloadContentAttachment } from "@/lib/content-download";
import type { Tables } from "@/integrations/supabase/types";
import type { Json } from "@/integrations/supabase/types";
import {
  FACILITY_LOCATION,
  SCHOOL_ROUTES,
  useActiveIntake,
  useCourses,
  useGeneral,
  useSchools,
  useSetting,
  whatsappLink,
} from "@/lib/site";

export function AcademicsPage() {
  const schools = useSchools();
  const courses = useCourses();
  const activeIntake = useActiveIntake();
  const courseCounts = new Map<string, number>();
  for (const course of courses.data ?? [])
    courseCounts.set(course.school_id, (courseCounts.get(course.school_id) ?? 0) + 1);
  return (
    <>
      <PageHero
        title="TVET & KASNEB Courses in Homa Bay"
        subtitle="Explore technical and vocational training and KASNEB programmes at Profia Institute, an approved KASNEB examination centre in Homa Bay. Browse published courses and contact admissions for details."
        eyebrow="Academics · Homa Bay, Kenya"
      />
      <section className="container-site py-12">
        {activeIntake.data && (
          <div className="mb-8 rounded-xl border border-primary/30 bg-cream p-4 text-sm text-brand">
            <span className="font-semibold">{activeIntake.data.name} is open.</span>
            {activeIntake.data.application_deadline && (
              <> Apply by {formatDate(activeIntake.data.application_deadline)}.</>
            )}
          </div>
        )}
        <SectionTitle
          title="Schools of study"
          subtitle="Browse the schools and their currently published courses."
        />
        {schools.isLoading ? (
          <CardGridSkeleton n={5} />
        ) : schools.error ? (
          <ErrorNote />
        ) : schools.data?.length ? (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {schools.data.map((school) => (
              <article
                key={school.id}
                className="overflow-hidden rounded-xl border bg-card shadow-card"
              >
                {school.hero_image ? (
                  <img
                    src={school.hero_image}
                    alt={school.name}
                    className="h-48 w-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div className="flex h-48 items-center justify-center bg-cream text-primary">
                    <GraduationCap className="h-12 w-12" />
                  </div>
                )}
                <div className="p-5">
                  <h2 className="text-xl font-bold text-brand">{school.name}</h2>
                  {school.description && (
                    <p className="mt-2 line-clamp-3 text-sm text-muted-foreground">
                      {school.description}
                    </p>
                  )}
                  <p className="mt-3 text-sm font-medium text-primary">
                    {courseCounts.get(school.id) ?? 0} courses
                  </p>
                  <Link
                    className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-brand hover:text-primary"
                    to={SCHOOL_ROUTES[school.slug] ?? "/academics"}
                  >
                    Explore school <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <EmptyState
            title="School information is being updated"
            text="Contact admissions for information about current programmes."
            action={
              <Button asChild>
                <Link to="/contact">Contact admissions</Link>
              </Button>
            }
          />
        )}
      </section>
      <section className="bg-muted/40 py-12">
        <div className="container-site">
          <SectionTitle
            title="Our Courses"
            subtitle="See programme details and begin an application."
          />
          {courses.isLoading ? (
            <CardGridSkeleton n={5} />
          ) : courses.error ? (
            <ErrorNote />
          ) : courses.data?.length ? (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {courses.data.map((course) => (
                <article key={course.id} className="rounded-xl border bg-card p-5 shadow-card">
                  <p className="text-xs font-semibold uppercase tracking-wide text-primary">
                    {schools.data?.find((school) => school.id === course.school_id)?.name}
                  </p>
                  <h3 className="mt-2 text-lg font-bold text-brand">{course.title}</h3>
                  {course.summary && (
                    <p className="mt-2 text-sm text-muted-foreground">{course.summary}</p>
                  )}
                  <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
                    {course.duration && (
                      <span className="inline-flex items-center gap-1">
                        <Clock3 className="h-3.5 w-3.5" />
                        {course.duration}
                      </span>
                    )}
                    {course.study_mode && <span>{course.study_mode.replace("_", " ")}</span>}
                  </div>
                  {course.requirements && (
                    <p className="mt-3 text-sm">
                      <strong>Requirements:</strong> {course.requirements}
                    </p>
                  )}
                  {course.application_enabled !== false ? (
                    <CourseLevelsDetails courseId={course.id} />
                  ) : (
                    <p className="mt-4 text-sm font-medium text-muted-foreground">
                      Applications are currently closed.
                    </p>
                  )}
                </article>
              ))}
            </div>
          ) : (
            <EmptyState
              title="No courses published yet"
              text="Check back later or contact admissions."
            />
          )}
        </div>
      </section>
      <SchoolFeeStructures schools={schools.data ?? []} />
    </>
  );
}

function SchoolFeeStructures({ schools }: { schools: Array<{ id: string; name: string }> }) {
  const [selectedSchoolId, setSelectedSchoolId] = useState("");
  const selectedSchool = schools.find((school) => school.id === selectedSchoolId) ?? schools[0];
  const feeStructures = useQuery({
    queryKey: ["school-fee-structures", selectedSchool?.id],
    enabled: Boolean(selectedSchool?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("school_fee_structures")
        .select("id,title,description,file_path,file_name")
        .eq("school_id", selectedSchool!.id)
        .eq("published", true)
        .order("sort_order")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  if (!schools.length) return null;

  return (
    <section className="container-site py-12">
      <SectionTitle
        title="School Fee Structures"
        subtitle="Choose a school to view and download its published fee schedules."
      />
      <div className="mb-6 flex flex-wrap gap-2" role="tablist" aria-label="Schools">
        {schools.map((school) => (
          <button
            key={school.id}
            type="button"
            role="tab"
            id={`school-fee-tab-${school.id}`}
            aria-selected={selectedSchool?.id === school.id}
            aria-controls="school-fee-panel"
            onClick={() => setSelectedSchoolId(school.id)}
            className={`rounded-full border px-4 py-2 text-sm font-medium transition-colors ${
              selectedSchool?.id === school.id
                ? "border-primary bg-primary text-primary-foreground"
                : "bg-card text-foreground hover:border-primary"
            }`}
          >
            {school.name}
          </button>
        ))}
      </div>
      <div
        id="school-fee-panel"
        role="tabpanel"
        aria-labelledby={selectedSchool ? `school-fee-tab-${selectedSchool.id}` : undefined}
      >
        {feeStructures.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading fee structures…</p>
        ) : feeStructures.error ? (
          <p role="alert" className="text-sm text-destructive">
            Could not load fee structures: {feeStructures.error.message}
          </p>
        ) : feeStructures.data?.length ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {feeStructures.data.map((feeStructure) => (
              <article key={feeStructure.id} className="rounded-xl border bg-card p-5 shadow-card">
                <h3 className="font-semibold text-brand">{feeStructure.title}</h3>
                {feeStructure.description && (
                  <p className="mt-2 text-sm text-muted-foreground">{feeStructure.description}</p>
                )}
                <div className="mt-4">
                  <FeeStructureActions
                    path={feeStructure.file_path}
                    filename={feeStructure.file_name}
                    title={feeStructure.title}
                  />
                </div>
              </article>
            ))}
          </div>
        ) : (
          <p className="rounded-xl border bg-card p-5 text-sm text-muted-foreground">
            No fee structures have been published for {selectedSchool?.name} yet.
          </p>
        )}
      </div>
    </section>
  );
}

function CourseLevelsDetails({ courseId }: { courseId: string }) {
  const levels = useQuery({
    queryKey: ["course-levels", courseId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("course_levels")
        .select("id,name,code,description")
        .eq("course_id", courseId)
        .eq("published", true)
        .order("sort_order")
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  if (levels.isLoading) {
    return <p className="mt-4 text-sm text-muted-foreground">Loading course levels…</p>;
  }
  if (levels.error) {
    return (
      <p role="alert" className="mt-4 text-sm text-destructive">
        Could not load course levels: {levels.error.message}
      </p>
    );
  }
  if (!levels.data?.length) {
    return (
      <p className="mt-4 text-sm text-muted-foreground">
        Level details are being updated. Contact admissions for help applying.
      </p>
    );
  }

  return (
    <div className="mt-4 space-y-3">
      {levels.data.map((level) => (
        <CourseLevelDetails key={level.id} courseId={courseId} level={level} />
      ))}
    </div>
  );
}

function CourseLevelDetails({
  courseId,
  level,
}: {
  courseId: string;
  level: {
    id: string;
    name: string;
    code: string | null;
    description: string | null;
  };
}) {
  const [open, setOpen] = useState(false);
  const units = useQuery({
    queryKey: ["course-level-units", level.id],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("course_units")
        .select("id,code,title,semester")
        .eq("level_id", level.id)
        .order("sort_order")
        .order("title");
      if (error) throw error;
      return data;
    },
  });
  return (
    <details
      className="rounded-lg border bg-background"
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-3">
        <span>
          <span className="block font-semibold text-brand">
            {level.name}
            {level.code ? ` · ${level.code}` : ""}
          </span>
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
      </summary>
      <div className="border-t px-3 pb-3 pt-3">
        {level.description && <p className="text-sm text-muted-foreground">{level.description}</p>}
        {units.isLoading ? (
          <p className="mt-3 text-sm text-muted-foreground">Loading units…</p>
        ) : units.error ? (
          <p role="alert" className="mt-3 text-sm text-destructive">
            {units.error.message}
          </p>
        ) : units.data?.length ? (
          <ul className="mt-3 space-y-2 text-sm">
            {units.data.map((unit) => (
              <li key={unit.id}>
                {unit.code && <strong>{unit.code} · </strong>}
                {unit.title}
                {unit.semester && <span className="text-muted-foreground"> · {unit.semester}</span>}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">Units will be shared by the school.</p>
        )}
        <div className="mt-4">
          <Button asChild size="sm">
            <Link to="/admission" search={{ course: courseId, level: level.id }}>
              Apply for this level
            </Link>
          </Button>
        </div>
      </div>
    </details>
  );
}

export function OnlineCoursesPage() {
  const schools = useSchools();
  const coursesQuery = useQuery({
    queryKey: ["public-online-courses"],
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: "always",
    queryFn: async () => {
      const { data, error } = await supabase
        .from("courses")
        .select("*")
        .eq("published", true)
        .eq("available_online", true)
        .order("sort_order");
      if (error) throw error;
      return data;
    },
  });
  return (
    <>
      <PageHero
        title="Online Courses"
        subtitle="Explore Profia programmes available for online study. Course availability is managed by the Institute."
        eyebrow="Flexible learning"
      />
      <section className="container-site py-12">
        {coursesQuery.isLoading && <CardGridSkeleton />}
        {coursesQuery.error && <ErrorNote />}
        {!coursesQuery.isLoading && !coursesQuery.error && coursesQuery.data?.length ? (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {coursesQuery.data.map((course) => (
              <OnlineCourseCard
                key={course.id}
                course={course}
                schoolName={
                  schools.data?.find((school) => school.id === course.school_id)?.name ??
                  "Profia Institute"
                }
              />
            ))}
          </div>
        ) : (
          !coursesQuery.isLoading &&
          !coursesQuery.error && (
            <EmptyState
              title="No online courses are currently listed"
              text="Contact admissions to discuss the study options available for a course."
              action={
                <Button asChild>
                  <Link to="/contact">Ask admissions</Link>
                </Button>
              }
            />
          )
        )}
      </section>
    </>
  );
}

function OnlineCourseCard({
  course,
  schoolName,
}: {
  course: Tables<"courses">;
  schoolName: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const lessonsQuery = useQuery({
    queryKey: ["public-online-course-lessons", course.id],
    enabled: expanded,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("list_online_course_lessons", {
        _course_id: course.id,
      });
      if (error) throw error;
      return data;
    },
  });

  return (
    <article className="overflow-hidden rounded-xl border bg-card shadow-card">
      {course.image_url && (
        <img
          src={course.image_url}
          alt={course.title}
          className="h-44 w-full object-cover"
          loading="lazy"
        />
      )}
      <div className="space-y-3 p-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-primary">{schoolName}</p>
        <h2 className="text-lg font-bold text-brand">{course.title}</h2>
        {course.description && (
          <p className="line-clamp-4 text-sm text-muted-foreground">{course.description}</p>
        )}
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
          {course.duration && <span>Duration: {course.duration}</span>}
          {course.online_lecturer_name && <span>Lecturer: {course.online_lecturer_name}</span>}
          {course.online_lecturer_email && (
            <a
              className="text-primary hover:underline"
              href={`mailto:${course.online_lecturer_email}`}
            >
              {course.online_lecturer_email}
            </a>
          )}
          {course.online_lecturer_phone && (
            <a
              className="text-primary hover:underline"
              href={`tel:${course.online_lecturer_phone}`}
            >
              {course.online_lecturer_phone}
            </a>
          )}
        </div>
        {course.online_intro_video_url && (
          <a
            className="inline-block text-sm font-medium text-primary hover:underline"
            href={course.online_intro_video_url}
            target="_blank"
            rel="noreferrer"
          >
            Watch free introduction video ↗
          </a>
        )}
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => setExpanded((value) => !value)}>
            {expanded ? "Hide course details" : "View course & free outline"}
          </Button>
          <Button asChild size="sm">
            <Link to="/student" search={{ course: course.id }}>
              Enroll & start learning
            </Link>
          </Button>
        </div>
        {expanded && (
          <div className="space-y-3 border-t pt-3">
            {course.online_syllabus && (
              <div>
                <h3 className="font-semibold text-brand">Syllabus</h3>
                <p className="whitespace-pre-line text-sm text-muted-foreground">
                  {course.online_syllabus}
                </p>
              </div>
            )}
            <div>
              <h3 className="font-semibold text-brand">Course outline</h3>
              {lessonsQuery.isLoading ? (
                <p className="text-sm text-muted-foreground">Loading outline…</p>
              ) : lessonsQuery.error ? (
                <p role="alert" className="text-sm text-destructive">
                  Could not load course outline: {lessonsQuery.error.message}
                </p>
              ) : lessonsQuery.data?.length ? (
                <ol className="mt-2 space-y-2">
                  {lessonsQuery.data.map((lesson, index) => (
                    <li key={lesson.id} className="rounded-lg bg-muted/50 p-3 text-sm">
                      <p className="font-medium">
                        {index + 1}. {lesson.title}
                        {lesson.is_preview && (
                          <span className="ml-2 text-xs font-normal text-primary">
                            Free preview
                          </span>
                        )}
                        {lesson.locked && (
                          <span className="ml-2 text-xs font-normal text-muted-foreground">
                            Available after enrollment
                          </span>
                        )}
                      </p>
                      {lesson.description && (
                        <p className="mt-1 text-muted-foreground">{lesson.description}</p>
                      )}
                      {lesson.is_preview && lesson.notes && (
                        <p className="mt-2 whitespace-pre-line text-muted-foreground">
                          {lesson.notes}
                        </p>
                      )}
                      {lesson.is_preview && lesson.video_url && (
                        <a
                          className="mt-2 inline-block font-medium text-primary hover:underline"
                          href={lesson.video_url}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Watch free lesson video ↗
                        </a>
                      )}
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="mt-1 text-sm text-muted-foreground">
                  Course outline is being prepared.
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </article>
  );
}

export function AboutPage() {
  const general = useGeneral();
  const about = useSetting<{
    intro?: string;
    mission?: string;
    vision?: string;
    core_values?: string[];
    accreditation?: string;
    history?: string;
  }>("content.about", {});
  const schools = useSchools();
  return (
    <>
      <PageHero
        title={`About ${general.institution_name}`}
        subtitle={
          about.intro ??
          "Profia Institute is a TVET college in Homa Bay. Explore our schools and programmes, or contact the Institute for current admissions information."
        }
        eyebrow={general.tagline ?? "Institute of Professionals"}
      />
      <section className="container-site grid gap-6 py-12 md:grid-cols-2">
        {about.mission && <AboutCopyCard title="Our mission" text={about.mission} />}
        {about.vision && <AboutCopyCard title="Our vision" text={about.vision} />}
        {about.history && <AboutCopyCard title="Our story" text={about.history} />}
        {about.accreditation && <InfoCard title="Accreditation" text={about.accreditation} />}
        {!!about.core_values?.length && (
          <section className="rounded-xl border bg-card p-6 shadow-card md:col-span-2">
            <h2 className="text-xl font-bold text-brand">Our core values</h2>
            <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {about.core_values.map((value) => (
                <li key={value} className="flex items-start gap-2 text-sm">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  {value}
                </li>
              ))}
            </ul>
          </section>
        )}
      </section>
      <section className="bg-muted/40 py-12">
        <div className="container-site">
          <SectionTitle
            title="A place to grow professionally"
            subtitle="Explore current schools and published programmes."
          />
          {schools.isLoading ? (
            <CardGridSkeleton n={5} />
          ) : schools.error ? (
            <ErrorNote />
          ) : schools.data?.length ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {schools.data.map((school) => (
                <Link
                  key={school.id}
                  to={SCHOOL_ROUTES[school.slug] ?? "/academics"}
                  className="rounded-xl border bg-card p-5 shadow-card hover:border-primary"
                >
                  <h3 className="font-bold text-brand">{school.name}</h3>
                  {school.description && (
                    <p className="mt-2 line-clamp-3 text-sm text-muted-foreground">
                      {school.description}
                    </p>
                  )}
                </Link>
              ))}
            </div>
          ) : (
            <EmptyState
              title="School information is being updated"
              text="Contact the Institute for current programme information."
            />
          )}
        </div>
      </section>
    </>
  );
}

function AboutCopyCard({ title, text }: { title: string; text: string }) {
  return (
    <article
      tabIndex={0}
      className="group rounded-xl border bg-card p-5 shadow-card outline-none transition duration-300 hover:-translate-y-1 hover:border-primary/50 hover:shadow-lift focus-visible:-translate-y-1 focus-visible:border-primary/50 focus-visible:shadow-lift"
    >
      <h2 className="font-semibold text-brand">{title}</h2>
      <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground transition-[max-height] duration-300 md:max-h-[4.5rem] md:overflow-hidden md:group-hover:max-h-[32rem] md:group-focus-within:max-h-[32rem]">
        {text}
      </p>
      <span className="mt-2 block text-xs font-semibold text-primary md:group-hover:hidden md:group-focus-within:hidden">
        Hover or focus to read more
      </span>
    </article>
  );
}

export function TechHubPage() {
  const hub = useSetting<{
    intro?: string;
    focus_areas?: string[];
    course_ids?: string[];
    image?: string;
  }>("content.tech_hub", {
    focus_areas: [
      "Artificial Intelligence",
      "Data Categorization",
      "3D & 2D Data Annotation",
      "Training Data for Autonomous Driving",
      "Natural Language Processing",
      "Video Annotation",
    ],
  });
  const courses = useCourses();
  const hubCourses =
    courses.data?.filter(
      (course) => hub.course_ids?.includes(course.id) || course.available_online,
    ) ?? [];
  return (
    <>
      <PageHero
        title="Profia Tech Hub"
        subtitle={
          hub.intro ??
          "Explore technology and digital learning opportunities at Profia Institute. Contact us for current programme availability and training details."
        }
        image={hub.image ?? null}
        eyebrow="Technology & digital skills"
      />
      {!!hub.focus_areas?.length && (
        <section className="container-site py-12">
          <SectionTitle
            title="Areas of focus"
            subtitle="The Tech Hub content can be updated by the Institute administrators."
          />
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {hub.focus_areas.map((area) => (
              <li
                key={area}
                className="flex items-start gap-3 rounded-xl border bg-card p-5 shadow-card"
              >
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                <span className="font-medium text-brand">{area}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      <section className="bg-muted/40 py-12">
        <div className="container-site">
          <SectionTitle
            title="Related programmes"
            subtitle="Published online and technology courses."
          />
          {courses.isLoading ? (
            <CardGridSkeleton n={3} />
          ) : courses.error ? (
            <ErrorNote />
          ) : hubCourses.length ? (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {hubCourses.map((course) => (
                <article key={course.id} className="rounded-xl border bg-card p-5 shadow-card">
                  <h3 className="font-bold text-brand">{course.title}</h3>
                  {course.summary && (
                    <p className="mt-2 text-sm text-muted-foreground">{course.summary}</p>
                  )}
                  {course.application_enabled !== false ? (
                    <Button asChild size="sm" className="mt-4">
                      <Link to="/admission" search={{ course: course.id }}>
                        Apply now
                      </Link>
                    </Button>
                  ) : (
                    <p className="mt-4 text-sm font-medium text-muted-foreground">
                      Applications are currently closed.
                    </p>
                  )}
                </article>
              ))}
            </div>
          ) : (
            <EmptyState
              title="No related courses listed"
              text="Contact Profia Institute for current Tech Hub training options."
              action={
                <Button asChild>
                  <Link to="/contact">Contact the Tech Hub</Link>
                </Button>
              }
            />
          )}
        </div>
      </section>
    </>
  );
}

export function AnnouncementsPage() {
  const query = useQuery({
    queryKey: ["public-announcements"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("announcements")
        .select(
          "id,title,body,category,created_at,starts_at,ends_at,attachment_url,attachment_type",
        )
        .eq("published", true)
        .order("created_at", { ascending: false });
      if (error) throw error;
      const now = Date.now();
      return (data ?? []).filter(
        (item) =>
          (!item.starts_at || new Date(item.starts_at).getTime() <= now) &&
          (!item.ends_at || new Date(item.ends_at).getTime() >= now),
      );
    },
  });
  return (
    <>
      <PageHero
        title="Announcements"
        subtitle="Official updates and notices from Profia Institute."
        eyebrow="News & notices"
      />
      <section className="container-site py-12">
        {query.isLoading ? (
          <CardGridSkeleton n={3} />
        ) : query.error ? (
          <ErrorNote />
        ) : query.data?.length ? (
          <div className="mx-auto max-w-4xl space-y-4">
            {query.data.map((item) => (
              <article key={item.id} className="rounded-xl border bg-card p-5 shadow-card">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wide text-primary">
                    {item.category}
                  </span>
                  <time className="text-xs text-muted-foreground">
                    {new Date(item.created_at).toLocaleDateString("en-KE", { dateStyle: "medium" })}
                  </time>
                </div>
                <h2 className="mt-2 text-xl font-bold text-brand">{item.title}</h2>
                <div
                  className="prose-profia mt-3 text-sm leading-relaxed text-muted-foreground"
                  dangerouslySetInnerHTML={{ __html: renderContentMarkup(item.body) }}
                />
                {item.attachment_url && (
                  <PublicAttachment
                    url={item.attachment_url}
                    type={item.attachment_type}
                    filename={null}
                    label={item.title}
                  />
                )}
              </article>
            ))}
          </div>
        ) : (
          <EmptyState
            title="No current announcements"
            text="New notices from the Institute will appear here."
          />
        )}
      </section>
    </>
  );
}

export function ArticlesPage() {
  const query = useQuery({
    queryKey: ["articles", "public-list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("articles")
        .select("id,slug,title,excerpt,featured_image,attachment_type,published_at,author")
        .or(
          `status.eq.published,and(status.eq.scheduled,published_at.lte.${new Date().toISOString()})`,
        )
        .order("published_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
  const feedsQuery = useQuery({
    queryKey: ["regulatory-feeds", "public-updates"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("regulatory_source_updates")
        .select("id,source_name,title,article_url,summary,published_at,fetched_at")
        .order("published_at", { ascending: false, nullsFirst: false })
        .order("fetched_at", { ascending: false })
        .limit(30);
      if (error) throw error;
      return data;
    },
  });
  return (
    <>
      <PageHero
        title="News & Updates"
        subtitle="Stories, information and updates from Profia Institute."
        eyebrow="Profia news"
      />
      <section className="container-site py-12">
        {query.isLoading ? (
          <CardGridSkeleton n={3} />
        ) : query.error ? (
          <ErrorNote />
        ) : query.data?.length ? (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {query.data.map((article) => (
              <div key={article.id}>
                <Link
                  to="/articles/$slug"
                  params={{ slug: article.slug }}
                  className="group block overflow-hidden rounded-xl border bg-card shadow-card"
                >
                  <div className="aspect-video bg-muted">
                    {article.featured_image && (
                      <img
                        src={article.featured_image}
                        alt=""
                        loading="lazy"
                        className="h-full w-full object-cover"
                      />
                    )}
                    {!article.featured_image && article.attachment_type === "video" && (
                      <span className="flex h-full items-center justify-center text-sm text-muted-foreground">
                        Video article
                      </span>
                    )}
                    {!article.featured_image && article.attachment_type !== "video" && (
                      <span className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
                        <Newspaper aria-hidden="true" className="h-5 w-5" />
                        Profia Institute news
                      </span>
                    )}
                  </div>
                  <div className="p-5">
                    {article.published_at && (
                      <time className="text-xs text-muted-foreground">
                        {new Date(article.published_at).toLocaleDateString("en-KE", {
                          dateStyle: "medium",
                        })}
                      </time>
                    )}
                    <h2 className="mt-2 text-lg font-bold text-brand group-hover:text-primary">
                      {article.title}
                    </h2>
                    {article.excerpt && (
                      <p className="mt-2 line-clamp-3 text-sm text-muted-foreground">
                        {article.excerpt}
                      </p>
                    )}
                  </div>
                </Link>
                {article.author && (
                  <p className="px-4 pt-2 text-xs text-muted-foreground">By {article.author}</p>
                )}
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            title="No articles published yet"
            text="News from Profia Institute will be shared here."
          />
        )}
      </section>
      <section className="bg-muted/40 py-12">
        <div className="container-site">
          <SectionTitle
            title="Official feeds"
            subtitle="Recent updates fetched from official KASNEB, TVETA, HELB, and ICPAK sources. Select a headline to read the original on its source website."
          />
          {feedsQuery.isLoading ? (
            <CardGridSkeleton n={3} />
          ) : feedsQuery.error ? (
            <div
              role="status"
              className="rounded-xl border bg-card p-5 text-sm text-muted-foreground"
            >
              Official feed updates are temporarily unavailable.
            </div>
          ) : feedsQuery.data?.length ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {feedsQuery.data.map((item) => (
                <article key={item.id} className="rounded-xl border bg-card p-5 shadow-card">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
                      {item.source_name}
                    </span>
                    <time className="text-xs text-muted-foreground">
                      {new Date(item.published_at ?? item.fetched_at).toLocaleDateString("en-KE", {
                        dateStyle: "medium",
                      })}
                    </time>
                  </div>
                  <h3 className="mt-3 font-semibold leading-snug text-brand">{item.title}</h3>
                  {item.summary && (
                    <p className="mt-2 line-clamp-4 text-sm leading-6 text-muted-foreground">
                      {item.summary}
                    </p>
                  )}
                  <a
                    className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
                    href={item.article_url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Read on {item.source_name}
                    <ExternalLink aria-hidden="true" className="h-3.5 w-3.5" />
                  </a>
                </article>
              ))}
            </div>
          ) : (
            <EmptyState
              title="No official feed updates yet"
              text="Updates fetched by the Institute will appear here."
            />
          )}
        </div>
      </section>
    </>
  );
}

export type PublicArticle = Pick<
  Tables<"articles">,
  | "slug"
  | "title"
  | "excerpt"
  | "content"
  | "featured_image"
  | "attachment_url"
  | "attachment_type"
  | "author"
  | "published_at"
>;

export function ArticleDetailPage({ article }: { article: PublicArticle | null }) {
  if (!article)
    return (
      <main className="container-site py-16">
        <EmptyState
          title="Article not found"
          text="This article may have been unpublished or moved."
          action={
            <Button asChild variant="outline">
              <Link to="/articles">Browse news</Link>
            </Button>
          }
        />
      </main>
    );
  return (
    <article>
      <PageHero
        title={article.title}
        subtitle={article.excerpt}
        image={article.featured_image}
        eyebrow={
          article.published_at
            ? new Date(article.published_at).toLocaleDateString("en-KE", { dateStyle: "long" })
            : "Profia news"
        }
      />
      <div className="container-site max-w-4xl py-12">
        {article.author && (
          <p className="mb-6 text-sm text-muted-foreground">By {article.author}</p>
        )}
        <div
          className="prose-profia text-base leading-8 text-foreground"
          dangerouslySetInnerHTML={{ __html: renderContentMarkup(article.content) }}
        />
        {article.attachment_url && article.attachment_type !== "image" && (
          <PublicAttachment
            url={article.attachment_url}
            type={article.attachment_type}
            filename={null}
            label={article.title}
          />
        )}
        <Button asChild variant="outline" className="mt-10">
          <Link to="/articles">← All news</Link>
        </Button>
      </div>
    </article>
  );
}

function PublicAttachment({
  url,
  type,
  filename,
  label,
}: {
  url: string;
  type: string | null;
  filename: string | null;
  label: string;
}) {
  const youtubeEmbedUrl = type === "video" ? getYouTubeEmbedUrl(url) : null;
  if (youtubeEmbedUrl)
    return (
      <iframe
        src={youtubeEmbedUrl}
        title={label}
        className="mt-5 aspect-video w-full rounded-lg bg-black"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        referrerPolicy="strict-origin-when-cross-origin"
        loading="lazy"
        allowFullScreen
      />
    );
  if (type === "video")
    return (
      <video
        className="mt-5 max-h-[36rem] w-full rounded-lg bg-black"
        src={url}
        controls
        playsInline
        preload="metadata"
      >
        Your browser does not support video playback.
      </video>
    );
  if (type === "audio")
    return (
      <audio className="mt-5 w-full" src={url} controls preload="metadata">
        Your browser does not support audio playback.
      </audio>
    );
  if (type === "image")
    return (
      <img
        className="mt-5 max-h-[36rem] max-w-full rounded-lg object-contain"
        src={url}
        alt={label}
        loading="lazy"
      />
    );
  return <AttachmentDownload url={url} filename={filename} label={label} />;
}

function AttachmentDownload({
  url,
  filename,
  label,
}: {
  url: string;
  filename: string | null;
  label: string;
}) {
  const [downloading, setDownloading] = useState(false);
  return (
    <div className="mt-5">
      <button
        type="button"
        className="inline-flex font-medium text-primary hover:underline disabled:opacity-60"
        disabled={downloading}
        onClick={async () => {
          setDownloading(true);
          try {
            await downloadContentAttachment(url, filename || label);
          } catch (error) {
            toast.error("Could not download attachment", {
              description: error instanceof Error ? error.message : undefined,
            });
          } finally {
            setDownloading(false);
          }
        }}
      >
        {downloading ? "Preparing download…" : "Download attachment"}
      </button>
    </div>
  );
}

export function ContactPage() {
  const general = useGeneral();
  const [values, setValues] = useState({
    name: "",
    email: "",
    phone: "",
    subject: "",
    message: "",
  });
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    try {
      const { error } = await supabase.from("contact_messages").insert({
        name: values.name.trim(),
        email: values.email.trim().toLowerCase() || null,
        phone: values.phone.trim() || null,
        subject: values.subject.trim() || null,
        message: values.message.trim(),
        status: "new",
      });
      if (error) throw error;
      setSubmitted(true);
      setValues({ name: "", email: "", phone: "", subject: "", message: "" });
      toast.success("Your message was sent to Profia Institute");
    } catch (error) {
      toast.error("Your message could not be sent", {
        description: error instanceof Error ? error.message : "Please try again.",
      });
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageHero
        title="Contact Profia Institute"
        subtitle="Reach the Institute with questions about courses, admissions or student services."
        eyebrow="We are here to help"
      />
      <section className="container-site space-y-8 py-12">
        <div className="grid gap-8 lg:grid-cols-[0.85fr_1.15fr]">
          <div className="space-y-4">
            <InfoCard
              title="Visit us"
              text={general.location || `${FACILITY_LOCATION.name}, Homa Bay, Kenya`}
              icon={<MapPin />}
            />
            <InfoCard title="Postal address" text={general.address} icon={<Send />} />
            <InfoCard title="Call" text={general.phones.join(" · ")} icon={<Phone />} />
            <InfoCard title="Email" text={general.email} icon={<Send />} />
            <Button asChild variant="whatsapp" className="w-full">
              <a
                href={whatsappLink(general.whatsapp, "Hello Profia Institute, I have an enquiry.")}
                target="_blank"
                rel="noopener noreferrer"
              >
                <MessageCircle /> Chat on WhatsApp
              </a>
            </Button>
          </div>
          <form
            onSubmit={submit}
            className="space-y-4 rounded-2xl border bg-card p-5 shadow-card sm:p-7"
          >
            {submitted && (
              <p role="status" className="rounded-lg bg-cream p-3 text-sm text-brand">
                Thank you. Your message has been received; the Institute will follow up using your
                contact details.
              </p>
            )}
            <h2 className="text-xl font-bold text-brand">Send us a message</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Name *">
                <Input
                  required
                  maxLength={100}
                  value={values.name}
                  onChange={(e) => setValues({ ...values, name: e.target.value })}
                />
              </Field>
              <Field label="Email">
                <Input
                  type="email"
                  maxLength={255}
                  value={values.email}
                  onChange={(e) => setValues({ ...values, email: e.target.value })}
                />
              </Field>
              <Field label="Phone">
                <Input
                  type="tel"
                  maxLength={20}
                  value={values.phone}
                  onChange={(e) => setValues({ ...values, phone: e.target.value })}
                />
              </Field>
              <Field label="Subject">
                <Input
                  maxLength={200}
                  value={values.subject}
                  onChange={(e) => setValues({ ...values, subject: e.target.value })}
                />
              </Field>
            </div>
            <Field label="Message *">
              <Textarea
                required
                maxLength={2000}
                rows={6}
                value={values.message}
                onChange={(e) => setValues({ ...values, message: e.target.value })}
              />
            </Field>
            <Button disabled={busy}>{busy ? "Sending…" : "Send message"}</Button>
          </form>
        </div>
        <section className="overflow-hidden rounded-2xl border bg-card shadow-card">
          <div className="flex flex-wrap items-center justify-between gap-3 p-5">
            <div>
              <h2 className="text-xl font-bold text-brand">Find Profia Institute</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {FACILITY_LOCATION.name}, Homa Bay, Kenya
              </p>
            </div>
            <Button asChild variant="outline">
              <a href={FACILITY_LOCATION.googleMapsUrl} target="_blank" rel="noopener noreferrer">
                <MapPin /> Get directions
              </a>
            </Button>
          </div>
          <iframe
            title="Map showing Profia Institute of Professionals in Homa Bay"
            src={`https://www.google.com/maps?q=${FACILITY_LOCATION.latitude},${FACILITY_LOCATION.longitude}&z=17&output=embed`}
            className="h-[360px] w-full border-0 sm:h-[440px]"
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
            allowFullScreen
          />
        </section>
      </section>
      <FaqSection />
    </>
  );
}

function InfoCard({ title, text, icon }: { title: string; text: string; icon?: React.ReactNode }) {
  return (
    <section className="rounded-xl border bg-card p-5 shadow-card">
      <div className="flex items-center gap-3">
        {icon && (
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent text-primary">
            {icon}
          </span>
        )}
        <h2 className="font-semibold text-brand">{title}</h2>
      </div>
      <p className="mt-3 whitespace-pre-wrap text-sm text-muted-foreground">{text}</p>
    </section>
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
function formatDate(value: string) {
  return new Date(`${value}T00:00:00`).toLocaleDateString("en-KE", { dateStyle: "medium" });
}
