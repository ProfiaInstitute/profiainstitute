import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  Check,
  ChevronLeft,
  ChevronRight,
  GraduationCap,
  Megaphone,
  Newspaper,
  Pause,
  Phone,
  Play,
  UserRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { SCHOOL_ROUTES, seo, useActiveIntake, useMedia, useSchools, useSetting } from "@/lib/site";
import {
  CardGridSkeleton,
  EmptyState,
  HomepageMedia,
  Partners,
  SectionTitle,
} from "@/components/site/common";

export const Route = createFileRoute("/")({
  head: () =>
    seo(
      "Profia Institute — TVET Accredited College in Homa Bay",
      "Apply to Profia Institute in Homa Bay for CPA, ICT, hospitality, cosmetology and engineering courses.",
      "/",
    ),
  component: Home,
});

function Home() {
  type WebSettings = {
    enabled: boolean;
    badge?: string;
    title?: string;
    cta?: string;
    image?: string;
  };
  const activeIntake = useActiveIntake();
  const heroMedia = useMedia("hero");
  const [slideIndex, setSlideIndex] = useState(0);
  const [carouselPaused, setCarouselPaused] = useState(false);
  const [carouselHovered, setCarouselHovered] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const hero = useSetting("content.hero", {
    title: "Become a Certified Public Accountant at Profia Institute",
    cta: "Apply now",
    image: "/images/profia_school.webp",
  });
  const intakeBadge = activeIntake.data ? `${activeIntake.data.name} now open` : null;
  const intakeDetails = [
    activeIntake.data?.start_date
      ? `Starts ${new Date(`${activeIntake.data.start_date}T00:00:00`).toLocaleDateString("en-KE", { dateStyle: "medium" })}`
      : null,
    activeIntake.data?.application_deadline
      ? `Apply by ${new Date(`${activeIntake.data.application_deadline}T00:00:00`).toLocaleDateString("en-KE", { dateStyle: "medium" })}`
      : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const web = useSetting<WebSettings>("content.webdev", { enabled: true });
  const stats = useSetting<{ items: { value: string; label: string }[] }>("stats", { items: [] });
  const slides = heroMedia.data?.length
    ? heroMedia.data
    : [
        {
          id: "default-hero",
          url: hero.image,
          caption: null,
          alt: null,
          slot: null,
          sort_order: 0,
        },
      ];
  const currentSlide = slides[slideIndex % slides.length] ?? slides[0]!;

  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updatePreference = () => setReducedMotion(preference.matches);
    updatePreference();
    preference.addEventListener("change", updatePreference);
    return () => preference.removeEventListener("change", updatePreference);
  }, []);

  useEffect(() => {
    if (slides.length < 2 || carouselPaused || carouselHovered || reducedMotion) return;
    const interval = window.setInterval(() => {
      setSlideIndex((index) => (index + 1) % slides.length);
    }, 6500);
    return () => window.clearInterval(interval);
  }, [carouselHovered, carouselPaused, reducedMotion, slides.length]);

  useEffect(() => {
    setSlideIndex((index) => Math.min(index, Math.max(0, slides.length - 1)));
  }, [slides.length]);

  return (
    <div className="homepage-motion">
      {/* HERO */}
      <section
        className="relative isolate min-h-[32rem] overflow-hidden bg-brand text-brand-foreground sm:min-h-[36rem]"
        onMouseEnter={() => setCarouselHovered(true)}
        onMouseLeave={() => setCarouselHovered(false)}
        role="region"
        aria-label="Featured stories"
        aria-roledescription={slides.length > 1 ? "carousel" : undefined}
      >
        <img
          key={currentSlide.id}
          src={currentSlide.url}
          alt={currentSlide.alt || "Profia Institute"}
          className="absolute inset-0 -z-10 h-full w-full object-contain"
          fetchPriority="high"
        />
        <div className="container-site grid min-h-[32rem] items-center gap-6 py-12 sm:min-h-[36rem] sm:py-16 lg:grid-cols-[10rem_minmax(0,1fr)] lg:gap-12 lg:py-20">
          <aside className="absolute left-4 top-1/2 z-10 hidden w-40 min-w-0 -translate-y-1/2 rounded-2xl border border-white/20 bg-white/95 p-3 text-foreground shadow-lift backdrop-blur-sm lg:left-6 lg:block">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-primary">
              Your next step
            </p>
            <h2 className="mt-1.5 text-base font-bold leading-tight text-brand">
              Find your place at Profia
            </h2>
            <div className="mt-2 divide-y">
              <Link
                to="/admission"
                search={{}}
                className="group flex items-center justify-between gap-1.5 py-2.5 text-[11px] font-semibold text-brand transition-colors hover:text-primary"
              >
                Apply for admission
                <ArrowRight className="h-3.5 w-3.5 shrink-0 transition-transform group-hover:translate-x-1" />
              </Link>
              <Link
                to="/academics"
                className="group flex items-center justify-between gap-1.5 py-2.5 text-[11px] font-semibold text-brand transition-colors hover:text-primary"
              >
                Explore our schools
                <ArrowRight className="h-3.5 w-3.5 shrink-0 transition-transform group-hover:translate-x-1" />
              </Link>
              <Link
                to="/student"
                search={{ course: undefined }}
                className="group flex items-center justify-between gap-1.5 py-2.5 text-[11px] font-semibold text-brand transition-colors hover:text-primary"
              >
                Open student portal
                <ArrowRight className="h-3.5 w-3.5 shrink-0 transition-transform group-hover:translate-x-1" />
              </Link>
            </div>
          </aside>
          <div className="hero-copy max-w-3xl animate-fade-up lg:col-start-2">
            <p className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-black/15 px-4 py-2 text-xs font-bold uppercase tracking-[0.18em] text-white/95 backdrop-blur-sm">
              <span className="h-2 w-2 rounded-full bg-primary" />
              Profia Institute of Professionals · Homa Bay
            </p>
            {intakeBadge && (
              <span className="mt-5 inline-flex items-center gap-2 rounded-full bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground">
                <Check className="h-4 w-4" /> {intakeBadge}
              </span>
            )}
            {activeIntake.isError && (
              <p role="status" className="mt-3 text-sm">
                Admissions details are temporarily unavailable.
              </p>
            )}
            {heroMedia.error && (
              <p role="status" className="mt-3 text-sm">
                Featured slides are temporarily unavailable. Showing the default campus image.
              </p>
            )}
            {intakeDetails && (
              <p className="mt-3 text-sm font-medium text-brand-foreground/90">{intakeDetails}</p>
            )}
            <h1 className="mt-5 max-w-3xl text-xl font-extrabold leading-[1.15] tracking-tight sm:text-2xl lg:text-3xl">
              <span aria-live="polite" aria-atomic="true">
                {currentSlide.caption || hero.title}
              </span>
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-white/85 sm:text-base sm:leading-7">
              Build practical skills, earn recognised qualifications and take your next step with a
              learning community rooted in Homa Bay.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Button asChild variant="hero" size="lg">
                <Link to="/admission" search={{}}>
                  {hero.cta || "Apply now"}
                </Link>
              </Button>
              <Button asChild variant="heroOutline" size="lg">
                <Link to="/academics">View courses</Link>
              </Button>
            </div>
          </div>
        </div>
        {slides.length > 1 && (
          <div className="container-site absolute inset-x-0 bottom-5 z-10 flex items-center justify-center gap-2 sm:bottom-7 lg:justify-start">
            <button
              type="button"
              aria-label="Previous hero slide"
              onClick={() => setSlideIndex((index) => (index - 1 + slides.length) % slides.length)}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-white/40 bg-black/20 text-white transition hover:bg-white/20"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            {slides.map((slide, index) => (
              <button
                key={slide.id}
                type="button"
                aria-label={`Show hero slide ${index + 1}`}
                aria-current={slideIndex === index ? "true" : undefined}
                onClick={() => setSlideIndex(index)}
                className={`h-2.5 rounded-full transition-all ${slideIndex === index ? "w-8 bg-primary" : "w-2.5 bg-white/70 hover:bg-white"}`}
              />
            ))}
            <button
              type="button"
              aria-label="Next hero slide"
              onClick={() => setSlideIndex((index) => (index + 1) % slides.length)}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-white/40 bg-black/20 text-white transition hover:bg-white/20"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
            <button
              type="button"
              aria-label={carouselPaused ? "Play hero slideshow" : "Pause hero slideshow"}
              aria-pressed={carouselPaused}
              onClick={() => setCarouselPaused((paused) => !paused)}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-white/40 bg-black/20 text-white transition hover:bg-white/20"
            >
              {carouselPaused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
            </button>
          </div>
        )}
      </section>

      <AnnouncementStrip />

      <QuickLinks />

      {stats.items?.length > 0 && (
        <section className="border-b bg-background">
          <div className="container-site grid grid-cols-2 divide-x py-8 text-center sm:grid-cols-4">
            {stats.items.map((stat) => (
              <div key={stat.label} className="px-3 sm:px-4">
                <div className="text-3xl font-extrabold text-primary sm:text-4xl">{stat.value}</div>
                <div className="mt-1 text-xs font-medium text-muted-foreground sm:text-sm">
                  {stat.label}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <AcademicsGrid />
      <Partners />
      <LatestNews />

      {/* WEB DEV */}
      {web.enabled && (
        <section className="py-16 sm:py-20">
          <div className="container-site grid items-center gap-10 overflow-hidden rounded-2xl bg-gradient-brand text-brand-foreground lg:grid-cols-2">
            <div className="p-8 sm:p-12">
              <span className="rounded-full bg-primary px-3 py-1 text-sm font-semibold">
                🔥 {web.badge}
              </span>
              <h2 className="mt-4 text-3xl font-bold sm:text-4xl">{web.title}</h2>
              <Button asChild variant="hero" size="lg" className="mt-8">
                <Link to="/admission" search={{}}>
                  {web.cta || "Enroll Today"}
                </Link>
              </Button>
            </div>
            {web.image && (
              <img
                src={web.image}
                alt="Web development at Profia"
                loading="lazy"
                className="h-full max-h-96 w-full object-cover"
              />
            )}
          </div>
        </section>
      )}

      <HomepageMedia />
    </div>
  );
}

function AnnouncementStrip() {
  const { data, error } = useQuery({
    queryKey: ["home_announcements"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("announcements")
        .select("id,title,category,starts_at,ends_at")
        .eq("published", true)
        .order("created_at", { ascending: false });
      if (error) throw error;
      const now = Date.now();
      return (data ?? [])
        .filter(
          (item) =>
            (!item.starts_at || new Date(item.starts_at).getTime() <= now) &&
            (!item.ends_at || new Date(item.ends_at).getTime() >= now),
        )
        .slice(0, 3);
    },
  });
  if (error)
    return (
      <div
        className="bg-brand-deep px-4 py-3 text-center text-sm text-brand-foreground"
        role="status"
      >
        Current notices are temporarily unavailable. Please check the announcements page later.
      </div>
    );
  if (!data?.length) return null;
  return (
    <div className="announcement-strip bg-brand-deep text-brand-foreground">
      <div className="container-site flex h-12 items-center gap-4">
        <span className="flex shrink-0 items-center gap-2 text-xs font-bold uppercase tracking-wider text-primary sm:text-sm">
          <Megaphone className="h-4 w-4" /> Latest notices
        </span>
        <div
          className="announcement-marquee min-w-0 flex-1"
          role="region"
          aria-label="Profia announcements"
        >
          <div className="announcement-marquee-track">
            {[0, 1].map((copy) => (
              <div
                key={copy}
                className="announcement-marquee-content"
                aria-hidden={copy === 1 ? true : undefined}
              >
                {data.map((announcement) => (
                  <span key={`${copy}-${announcement.id}`} className="flex items-center gap-3">
                    <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-primary" />
                    {announcement.title}
                  </span>
                ))}
              </div>
            ))}
          </div>
        </div>
        <Link
          to="/announcements"
          className="shrink-0 text-xs font-semibold underline underline-offset-4 hover:text-primary sm:text-sm"
        >
          All notices
        </Link>
      </div>
    </div>
  );
}

function QuickLinks() {
  const links = [
    {
      to: "/admission",
      label: "Join Profia",
      detail: "Start your application",
      icon: GraduationCap,
    },
    { to: "/academics", label: "Find a course", detail: "Explore our programmes", icon: Check },
    {
      to: "/student",
      label: "Student portal",
      detail: "Learning and student services",
      icon: UserRound,
      student: true,
    },
    { to: "/contact", label: "Talk to us", detail: "Get help from admissions", icon: Phone },
  ];
  return (
    <section className="relative z-10 -mt-1 border-b bg-background py-4 sm:py-5">
      <div className="container-site grid grid-cols-2 gap-3 lg:grid-cols-4">
        {links.map(({ to, label, detail, icon: Icon, student }) => (
          <Link
            key={label}
            to={to}
            {...(student ? { search: { course: undefined } } : {})}
            className="group flex min-h-20 items-center gap-3 rounded-xl border bg-card px-4 py-3 transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-card sm:px-5"
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent text-primary">
              <Icon className="h-5 w-5" />
            </span>
            <span className="min-w-0">
              <span className="block truncate font-bold text-brand">{label}</span>
              <span className="mt-0.5 block truncate text-xs text-muted-foreground">{detail}</span>
            </span>
            <ArrowRight className="ml-auto hidden h-4 w-4 shrink-0 text-primary transition-transform group-hover:translate-x-1 sm:block" />
          </Link>
        ))}
      </div>
    </section>
  );
}

function AcademicsGrid() {
  const { data, isLoading } = useSchools();
  return (
    <section className="bg-muted/40 py-16">
      <div className="container-site">
        <SectionTitle eyebrow="Academics" title="Our Schools" />
        {isLoading ? (
          <CardGridSkeleton n={5} />
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-5">
            {data?.map((s) => (
              <Link
                key={s.id}
                to={SCHOOL_ROUTES[s.slug] ?? "/academics"}
                className="group relative block aspect-[3/4] overflow-hidden rounded-xl shadow-card sm:aspect-[4/5]"
              >
                {s.hero_image && (
                  <img
                    src={s.hero_image}
                    alt={s.name}
                    loading="lazy"
                    className="absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-105"
                  />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-brand-deep via-brand-deep/40 to-transparent" />
                <div className="absolute inset-x-0 bottom-0 p-5 text-brand-foreground">
                  <h3 className="text-lg font-bold">{s.name}</h3>
                  <span className="mt-1 inline-flex items-center gap-1 text-sm text-primary">
                    Explore <ArrowRight className="h-4 w-4" />
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function LatestNews() {
  const { data, isLoading } = useQuery({
    queryKey: ["articles", "latest"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("articles")
        .select("id,slug,title,excerpt,featured_image,published_at")
        .or(
          `status.eq.published,and(status.eq.scheduled,published_at.lte.${new Date().toISOString()})`,
        )
        .order("published_at", { ascending: false })
        .limit(3);
      if (error) throw error;
      return data ?? [];
    },
  });
  return (
    <section className="py-16">
      <div className="container-site">
        <div className="mb-10 flex items-end justify-between gap-4">
          <SectionTitle eyebrow="News" title="Top News and Updates" />
          <Link
            to="/articles"
            className="mb-10 hidden items-center gap-1 font-semibold text-primary sm:flex"
          >
            View All <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
        {isLoading ? (
          <CardGridSkeleton n={3} />
        ) : data?.length ? (
          <div className="grid gap-6 md:grid-cols-3">
            {data.map((a) => (
              <ArticleCard key={a.id} a={a} />
            ))}
          </div>
        ) : (
          <EmptyState
            icon={<Newspaper className="h-5 w-5" />}
            title="No news yet"
            text="Updates from Profia Institute will appear here soon."
          />
        )}
      </div>
    </section>
  );
}

export function ArticleCard({
  a,
}: {
  a: {
    slug: string;
    title: string;
    excerpt: string | null;
    featured_image: string | null;
    published_at: string | null;
  };
}) {
  return (
    <Link
      to="/articles/$slug"
      params={{ slug: a.slug }}
      className="group overflow-hidden rounded-xl border bg-card shadow-card"
    >
      <div className="aspect-video bg-muted">
        {a.featured_image && (
          <img
            src={a.featured_image}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover"
          />
        )}
        {!a.featured_image && (
          <span className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
            <Newspaper aria-hidden="true" className="h-5 w-5" />
            Profia Institute news
          </span>
        )}
      </div>
      <div className="p-5">
        {a.published_at && (
          <div className="text-xs text-muted-foreground">
            {new Date(a.published_at).toLocaleDateString("en-KE", { dateStyle: "medium" })}
          </div>
        )}
        <h3 className="mt-1 font-bold text-brand group-hover:text-primary">{a.title}</h3>
        {a.excerpt && (
          <p className="mt-2 line-clamp-3 text-sm text-muted-foreground">{a.excerpt}</p>
        )}
      </div>
    </Link>
  );
}
