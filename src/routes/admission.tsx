import { createFileRoute } from "@tanstack/react-router";
import { seo } from "@/lib/site";
import { OnlineApplication } from "@/components/site/OnlineApplication";
import { PageHero } from "@/components/site/common";

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
      <PageHero
        title="Apply to study with us"
        subtitle="Submit your application online. Our admissions team will review it and contact you using the details provided."
        eyebrow="Admissions · Profia Institute"
      />
      <section className="container-site py-10 sm:py-14">
        <OnlineApplication
          {...(course ? { initialCourseId: course } : {})}
          {...(level ? { initialLevelId: level } : {})}
        />
      </section>
    </>
  );
}
