import { createFileRoute } from "@tanstack/react-router";
import { seo } from "@/lib/site";
import { OnlineApplication } from "@/components/site/OnlineApplication";

export const Route = createFileRoute("/admission")({
  validateSearch: (search: Record<string, unknown>): { course?: string; level?: string } => ({
    ...(typeof search["course"] === "string" ? { course: search["course"] } : {}),
    ...(typeof search["level"] === "string" ? { level: search["level"] } : {}),
  }),
  head: () =>
    seo(
      "Apply to Profia Institute — Admissions in Homa Bay",
      "Apply to study at Profia Institute in Homa Bay. Submit an online application for professional and technical training.",
      "/admission",
    ),
  component: AdmissionPage,
});

function AdmissionPage() {
  const { course, level } = Route.useSearch();
  return (
    <>
      <section className="bg-brand py-12 text-brand-foreground sm:py-16">
        <div className="container-site">
          <p className="eyebrow">Admissions · Profia Institute</p>
          <h1 className="mt-2 text-3xl font-extrabold sm:text-5xl">Apply to study with us</h1>
          <p className="mt-3 max-w-2xl text-brand-foreground/85">
            Submit your application online. Our admissions team will review it and contact you using
            the details provided.
          </p>
        </div>
      </section>
      <section className="container-site py-10 sm:py-14">
        <OnlineApplication
          {...(course ? { initialCourseId: course } : {})}
          {...(level ? { initialLevelId: level } : {})}
        />
      </section>
    </>
  );
}
