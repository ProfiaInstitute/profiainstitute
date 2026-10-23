import { createFileRoute } from "@tanstack/react-router";
import { seo } from "@/lib/site";
import { StudentPortal } from "@/components/student/StudentPortal";

export const Route = createFileRoute("/student")({
  validateSearch: (search: Record<string, unknown>) => ({
    course: typeof search["course"] === "string" ? search["course"] : undefined,
  }),
  head: () =>
    seo(
      "Student Portal — Profia Institute",
      "Student Portal at Profia Institute, Homa Bay.",
      "/student",
    ),
  component: StudentRoute,
});

function StudentRoute() {
  const { course } = Route.useSearch();
  return <StudentPortal selectedCourseId={course ?? null} />;
}
