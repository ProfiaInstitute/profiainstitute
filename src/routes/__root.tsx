import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  useRouterState,
  HeadContent,
  Scripts,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { SiteHeader } from "@/components/site/SiteHeader";
import { SiteFooter } from "@/components/site/SiteFooter";
import { PwaInstallProvider } from "@/components/site/InstallAppButton";
import { WhatsAppFloat } from "@/components/site/common";
import { Toaster } from "@/components/ui/sonner";
import { supabase } from "@/integrations/supabase/client";
import { FACILITY_LOCATION } from "@/lib/site";

const structuredData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "EducationalOrganization",
      "@id": "https://www.profiainstitute.com/#organization",
      name: "Profia Institute",
      alternateName: "Profia Institute of Professionals",
      url: "https://www.profiainstitute.com/",
      logo: "https://www.profiainstitute.com/images/logo.png",
      email: "profiainstitute@gmail.com",
      telephone: ["+254710221122", "+254793977991"],
      sameAs: ["https://www.facebook.com/profiainstitute/"],
      address: {
        "@type": "PostalAddress",
        postOfficeBoxNumber: "323",
        addressLocality: "Homa Bay",
        postalCode: "40300",
        addressCountry: "KE",
      },
      location: { "@id": "https://www.profiainstitute.com/#location" },
    },
    {
      "@type": "Place",
      "@id": "https://www.profiainstitute.com/#location",
      name: FACILITY_LOCATION.name,
      address: {
        "@type": "PostalAddress",
        addressLocality: "Homa Bay",
        addressCountry: "KE",
      },
      geo: {
        "@type": "GeoCoordinates",
        latitude: FACILITY_LOCATION.latitude,
        longitude: FACILITY_LOCATION.longitude,
      },
      hasMap: FACILITY_LOCATION.googleMapsUrl,
    },
    {
      "@type": "WebSite",
      "@id": "https://www.profiainstitute.com/#website",
      name: "Profia Institute",
      url: "https://www.profiainstitute.com/",
      publisher: { "@id": "https://www.profiainstitute.com/#organization" },
    },
  ],
};

function NotFoundComponent() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-brand">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: ErrorComponentProps) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { name: "theme-color", content: "#680915" },
      { name: "mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-title", content: "Profia Institute" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
      { name: "author", content: "Profia Institute" },
      { property: "og:site_name", content: "Profia Institute" },
      { property: "og:image", content: "https://www.profiainstitute.com/images/logo.png" },
      { property: "og:image:alt", content: "Profia Institute, Homa Bay" },
      { name: "twitter:image", content: "https://www.profiainstitute.com/images/logo.png" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", type: "image/png", href: "/favicon.png" },
      { rel: "apple-touch-icon", href: "/images/logo.png" },
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
        />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const router = useRouter();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isFacilitatorApp = pathname.startsWith("/facilitator");
  const isApp =
    pathname.startsWith("/admin") || pathname.startsWith("/student") || isFacilitatorApp;

  useEffect(() => {
    const manifestLink = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
    if (manifestLink) {
      manifestLink.href = isFacilitatorApp ? "/facilitator.webmanifest" : "/manifest.webmanifest";
    }
  }, [isFacilitatorApp]);

  useEffect(() => {
    if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;
    void navigator.serviceWorker.register("/sw.js").catch((error: unknown) => {
      console.error("Could not register the Profia app service worker:", error);
    });
  }, []);

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED") return;
      router.invalidate();
      if (event !== "SIGNED_OUT") queryClient.invalidateQueries();
    });
    return () => data.subscription.unsubscribe();
  }, [router, queryClient]);

  return (
    <QueryClientProvider client={queryClient}>
      <PwaInstallProvider>
        {!isApp && <SiteHeader />}
        <main>
          <div key={pathname} className={isApp ? undefined : "page-transition"}>
            <Outlet />
          </div>
        </main>
        {!isApp && <SiteFooter />}
        {!isApp && <WhatsAppFloat />}
        <Toaster richColors position="top-center" />
      </PwaInstallProvider>
    </QueryClientProvider>
  );
}
