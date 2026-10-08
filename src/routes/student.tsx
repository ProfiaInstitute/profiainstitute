import { createFileRoute } from "@tanstack/react-router";
import { seo } from "@/lib/site";
import { StudentPortal } from "@/components/student/StudentPortal";

export const Route = createFileRoute("/student")({
  head: () =>
    seo(
      "Student Portal — Profia Institute",
      "Student Portal at Profia Institute, Homa Bay.",
      "/student",
    ),
  component: StudentPortal,
});
