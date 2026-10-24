import { useState, type FormEvent } from "react";
import { Link, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  CheckCircle2,
  Clock3,
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
import { supabase } from "@/integrations/supabase/client";
import { getYouTubeEmbedUrl, renderContentMarkup } from "@/lib/content-format";
import { downloadContentAttachment } from "@/lib/content-download";
import type { Tables } from "@/integrations/supabase/types";
import {
  SCHOOL_ROUTES,
  formatKES,
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
  if (schools.isLoading || courses.isLoading)
    return (
      <main className="container-site py-16">
        <CardGridSkeleton n={5} />
      </main>
    );
  if (schools.error || courses.error)
    return (
      <main className="container-site py-16">
        <ErrorNote />
      </main>
    );
  const courseCounts = new Map<string, number>();
  for (const course of courses.data ?? [])
    courseCounts.set(course.school_id, (courseCounts.get(course.school_id) ?? 0) + 1);
  return (
    <>
      <PageHero
        title="Our Schools & Courses"
        subtitle="Explore programmes offered by Profia Institute and find the right path for your career."
        eyebrow="Academics"
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
        {schools.data?.length ? (
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
            title="Published courses"
            subtitle="See programme details and begin an application."
          />
          {courses.data?.length ? (
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
                    <Button asChild size="sm" className="mt-4">
                      <Link to="/admission" search={{ course: course.id }}>
                        Apply for this course
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
              title="No courses published yet"
              text="Check back later or contact admissions."
            />
          )}
        </div>
      </section>
    </>
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
        <p className="text-sm font-semibold text-brand">
          Tuition {course.fees === null ? "Contact admissions" : formatKES(course.fees)}
        </p>
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
            <p className="text-xs text-muted-foreground">
              Examination: {formatKES(course.online_exam_fee)} · Certificate:{" "}
              {formatKES(course.online_certificate_fee)} (paid separately after lessons)
            </p>
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
        {about.mission && <InfoCard title="Our mission" text={about.mission} />}
        {about.vision && <InfoCard title="Our vision" text={about.vision} />}
        {about.history && <InfoCard title="Our story" text={about.history} />}
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
    </>
  );
}

export function ArticleDetailPage() {
  const { slug } = useParams({ from: "/articles/$slug" });
  const query = useQuery({
    queryKey: ["article", slug],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("articles")
        .select(
          "slug,title,excerpt,content,featured_image,attachment_url,attachment_type,author,published_at",
        )
        .eq("slug", slug)
        .or(
          `status.eq.published,and(status.eq.scheduled,published_at.lte.${new Date().toISOString()})`,
        )
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  if (query.isLoading)
    return (
      <main className="container-site py-16">
        <CardGridSkeleton n={1} />
      </main>
    );
  if (query.error)
    return (
      <main className="container-site py-16">
        <ErrorNote />
      </main>
    );
  if (!query.data)
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
        title={query.data.title}
        subtitle={query.data.excerpt}
        image={query.data.featured_image}
        eyebrow={
          query.data.published_at
            ? new Date(query.data.published_at).toLocaleDateString("en-KE", { dateStyle: "long" })
            : "Profia news"
        }
      />
      <div className="container-site max-w-4xl py-12">
        {query.data.author && (
          <p className="mb-6 text-sm text-muted-foreground">By {query.data.author}</p>
        )}
        <div
          className="prose-profia text-base leading-8 text-foreground"
          dangerouslySetInnerHTML={{ __html: renderContentMarkup(query.data.content) }}
        />
        {query.data.attachment_url && query.data.attachment_type !== "image" && (
          <PublicAttachment
            url={query.data.attachment_url}
            type={query.data.attachment_type}
            filename={null}
            label={query.data.title}
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
      <section className="container-site grid gap-8 py-12 lg:grid-cols-[0.85fr_1.15fr]">
        <div className="space-y-4">
          <InfoCard title="Visit us" text={general.address} icon={<MapPin />} />
          <InfoCard title="Call" text={general.phones.join(" · ")} icon={<Phone />} />
          <InfoCard title="Email" text={general.email} icon={<Send />} />
          {general.location && (
            <InfoCard title="Location" text={general.location} icon={<MapPin />} />
          )}
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
