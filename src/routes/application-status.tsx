import { createFileRoute } from "@tanstack/react-router";
import { seo } from "@/lib/site";
import { ApplicationStatusLookup } from "@/components/site/OnlineApplication";

export const Route = createFileRoute("/application-status")({
  validateSearch: (search: Record<string, unknown>): { number?: string } => ({
    ...(typeof search["number"] === "string" ? { number: search["number"] } : {}),
  }),
  head: () =>
    seo(
      "Application Status — Profia Institute",
      "Application Status at Profia Institute, Homa Bay.",
      "/application-status",
    ),
  component: ApplicationStatusPage,
});

function ApplicationStatusPage() {
  const { number } = Route.useSearch();
  return (
    <>
      <section className="bg-brand py-12 text-brand-foreground sm:py-16">
        <div className="container-site">
          <p className="eyebrow">Admissions · Profia Institute</p>
          <h1 className="mt-2 text-3xl font-extrabold sm:text-5xl">Application status</h1>
          <p className="mt-3 text-brand-foreground/85">
            Check your application using your reference number and the contact information you
            provided.
          </p>
        </div>
      </section>
      <section className="container-site py-10 sm:py-14">
        <ApplicationStatusLookup {...(number ? { initialNumber: number } : {})} />
      </section>
    </>
  );
}
