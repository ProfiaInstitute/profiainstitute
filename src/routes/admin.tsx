import { createFileRoute } from "@tanstack/react-router";
import { seo } from "@/lib/site";
import { StaffDashboard } from "@/components/admin/StaffDashboard";

export const Route = createFileRoute("/admin")({
  head: () => seo("Admin — Profia Institute", "Admin at Profia Institute, Homa Bay.", "/admin"),
  component: StaffDashboard,
});
