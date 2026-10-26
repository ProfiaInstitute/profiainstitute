import { Link } from "@tanstack/react-router";
import { useRouterState } from "@tanstack/react-router";
import { useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import {
  Briefcase,
  Clock,
  GraduationCap,
  Hammer,
  MessageCircle,
  Search,
  Sparkles,
  Wrench,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { getYouTubeEmbedUrl } from "@/lib/content-format";
import { formatKES, useGeneral, useMedia, whatsappLink } from "@/lib/site";
import { cn } from "@/lib/utils";

type FaqSearchItem = Pick<
  Tables<"faqs">,
  "id" | "question" | "answer" | "category" | "school_id" | "sort_order"
>;

export function WhatsAppButton({
  text,
  className,
  label = "Chat on WhatsApp",
}: {
  text?: string;
  className?: string;
  label?: string;
}) {
  const g = useGeneral();
  return (
    <Button asChild variant="whatsapp" className={className}>
      <a href={whatsappLink(g.whatsapp, text)} target="_blank" rel="noopener noreferrer">
        <MessageCircle /> {label}
      </a>
    </Button>
  );
}

export function WhatsAppFloat() {
  const g = useGeneral();
  return (
    <a
      href={whatsappLink(g.whatsapp, "Hello Profia Institute, I would like to enquire about")}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Chat with Profia on WhatsApp"
      className="fixed bottom-4 right-4 z-40 inline-flex h-14 w-14 items-center justify-center rounded-full bg-whatsapp text-primary-foreground shadow-lift transition hover:scale-105"
    >
      <MessageCircle className="h-7 w-7" />
    </a>
  );
}

export function PageHero({
  title,
  subtitle,
  image,
  eyebrow,
  children,
}: {
  title: string;
  subtitle?: string | null;
  image?: string | null;
  eyebrow?: string;
  children?: ReactNode;
}) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const pageBanners = useMedia("page-banner");
  const pageBanner = pageBanners.data?.find((item) => item.slot === pathname);
  const backgroundImage = pageBanner?.url || image;
  return (
    <section className="relative isolate overflow-hidden bg-brand text-brand-foreground">
      {backgroundImage && (
        <img
          src={backgroundImage}
          alt=""
          className="absolute inset-0 -z-20 h-full w-full object-cover"
          fetchPriority="high"
        />
      )}
      <div className="absolute inset-0 -z-10 bg-hero-overlay" />
      <div className="container-site py-16 sm:py-24">
        <div className="max-w-2xl animate-fade-up">
          {eyebrow && <p className="eyebrow">{eyebrow}</p>}
          <h1 className="mt-2 text-3xl font-extrabold leading-tight sm:text-5xl">{title}</h1>
          {subtitle && (
            <p className="mt-4 text-base text-brand-foreground/85 sm:text-lg">{subtitle}</p>
          )}
          {children && <div className="mt-7 flex flex-wrap gap-3">{children}</div>}
        </div>
      </div>
    </section>
  );
}

export function SectionTitle({
  eyebrow,
  title,
  subtitle,
  center,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  center?: boolean;
}) {
  return (
    <div className={cn("mb-10 max-w-2xl", center && "mx-auto text-center")}>
      {eyebrow && <p className="eyebrow">{eyebrow}</p>}
      <h2 className="mt-2 text-2xl font-bold text-brand sm:text-4xl">{title}</h2>
      {subtitle && <p className="mt-3 text-muted-foreground">{subtitle}</p>}
    </div>
  );
}

const featureIcons = [Briefcase, Wrench, Clock, Sparkles, Hammer, GraduationCap];
export function FeatureGrid({ features }: { features: { title: string; text: string }[] }) {
  return (
    <div className="grid gap-5 sm:grid-cols-3">
      {features.map((f, i) => {
        const Icon = featureIcons[i % featureIcons.length] ?? GraduationCap;
        return (
          <div key={f.title} className="rounded-xl border bg-card p-6 shadow-card">
            <span className="inline-flex h-11 w-11 items-center justify-center rounded-lg bg-accent text-primary">
              <Icon className="h-5 w-5" />
            </span>
            <h3 className="mt-4 font-bold text-brand">{f.title}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{f.text}</p>
          </div>
        );
      })}
    </div>
  );
}

export type CourseLite = {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  duration: string | null;
  fees: number | null;
  image_url: string | null;
  requirements?: string | null;
  description?: string | null;
};

export function CourseCard({ c }: { c: CourseLite }) {
  const [more, setMore] = useState(false);
  return (
    <article className="flex flex-col overflow-hidden rounded-xl border bg-card shadow-card transition hover:-translate-y-0.5 hover:shadow-lift">
      <div className="aspect-[4/3] overflow-hidden bg-muted">
        {c.image_url ? (
          <img
            src={c.image_url}
            alt={c.title}
            loading="lazy"
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            <GraduationCap className="h-10 w-10" />
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col p-5">
        <h3 className="text-lg font-bold text-brand">{c.title}</h3>
        {c.summary && <p className="mt-1.5 text-sm text-muted-foreground">{c.summary}</p>}
        {(c.duration || c.fees !== null) && (
          <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold">
            {c.duration && (
              <span className="rounded-full bg-accent px-2.5 py-1 text-brand">{c.duration}</span>
            )}
            {c.fees !== null && (
              <span className="rounded-full bg-accent px-2.5 py-1 text-primary">
                Fees: {formatKES(c.fees)}
              </span>
            )}
          </div>
        )}
        {more && (c.description || c.requirements) && (
          <div className="mt-3 space-y-2 text-sm text-muted-foreground">
            {c.description && <p>{c.description}</p>}
            {c.requirements && (
              <p>
                <span className="font-semibold text-foreground">Requirements: </span>
                {c.requirements}
              </p>
            )}
          </div>
        )}
        <div className="mt-auto flex gap-2 pt-5">
          <Button asChild variant="default" size="sm">
            <Link to="/admission" search={{ course: c.id }}>
              Apply Now
            </Link>
          </Button>
          {(c.description || c.requirements) && (
            <Button variant="outline" size="sm" onClick={() => setMore(!more)}>
              {more ? "Show less" : "Learn More"}
            </Button>
          )}
        </div>
      </div>
    </article>
  );
}

export function CardGridSkeleton({ n = 6 }: { n?: number }) {
  return (
    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: n }).map((_, i) => (
        <div key={i} className="overflow-hidden rounded-xl border">
          <Skeleton className="aspect-[4/3] w-full rounded-none" />
          <div className="space-y-2 p-5">
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-4 w-full" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  text,
  action,
}: {
  icon?: ReactNode;
  title: string;
  text?: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-dashed bg-cream/60 px-6 py-12 text-center">
      {icon && (
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-accent text-primary">
          {icon}
        </div>
      )}
      <h3 className="font-semibold text-brand">{title}</h3>
      {text && <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">{text}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorNote({
  message = "We couldn't load this right now. Please refresh the page.",
}: {
  message?: string;
}) {
  return (
    <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
      {message}
    </div>
  );
}

export function FaqSection({ schoolId }: { schoolId?: string }) {
  const { data, error } = useQuery({
    queryKey: ["faqs", schoolId ?? "general"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("faqs")
        .select("id,question,answer,category,school_id,sort_order")
        .eq("published", true)
        .order("sort_order");
      if (error) throw error;
      return (data ?? []).filter(
        (faq) => !schoolId || !faq.school_id || faq.school_id === schoolId,
      );
    },
  });
  const [searchInput, setSearchInput] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const trackedFaqIds = useRef(new Set<string>());
  const visibleFaqs = useMemo(() => {
    return searchFaqs(data ?? [], searchTerm);
  }, [data, searchTerm]);
  const groups = useMemo(() => {
    const m = new Map<string, typeof visibleFaqs>();
    visibleFaqs.forEach((f) => m.set(f.category, [...(m.get(f.category) ?? []), f]));
    return [...m.entries()];
  }, [visibleFaqs]);
  const [active, setActive] = useState<string | null>(null);
  const current = groups.find(([k]) => k === active) ?? groups[0];
  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const term = searchInput.trim().slice(0, 120);
    const normalizedTerm = normalizeFaqSearch(term);
    if (!normalizedTerm) {
      setSearchTerm("");
      return;
    }
    setSearchTerm(term);
    const match = searchFaqs(data ?? [], term)[0];
    if (term && match && !trackedFaqIds.current.has(match.id)) {
      trackedFaqIds.current.add(match.id);
      void Promise.resolve(
        supabase.rpc("record_faq_search", {
          _faq_id: match.id,
          _bucket: Math.floor(Math.random() * 16),
        }),
      )
        .then(({ error: trackingError }) => {
          if (trackingError) console.error("Could not record FAQ search insight", trackingError);
        })
        .catch((trackingError: unknown) => {
          console.error("Could not record FAQ search insight", trackingError);
        });
    }
  }
  if (error)
    return (
      <section className="bg-cream py-10">
        <div className="container-site text-center text-sm text-muted-foreground">
          Frequently asked questions are temporarily unavailable. Please contact admissions for
          assistance.
        </div>
      </section>
    );
  if (!groups.length && !searchTerm) return null;
  return (
    <section className="bg-cream py-16">
      <div className="container-site">
        <SectionTitle
          center
          title="Frequently Asked Questions"
          subtitle="Everything you need to know about Profia Institute"
        />
        <form onSubmit={submitSearch} className="mx-auto mb-8 flex max-w-2xl gap-2">
          <label className="sr-only" htmlFor="faq-search">
            Search frequently asked questions
          </label>
          <Input
            id="faq-search"
            value={searchInput}
            maxLength={120}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Search admissions, fees, courses, and more"
          />
          <Button type="submit" disabled={!searchInput.trim()}>
            <Search className="h-4 w-4" />
            Search
          </Button>
        </form>
        {searchTerm && !groups.length && (
          <p className="mb-6 text-center text-sm text-muted-foreground" role="status">
            No published FAQ matches “{searchTerm}”. Please contact admissions and we will help.
          </p>
        )}
        <div className="grid gap-6 md:grid-cols-4">
          <div className="flex gap-2 overflow-x-auto md:flex-col">
            {groups.map(([k]) => (
              <button
                key={k}
                onClick={() => setActive(k)}
                className={cn(
                  "shrink-0 rounded-lg px-4 py-3 text-left text-sm font-semibold transition",
                  current?.[0] === k
                    ? "bg-brand text-brand-foreground"
                    : "bg-background hover:bg-accent",
                )}
              >
                {k}
              </button>
            ))}
          </div>
          <div className="rounded-xl bg-background p-2 shadow-card md:col-span-3">
            <Accordion type="single" collapsible>
              {current?.[1].map((f) => (
                <AccordionItem key={f.id} value={f.id} className="px-4">
                  <AccordionTrigger className="text-left font-semibold">
                    {f.question}
                  </AccordionTrigger>
                  <AccordionContent className="text-muted-foreground">{f.answer}</AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        </div>
        {searchTerm && (
          <button
            type="button"
            className="mt-5 text-sm font-semibold text-primary underline"
            onClick={() => {
              setSearchInput("");
              setSearchTerm("");
            }}
          >
            Clear search
          </button>
        )}
      </div>
    </section>
  );
}

function normalizeFaqSearch(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function searchFaqs(faqs: FaqSearchItem[], term: string) {
  const terms = normalizeFaqSearch(term).split(" ").filter(Boolean);
  if (!terms.length) return faqs;

  return faqs
    .filter((faq) => {
      const searchableText = normalizeFaqSearch(`${faq.question} ${faq.answer} ${faq.category}`);
      return terms.every((word) => searchableText.includes(word));
    })
    .sort((left, right) => faqSearchScore(right, terms) - faqSearchScore(left, terms));
}

function faqSearchScore(faq: FaqSearchItem, terms: string[]) {
  const question = normalizeFaqSearch(faq.question);
  const answer = normalizeFaqSearch(`${faq.answer} ${faq.category}`);
  return (
    terms.reduce((score, word) => score + (question.includes(word) ? 2 : 0), 0) +
    terms.reduce((score, word) => score + (answer.includes(word) ? 1 : 0), 0)
  );
}

export function Partners() {
  const { data } = useMedia("partners");
  if (!data?.length) return null;
  return (
    <section className="py-14">
      <div className="container-site">
        <SectionTitle center title="Our Partners" />
        <div className="flex flex-wrap items-center justify-center gap-x-10 gap-y-6">
          {data.map((p) => (
            <img
              key={p.id}
              src={p.url}
              alt={p.alt ?? p.caption ?? "Partner"}
              loading="lazy"
              className="h-14 w-auto max-w-[150px] object-contain grayscale transition hover:grayscale-0 sm:h-16"
            />
          ))}
        </div>
      </div>
    </section>
  );
}

export function HomepageMedia() {
  const { data, error } = useMedia("homepage");
  if (error) return <ErrorNote />;
  if (!data?.length) return null;
  return (
    <section className="container-site py-14">
      <SectionTitle
        center
        title="Life at Profia Institute"
        subtitle="Highlights and updates from our campus."
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {data.map((item) => {
          const videoUrl = getYouTubeEmbedUrl(item.url);
          return (
            <figure key={item.id} className="overflow-hidden rounded-xl border bg-card shadow-card">
              {videoUrl ? (
                <iframe
                  src={videoUrl}
                  title={item.caption ?? "Life at Profia Institute"}
                  className="aspect-video w-full"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  referrerPolicy="strict-origin-when-cross-origin"
                  allowFullScreen
                />
              ) : (
                <img
                  src={item.url}
                  alt={item.alt ?? item.caption ?? "Profia Institute"}
                  loading="lazy"
                  className="aspect-[4/3] w-full object-cover"
                />
              )}
              {item.caption && <figcaption className="p-3 text-sm">{item.caption}</figcaption>}
            </figure>
          );
        })}
      </div>
    </section>
  );
}

export function ApplyBand({
  title = "Ready to Start Your Journey?",
  text = "Join Profia Institute and take the first step towards a successful career.",
}: {
  title?: string;
  text?: string;
}) {
  return (
    <section className="bg-gradient-brand py-14 text-brand-foreground">
      <div className="container-site flex flex-col items-start justify-between gap-5 md:flex-row md:items-center">
        <div>
          <h2 className="text-2xl font-bold sm:text-3xl">{title}</h2>
          <p className="mt-1 text-brand-foreground/80">{text}</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button asChild variant="hero" size="lg">
            <Link to="/admission" search={{}}>
              Apply Now
            </Link>
          </Button>
          <WhatsAppButton />
        </div>
      </div>
    </section>
  );
}
