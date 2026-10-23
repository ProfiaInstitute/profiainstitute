import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Check, Megaphone, Newspaper, Phone, Wallet, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { SCHOOL_ROUTES, seo, useActiveIntake, useSchools, useSetting } from "@/lib/site";
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
  type CbcSettings = {
    enabled: boolean;
    badge?: string;
    title?: string;
    items: string[];
    cta?: string;
    phone?: string;
    price?: string;
    schedule?: string;
    location?: string;
  };
  type WebSettings = {
    enabled: boolean;
    badge?: string;
    title?: string;
    cta?: string;
    image?: string;
  };
  const activeIntake = useActiveIntake();
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
  const cbc = useSetting<CbcSettings>("content.cbc", { enabled: true, items: [] });
  const web = useSetting<WebSettings>("content.webdev", { enabled: true });
  const stats = useSetting<{ items: { value: string; label: string }[] }>("stats", { items: [] });

  return (
    <>
      {/* HERO */}
      <section className="relative isolate overflow-hidden bg-brand text-brand-foreground">
        <img
          src={hero.image}
          alt="Profia Institute class in session"
          className="absolute inset-0 -z-20 h-full w-full object-cover"
          fetchPriority="high"
        />
        <div className="absolute inset-0 -z-10 bg-hero-overlay" />
        <div className="container-site py-20 sm:py-32">
          <div className="max-w-2xl animate-fade-up">
            {intakeBadge && (
              <span className="inline-flex items-center gap-2 rounded-full bg-primary px-3 py-1 text-sm font-semibold text-primary-foreground">
                <Check className="h-4 w-4" /> {intakeBadge}
              </span>
            )}
            {activeIntake.isError && (
              <p role="status" className="mt-3 text-sm">
                Admissions details are temporarily unavailable.
              </p>
            )}
            {intakeDetails && (
              <p className="mt-3 text-sm font-medium text-brand-foreground/90">{intakeDetails}</p>
            )}
            <h1 className="mt-5 text-4xl font-extrabold leading-[1.1] sm:text-6xl">{hero.title}</h1>
            <div className="mt-8 flex flex-wrap gap-3">
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
      </section>

      <AnnouncementStrip />

      {/* CBC */}
      {cbc.enabled && (
        <section className="bg-cream py-16">
          <div className="container-site grid items-center gap-10 lg:grid-cols-2">
            <div>
              <p className="eyebrow">💻 {cbc.badge}</p>
              <h2 className="mt-2 text-3xl font-bold text-brand sm:text-4xl">{cbc.title}</h2>
              <ul className="mt-6 space-y-3">
                {(cbc.items ?? []).map((i: string) => (
                  <li key={i} className="flex gap-3">
                    <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                      <Check className="h-3.5 w-3.5" />
                    </span>
                    {i}
                  </li>
                ))}
              </ul>
              <div className="mt-8 flex flex-wrap gap-3">
                <Button asChild variant="hero" size="lg">
                  <Link to="/admission" search={{}}>
                    {cbc.cta || "Register Now"} <ArrowRight />
                  </Link>
                </Button>
              </div>
            </div>
            <div className="grid gap-3 rounded-2xl bg-background p-6 shadow-card">
              {cbc.phone && (
                <InfoRow
                  icon={<Phone />}
                  label="Call"
                  value={cbc.phone}
                  href={`tel:${cbc.phone.replace(/\s/g, "")}`}
                />
              )}
              {cbc.price && <InfoRow icon={<Wallet />} label="Fee" value={cbc.price} />}
              {cbc.schedule && (
                <InfoRow icon={<Megaphone />} label="Schedule" value={cbc.schedule} />
              )}
              {cbc.location && <InfoRow icon={<MapPin />} label="Location" value={cbc.location} />}
            </div>
          </div>
        </section>
      )}

      {/* WEB DEV */}
      {web.enabled && (
        <section className="py-16">
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

      {/* STATS */}
      {stats.items?.length > 0 && (
        <section className="border-y bg-background">
          <div className="container-site grid grid-cols-2 divide-x py-10 text-center">
            {stats.items.map((s) => (
              <div key={s.label} className="px-4">
                <div className="text-4xl font-extrabold text-primary sm:text-5xl">{s.value}</div>
                <div className="mt-1 text-sm font-medium text-muted-foreground">{s.label}</div>
              </div>
            ))}
          </div>
        </section>
      )}

      <AcademicsGrid />
      <LatestNews />
      <HomepageMedia />
      <Partners />
    </>
  );
}

function InfoRow({
  icon,
  label,
  value,
  href,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  href?: string;
}) {
  const inner = (
    <div className="flex items-center gap-4 rounded-lg border p-4">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent text-primary [&_svg]:h-5 [&_svg]:w-5">
        {icon}
      </span>
      <div>
        <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
        <div className="font-semibold text-brand">{value}</div>
      </div>
    </div>
  );
  return href ? <a href={href}>{inner}</a> : inner;
}

function AnnouncementStrip() {
  const { data } = useQuery({
    queryKey: ["home_announcements"],
    queryFn: async () => {
      const { data } = await supabase
        .from("announcements")
        .select("id,title,category")
        .eq("published", true)
        .eq("show_on_homepage", true)
        .order("created_at", { ascending: false })
        .limit(3);
      const now = Date.now();
      return data ?? [];
    },
  });
  if (!data?.length) return null;
  return (
    <div className="bg-primary text-primary-foreground">
      <div className="container-site flex flex-wrap items-center gap-x-6 gap-y-1 py-3 text-sm font-medium">
        <Megaphone className="h-4 w-4" />
        {data.map((a) => (
          <span key={a.id}>{a.title}</span>
        ))}
        <Link to="/announcements" className="ml-auto underline">
          All announcements
        </Link>
      </div>
    </div>
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
        .in("status", ["published", "scheduled"])
        .lte("published_at", new Date().toISOString())
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
