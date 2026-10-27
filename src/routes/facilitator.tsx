import { createFileRoute } from "@tanstack/react-router";
import { FacilitatorPortal } from "@/components/facilitator/FacilitatorPortal";
import { seo } from "@/lib/site";

export const Route = createFileRoute("/facilitator")({
  head: () =>
    seo("Facilitator Portal — Profia Institute", "Facilitator teaching portal.", "/facilitator"),
  component: FacilitatorPortal,
});
