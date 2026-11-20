import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { GraduationCap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCourses, useSchools } from "@/lib/site";
import {
  CardGridSkeleton,
  CourseCard,
  EmptyState,
  ErrorNote,
  FaqSection,
  FeatureGrid,
  PageHero,
  SectionTitle,
} from "./common";

export function SchoolPage({
  slug,
  whyTitle,
  fallbackTitle,
  fallbackDescription,
  contentAfterHero,
}: {
  slug: string;
  whyTitle: string;
  fallbackTitle: string;
  fallbackDescription: string;
  contentAfterHero?: ReactNode;
}) {
  const schools = useSchools();
  const school = schools.data?.find((s) => s.slug === slug);
  const courses = useCourses(school?.id);

  return (
    <>
      <PageHero
        title={fallbackTitle}
        subtitle={
          school?.description ? `${fallbackDescription} ${school.description}` : fallbackDescription
        }
        image={school?.hero_image ?? null}
        eyebrow={school?.name ? `${school.name} · Homa Bay, Kenya` : "Profia Institute · Homa Bay"}
      >
        <Button asChild variant="hero" size="lg">
          <Link to="/admission" search={{}}>
            Apply Now
          </Link>
        </Button>
        <Button asChild variant="heroOutline" size="lg">
          <a href="#courses">Explore Courses</a>
        </Button>
      </PageHero>
      {contentAfterHero}

      {schools.isLoading ? (
        <section className="container-site py-16">
          <CardGridSkeleton />
        </section>
      ) : schools.error ? (
        <section className="container-site py-16">
          <ErrorNote />
        </section>
      ) : school ? (
        <>
          {school.features?.length > 0 && (
            <section className="py-16">
              <div className="container-site">
                <SectionTitle center title={whyTitle} />
                <FeatureGrid features={school.features} />
              </div>
            </section>
          )}

          <section id="courses" className="scroll-mt-28 bg-muted/40 py-16">
            <div className="container-site">
              <SectionTitle
                title="Our Courses"
                subtitle={`Programmes offered by the ${school.name}.`}
              />
              {courses.isLoading ? (
                <CardGridSkeleton />
              ) : courses.error ? (
                <ErrorNote />
              ) : courses.data?.length ? (
                <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                  {courses.data.map((c) => (
                    <CourseCard key={c.id} c={c} />
                  ))}
                </div>
              ) : (
                <EmptyState
                  icon={<GraduationCap className="h-5 w-5" />}
                  title="Courses will be listed here soon"
                  text="Contact admissions for the latest programmes in this school."
                />
              )}
            </div>
          </section>

          <FaqSection schoolId={school.id} />
        </>
      ) : (
        <section className="container-site py-16">
          <EmptyState title="This school page is not available right now." />
        </section>
      )}
    </>
  );
}
