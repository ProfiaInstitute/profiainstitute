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

export function SchoolPage({ slug, whyTitle }: { slug: string; whyTitle: string }) {
  const schools = useSchools();
  const school = schools.data?.find((s) => s.slug === slug);
  const courses = useCourses(school?.id);

  if (schools.isLoading)
    return (
      <div className="container-site py-16">
        <CardGridSkeleton />
      </div>
    );
  if (schools.error)
    return (
      <div className="container-site py-16">
        <ErrorNote />
      </div>
    );
  if (!school)
    return (
      <div className="container-site py-16">
        <EmptyState title="This school page is not available right now." />
      </div>
    );

  return (
    <>
      <PageHero
        title={school.tagline || school.name}
        subtitle={school.description}
        image={school.hero_image}
        eyebrow={school.name}
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
  );
}
