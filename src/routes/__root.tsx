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
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/react";

import appCss from "../styles.css?url";
import "@/components/PageLoadOverlay.css";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { SiteHeader } from "@/components/site/SiteHeader";
import { SiteFooter } from "@/components/site/SiteFooter";
import { PwaInstallProvider } from "@/components/site/InstallAppButton";
import { WhatsAppFloat } from "@/components/site/common";
import { Toaster } from "@/components/ui/sonner";
import { supabase } from "@/integrations/supabase/client";
import { FACILITY_LOCATION } from "@/lib/site";
import { useScrollReveal } from "@/lib/motion";
import { DownloadPrintAnimation } from "@/components/site/DownloadPrintAnimation";
import { signOutWithAudit } from "@/lib/auth";
import { clearSessionActivity, watchSessionInactivity } from "@/lib/session-security";
import { toast } from "sonner";
import { StaffMfaGate } from "@/components/auth/StaffMfaGate";

const structuredData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "EducationalOrganization",
      "@id": "https://www.profiainstitute.com/#organization",
      name: "Profia Institute",
      alternateName: "Profia Institute of Professionals",
      description:
        "TVET college and approved KASNEB examination centre and tuition provider in Homa Bay, Kenya.",
      url: "https://www.profiainstitute.com/",
      logo: "https://www.profiainstitute.com/images/logo.png",
      email: "profiainstitute@gmail.com",
      telephone: ["+254710221122", "+254793977991"],
      contactPoint: [
        {
          "@type": "ContactPoint",
          contactType: "admissions",
          telephone: "+254710221122",
          email: "profiainstitute@gmail.com",
          areaServed: "KE",
        },
      ],
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

function PageLoadOverlay() {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timeout = window.setTimeout(() => setVisible(false), 520);
    return () => window.clearTimeout(timeout);
  }, []);

  if (!visible) return null;

  return (
    <div className="page-load-overlay" role="status" aria-label="Loading Profia Institute">
      <div className="page-load-brand">
        <img className="page-load-logo" src="/images/logo.png" alt="" />
        <img className="page-load-badge" src="/favicon.png" alt="" />
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
  const { pathname, route } = useRouterState({
    select: (state) => ({
      pathname: state.location.pathname,
      route: state.matches[state.matches.length - 1]?.routeId ?? state.location.pathname,
    }),
  });
  const portalPath = pathname.toLowerCase();
  const isFacilitatorApp = portalPath.startsWith("/facilitator");
  const isStudentApp = portalPath.startsWith("/student");
  const isApp = portalPath.startsWith("/admin") || isStudentApp || isFacilitatorApp;
  const manifestHref = isFacilitatorApp
    ? "/facilitator.webmanifest"
    : isStudentApp
      ? "/student.webmanifest"
      : "/manifest.webmanifest";
  const publicContentRef = useRef<HTMLDivElement>(null);
  useScrollReveal(publicContentRef, pathname, true, !isApp);

  useEffect(() => {
    if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;
    void navigator.serviceWorker.register("/sw.js").catch((error: unknown) => {
      console.error("Could not register the Profia app service worker:", error);
    });
  }, []);

  useEffect(() => {
    let heartbeat: ReturnType<typeof setInterval> | undefined;
    let mounted = true;
    let updatingPresence = false;
    let inactivityCleanup: (() => void) | undefined;
    let inactivityUserId: string | null = null;
    const stopPresence = () => {
      if (heartbeat !== undefined) clearInterval(heartbeat);
      heartbeat = undefined;
    };
    const syncSessionInactivity = (userId?: string) => {
      if (userId === inactivityUserId) return;
      inactivityCleanup?.();
      inactivityCleanup = undefined;
      if (inactivityUserId) clearSessionActivity(inactivityUserId);
      inactivityUserId = userId ?? null;
      if (!userId) return;
      inactivityCleanup = watchSessionInactivity(userId, async () => {
        stopPresence();
        const result = await signOutWithAudit("local");
        if (!result.signedOut) {
          toast.error("Could not end the inactive session", {
            description: result.error?.message,
          });
          return false;
        }
        toast.info("You were signed out after 5 minutes of inactivity.");
        if (result.error) {
          toast.error("The session ended, but sign-out activity could not be fully recorded.", {
            description: result.error.message,
          });
        }
        return true;
      });
    };
    const updatePresence = async () => {
      if (updatingPresence) return;
      updatingPresence = true;
      try {
        const { error } = await supabase.rpc("heartbeat_presence");
        if (error) console.error("Could not update online presence:", error);
      } catch (error) {
        console.error("Could not update online presence:", error);
      } finally {
        updatingPresence = false;
      }
    };
    const startPresence = () => {
      if (heartbeat !== undefined) return;
      void updatePresence();
      heartbeat = setInterval(() => void updatePresence(), 25_000);
    };

    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      syncSessionInactivity(session?.user.id);
      if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED") return;
      if (event === "SIGNED_IN" || event === "SIGNED_OUT") queryClient.clear();
      router.invalidate();
      if (event === "USER_UPDATED") void queryClient.invalidateQueries();
      if (event === "SIGNED_IN") {
        window.setTimeout(() => {
          void supabase.rpc("log_auth_event", { _event: "sign_in" }).then(
            ({ error }) => {
              if (error) console.error("Could not record sign-in activity:", error);
            },
            (error: unknown) => {
              console.error("Could not record sign-in activity:", error);
            },
          );
          if (session?.user) startPresence();
        }, 0);
      } else if (event === "SIGNED_OUT") {
        stopPresence();
      }
    });

    void supabase.auth.getSession().then(
      ({ data: sessionData, error }) => {
        if (error) {
          console.error("Could not restore the session for online presence:", error);
          return;
        }
        if (mounted && sessionData.session?.user) {
          syncSessionInactivity(sessionData.session.user.id);
          startPresence();
        }
      },
      (error: unknown) => {
        console.error("Could not restore the session for online presence:", error);
      },
    );

    return () => {
      mounted = false;
      stopPresence();
      inactivityCleanup?.();
      data.subscription.unsubscribe();
    };
  }, [router, queryClient]);

  return (
    <QueryClientProvider client={queryClient}>
      <PwaInstallProvider manifestHref={manifestHref}>
        <PageLoadOverlay />
        {!isApp && <SiteHeader />}
        <main>
          <div
            ref={publicContentRef}
            key={pathname}
            className={isApp ? undefined : "page-transition"}
          >
            <StaffMfaGate>
              <Outlet />
            </StaffMfaGate>
          </div>
        </main>
        {!isApp && <SiteFooter />}
        {!isApp && <WhatsAppFloat />}
        <Toaster position="bottom-right" />
        <DownloadPrintAnimation />
        <Analytics route={route} path={pathname} />
        <SpeedInsights />
      </PwaInstallProvider>
    </QueryClientProvider>
  );
}
