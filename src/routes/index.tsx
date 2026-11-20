import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  CalendarDays,
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
  head: () => {
    const pageHead = seo(
      "Profia Institute | TVET College & KASNEB Centre, Homa Bay",
      "Profia Institute is a TVET college and approved KASNEB exam centre in Homa Bay, offering professional, business, ICT, hospitality, engineering and cosmetology training.",
      "/",
    );
    return {
      ...pageHead,
      links: [
        ...pageHead.links,
        { rel: "preload", as: "image", href: "/images/profia_school.webp", fetchPriority: "high" },
      ],
    };
  },
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
  const about = useSetting<{ intro?: string }>("content.about", {});
  const web = useSetting<WebSettings>("content.webdev", { enabled: true });
  const stats = useSetting<{ items: { value: string; label: string }[] }>("stats", { items: [] });
  const defaultHeroSlide = {
    id: "default-hero",
    url: hero.image,
    caption: null,
    alt: "Profia Institute campus",
    slot: null,
    sort_order: 0,
  };
  const slides = [
    defaultHeroSlide,
    ...(heroMedia.data ?? []).filter((slide) => slide.url !== defaultHeroSlide.url),
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
      <AnnouncementStrip />

      <section
        className="relative isolate overflow-hidden bg-brand-deep text-brand-foreground"
        onMouseEnter={() => setCarouselHovered(true)}
        onMouseLeave={() => setCarouselHovered(false)}
        role="region"
        aria-label="Featured stories"
        aria-roledescription={slides.length > 1 ? "carousel" : undefined}
      >
        {slides.map((slide, index) => (
          <img
            key={slide.id}
            src={slide.url}
            alt={index === slideIndex ? slide.alt || "Profia Institute students and community" : ""}
            aria-hidden={index !== slideIndex}
            className={`absolute inset-0 -z-20 h-full w-full object-cover object-center transition-opacity duration-700 ${
              index === slideIndex ? "opacity-100" : "opacity-0"
            }`}
            loading="eager"
            fetchPriority={index === slideIndex ? "high" : "low"}
            decoding="async"
          />
        ))}
        <div className="absolute inset-0 -z-10 bg-[linear-gradient(90deg,rgba(24,7,10,0.8)_0%,rgba(39,9,14,0.68)_42%,rgba(39,9,14,0.3)_100%)]" />
        <div className="absolute inset-0 -z-10 bg-[linear-gradient(0deg,rgba(24,7,10,0.28)_0%,transparent_38%)]" />
        <div className="container-site grid min-h-[44rem] items-center gap-10 py-12 sm:min-h-[40rem] sm:py-14 lg:min-h-[38rem] lg:grid-cols-[minmax(0,1.15fr)_minmax(19rem,0.7fr)] lg:gap-16 lg:py-16">
          <div className="animate-fade-up py-2 lg:py-8">
            <p className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-black/20 px-4 py-2 text-xs font-bold uppercase tracking-[0.16em] text-white/95 backdrop-blur-sm sm:text-sm">
              <span className="h-2 w-2 rounded-full bg-primary" />
              Profia Institute of Professionals
              <span className="text-white/60">·</span> Homa Bay, Kenya
            </p>
            {activeIntake.isError && (
              <p role="status" className="mt-4 text-sm text-white/85">
                Admissions details are temporarily unavailable.
              </p>
            )}
            {heroMedia.error && (
              <p role="status" className="mt-4 text-sm text-white/85">
                Featured slides are temporarily unavailable. Showing the default campus image.
              </p>
            )}
            <h1 className="mt-6 max-w-3xl text-4xl font-extrabold leading-[1.08] tracking-tight text-white sm:text-5xl lg:text-[3.8rem]">
              <span aria-live="polite" aria-atomic="true">
                {currentSlide.caption || hero.title}
              </span>
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-7 text-white/85 sm:text-lg sm:leading-8">
              Build practical skills, earn recognised qualifications and take your next step with a
              learning community rooted in Homa Bay.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Button asChild variant="hero" size="lg" className="px-7">
                <Link to="/admission" search={{}}>
                  {hero.cta || "Apply now"} <ArrowRight className="ml-1 h-4 w-4" />
                </Link>
              </Button>
              <Button
                asChild
                variant="heroOutline"
                size="lg"
                className="border-white/60 bg-white/5 px-7 text-white hover:bg-white/15"
              >
                <Link to="/academics">Explore programmes</Link>
              </Button>
            </div>
          </div>

          <aside className="relative mx-auto w-full max-w-md overflow-hidden rounded-2xl border border-white/35 bg-brand-deep/65 text-white shadow-[0_24px_80px_-28px_rgba(0,0,0,0.55)] backdrop-blur-xl backdrop-saturate-150 lg:ml-auto">
            <div className="h-px bg-gradient-to-r from-transparent via-white/80 to-transparent" />
            <div className="p-6 sm:p-8">
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/20 bg-white/10 text-primary">
                  <CalendarDays className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-primary">
                    Admissions
                  </p>
                  <p className="mt-0.5 text-xs font-semibold uppercase tracking-wide text-white/65">
                    Profia Institute · Homa Bay
                  </p>
                </div>
              </div>

              {activeIntake.data ? (
                <>
                  <p className="mt-6 inline-flex items-center gap-2 rounded-full border border-emerald-200/20 bg-emerald-300/15 px-3 py-1.5 text-xs font-bold text-emerald-100">
                    <span className="h-2 w-2 rounded-full bg-emerald-500" />
                    Applications open
                  </p>
                  <h2 className="mt-3 text-2xl font-extrabold leading-tight text-white sm:text-3xl">
                    {activeIntake.data.name}
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-white/75">
                    Take the next step toward a practical, career-focused qualification.
                  </p>
                  {(activeIntake.data.start_date || activeIntake.data.application_deadline) && (
                    <dl className="mt-5 grid grid-cols-2 gap-3 border-y border-white/20 py-4">
                      {activeIntake.data.start_date && (
                        <div>
                          <dt className="text-[11px] font-semibold uppercase tracking-wide text-white/60">
                            Intake starts
                          </dt>
                          <dd className="mt-1 text-sm font-bold text-white">
                            {new Date(
                              `${activeIntake.data.start_date}T00:00:00`,
                            ).toLocaleDateString("en-KE", { dateStyle: "medium" })}
                          </dd>
                        </div>
                      )}
                      {activeIntake.data.application_deadline && (
                        <div>
                          <dt className="text-[11px] font-semibold uppercase tracking-wide text-white/60">
                            Apply by
                          </dt>
                          <dd className="mt-1 text-sm font-bold text-white">
                            {new Date(
                              `${activeIntake.data.application_deadline}T00:00:00`,
                            ).toLocaleDateString("en-KE", { dateStyle: "medium" })}
                          </dd>
                        </div>
                      )}
                    </dl>
                  )}
                  {activeIntake.data.notes && (
                    <p className="mt-4 line-clamp-3 text-sm leading-6 text-white/75">
                      {activeIntake.data.notes}
                    </p>
                  )}
                </>
              ) : (
                <>
                  <p className="mt-6 text-xs font-bold uppercase tracking-[0.18em] text-primary">
                    Find your next step
                  </p>
                  <h2 className="mt-3 text-2xl font-extrabold leading-tight text-white sm:text-3xl">
                    Your future starts here.
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-white/75">
                    Explore our programmes or talk with admissions about upcoming opportunities.
                  </p>
                  {activeIntake.isError && (
                    <p role="status" className="mt-3 text-xs text-white/65">
                      Current intake information is temporarily unavailable.
                    </p>
                  )}
                </>
              )}

              <div className="mt-6 grid gap-2.5">
                <Button asChild variant="hero" className="w-full justify-between">
                  <Link to="/admission" search={{}}>
                    Start your application <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
                <Link
                  to="/application-status"
                  search={{}}
                  className="text-center text-sm font-semibold text-white/85 underline-offset-4 hover:text-primary hover:underline"
                >
                  Already applied? Track your application
                </Link>
              </div>
            </div>
          </aside>
        </div>
        {slides.length > 1 && (
          <div className="container-site flex items-center gap-2 pb-5">
            <button
              type="button"
              aria-label="Previous hero slide"
              onClick={() => setSlideIndex((index) => (index - 1 + slides.length) % slides.length)}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-white/50 bg-black/20 text-white transition hover:bg-white/20"
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
              className="flex h-9 w-9 items-center justify-center rounded-full border border-white/50 bg-black/20 text-white transition hover:bg-white/20"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
            <button
              type="button"
              aria-label={carouselPaused ? "Play hero slideshow" : "Pause hero slideshow"}
              aria-pressed={carouselPaused}
              onClick={() => setCarouselPaused((paused) => !paused)}
              className="ml-auto flex h-9 w-9 items-center justify-center rounded-full border border-white/50 bg-black/20 text-white transition hover:bg-white/20"
            >
              {carouselPaused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
            </button>
          </div>
        )}
      </section>

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

      <section className="container-site grid gap-6 py-14 sm:py-16 lg:grid-cols-[0.8fr_1.2fr] lg:items-center lg:gap-16">
        <div>
          <p className="eyebrow">Welcome to Profia</p>
          <h2 className="mt-3 text-3xl font-extrabold leading-tight text-brand sm:text-4xl">
            A practical start to a brighter future.
          </h2>
        </div>
        <div className="rounded-2xl border bg-muted/30 p-6 sm:p-8">
          <p className="text-base leading-7 text-muted-foreground">
            {about.intro ||
              "Profia Institute is a TVET college and approved KASNEB examination centre in Homa Bay. Explore professional, business and technical courses, including current KASNEB programmes, and contact admissions for details."}
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Button asChild variant="outline">
              <Link to="/about">
                About the Institute <ArrowRight className="ml-1 h-4 w-4" />
              </Link>
            </Button>
            <Button asChild variant="link" className="text-brand">
              <Link to="/academics">Explore our schools</Link>
            </Button>
          </div>
        </div>
      </section>

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
        className="border-b bg-muted/50 px-4 py-3 text-center text-sm text-muted-foreground"
        role="status"
      >
        Current notices are temporarily unavailable. Please check the announcements page later.
      </div>
    );
  if (!data?.length) return null;
  return (
    <div className="border-b border-white/10 bg-brand-deep text-brand-foreground">
      <div className="container-site flex min-h-12 items-center gap-4 py-2.5">
        <span className="flex shrink-0 items-center gap-2 text-xs font-bold uppercase tracking-wider text-white sm:text-sm">
          <Megaphone className="h-4 w-4" /> Latest notices
        </span>
        <div
          className="flex min-w-0 flex-1 items-center gap-5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          role="region"
          aria-label="Profia announcements"
        >
          {data.map((announcement) => (
            <Link
              key={announcement.id}
              to="/announcements"
              className="flex shrink-0 items-center gap-2 text-sm text-white/80 transition hover:text-primary"
            >
              <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-primary" />
              <span className="max-w-[18rem] truncate">{announcement.title}</span>
            </Link>
          ))}
        </div>
        <Link
          to="/announcements"
          className="shrink-0 text-xs font-semibold text-primary underline-offset-4 hover:text-white hover:underline sm:text-sm"
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
    {
      to: "/holiday-program",
      label: "Holiday program",
      detail: "General and kids training",
      icon: CalendarDays,
    },
    { to: "/contact", label: "Talk to us", detail: "Get help from admissions", icon: Phone },
  ];
  return (
    <section className="border-b bg-white py-4 sm:py-5">
      <div className="container-site grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {links.map(({ to, label, detail, icon: Icon, student }) => (
          <Link
            key={label}
            to={to}
            {...(student ? { search: { course: undefined } } : {})}
            className="group flex min-h-20 items-center gap-2.5 rounded-xl bg-muted/40 px-3 py-3 transition hover:bg-accent/70 sm:gap-3 sm:px-5"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-primary shadow-sm sm:h-10 sm:w-10">
              <Icon className="h-5 w-5" />
            </span>
            <span className="min-w-0">
              <span className="block whitespace-normal text-sm font-bold leading-tight text-brand sm:text-base">
                {label}
              </span>
              <span className="mt-1 block whitespace-normal text-[11px] leading-snug text-muted-foreground sm:text-xs">
                {detail}
              </span>
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
