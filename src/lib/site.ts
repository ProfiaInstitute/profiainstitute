import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";

export type GeneralSettings = {
  institution_name: string;
  tagline?: string;
  logo_url: string;
  phones: string[];
  email: string;
  address: string;
  location?: string;
  whatsapp: string;
  facebook?: string;
  instagram?: string;
  twitter?: string;
  tiktok?: string;
  youtube?: string;
  footer_text?: string;
  seo_title?: string;
  seo_description?: string;
};

export const DEFAULT_GENERAL: GeneralSettings = {
  institution_name: "Profia Institute",
  tagline: "Institute of Professionals",
  logo_url: "/images/logo.png",
  phones: ["0710221122", "0793977991"],
  email: "profiainstitute@gmail.com",
  address: "P.O Box 323-40300, Homa Bay",
  whatsapp: "254710221122",
  facebook: "https://www.facebook.com/profiainstitute/",
  footer_text: "Profia Institute. All Rights Reserved",
};

export function useSettings() {
  return useQuery({
    queryKey: ["site_settings"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("site_settings").select("key,value");
      if (error) throw error;
      const map: Record<string, Json> = {};
      for (const r of data ?? []) map[r.key] = r.value;
      return map;
    },
  });
}

export function useSetting<T extends object>(key: string, fallback: T): T {
  const { data } = useSettings();
  const value = data?.[key];
  if (!value || typeof value !== "object" || Array.isArray(value)) return fallback;
  return Object.assign({}, fallback, value);
}

export function useGeneral(): GeneralSettings {
  return useSetting<GeneralSettings>("general", DEFAULT_GENERAL);
}

export function whatsappLink(num: string, text?: string) {
  const n = (num || "").replace(/\D/g, "").replace(/^0/, "254");
  return `https://wa.me/${n}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
}

export function formatKES(n: number | null | undefined) {
  if (n === null || n === undefined) return null;
  return `KES ${Number(n).toLocaleString("en-KE")}`;
}

export const SCHOOL_ROUTES: Record<string, string> = {
  business: "/business",
  ict: "/ict",
  hospitality: "/hospitality",
  cosmetology: "/cosmetology",
  engineering: "/engineering",
};

export type School = {
  id: string;
  slug: string;
  name: string;
  short_name: string | null;
  tagline: string | null;
  description: string | null;
  hero_image: string | null;
  features: { title: string; text: string }[];
  online_summary: string | null;
  online_course_count: number | null;
  sort_order: number;
};

export function useSchools() {
  return useQuery({
    queryKey: ["schools"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("schools")
        .select("*")
        .eq("published", true)
        .order("sort_order");
      if (error) throw error;
      return (data ?? []) as unknown as School[];
    },
  });
}

export function useCourses(schoolId?: string) {
  return useQuery({
    queryKey: ["courses", schoolId ?? "all"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      let q = supabase.from("courses").select("*").eq("published", true).order("sort_order");
      if (schoolId) q = q.eq("school_id", schoolId);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useActiveIntake() {
  return useQuery({
    queryKey: ["active-intake"],
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("intakes")
        .select("id,name,start_date,application_deadline,notes")
        .eq("is_open", true)
        .or(
          `application_deadline.is.null,application_deadline.gte.${new Date().toISOString().slice(0, 10)}`,
        )
        .order("start_date", { ascending: true, nullsFirst: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export function useMedia(category: string) {
  return useQuery({
    queryKey: ["media", category],
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("media")
        .select("id,url,caption,alt,sort_order")
        .eq("category", category)
        .eq("published", true)
        .order("sort_order");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export const STATUS_LABELS: Record<string, string> = {
  submitted: "Submitted",
  under_review: "Under Review",
  accepted: "Accepted",
  rejected: "Rejected",
  waitlisted: "Waitlisted",
  more_info_required: "More Information Required",
  enrolled: "Enrolled",
};
export const STUDY_MODES: Record<string, string> = {
  full_time: "Full Time",
  part_time: "Part Time",
  online: "Online",
};

const SITE_URL = "https://www.profiainstitute.com";
const SITE_CREATOR_NAME = "Victor Otieno Ochieng";

export function seo(title: string, description: string, path: string, image?: string) {
  const canonicalUrl = `${SITE_URL}${path}`;
  const socialImage = image?.startsWith("http")
    ? image
    : `${SITE_URL}${image ? (image.startsWith("/") ? image : `/${image}`) : "/images/logo.png"}`;
  const isPrivateRoute = path === "/admin" || path.startsWith("/student");
  const meta: {
    title?: string;
    name?: string;
    property?: string;
    content?: string;
  }[] = [
    { title },
    { name: "description", content: description },
    { name: "author", content: SITE_CREATOR_NAME },
    { name: "creator", content: SITE_CREATOR_NAME },
    { name: "robots", content: isPrivateRoute ? "noindex,nofollow" : "index,follow" },
    { property: "og:title", content: title },
    { property: "og:description", content: description },
    { property: "og:type", content: "website" },
    { property: "og:url", content: canonicalUrl },
    { property: "og:site_name", content: "Profia Institute" },
    { property: "og:locale", content: "en_KE" },
    { property: "og:image", content: socialImage },
    { name: "twitter:title", content: title },
    { name: "twitter:description", content: description },
    { name: "twitter:image", content: socialImage },
    { name: "twitter:card", content: "summary_large_image" },
  ];
  return { meta, links: [{ rel: "canonical", href: canonicalUrl }] };
}
