import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { ChevronDown, Menu, Phone, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useGeneral } from "@/lib/site";
import { InstallAppButton } from "@/components/site/InstallAppButton";

const schools = [
  { to: "/business", label: "School of Business" },
  { to: "/ict", label: "School of ICT" },
  { to: "/hospitality", label: "School of Hospitality" },
  { to: "/engineering", label: "School of Engineering" },
  { to: "/cosmetology", label: "School of Beauty/Cosmetology" },
] as const;

const main = [
  { to: "/", label: "Home" },
  { to: "/about", label: "About Us" },
  { to: "/academics", label: "Academics" },
  { to: "/online-courses", label: "Online Courses" },
  { to: "/tech-hub", label: "Tech Hub" },
  { to: "/admission", label: "Admission" },
  { to: "/articles", label: "News & Updates" },
  { to: "/contact", label: "Contact" },
] as const;

export function SiteHeader() {
  const g = useGeneral();
  const [open, setOpen] = useState(false);
  const phone = g.phones?.[0] ?? "";

  return (
    <header className="sticky top-0 z-40">
      <div className="bg-brand text-brand-foreground text-xs sm:text-sm">
        <div className="container-site flex h-9 items-center justify-between gap-4">
          <a href={`tel:${phone}`} className="flex items-center gap-1.5 hover:text-primary">
            <Phone className="h-3.5 w-3.5" /> {phone.replace(/(\d{4})(\d{3})(\d{3})/, "$1 $2 $3")}
          </a>
          <div className="flex items-center gap-4">
            <Link
              to="/application-status"
              search={{}}
              className="hidden sm:inline hover:text-primary"
            >
              Track application
            </Link>
            <Link to="/student" search={{ course: undefined }} className="hover:text-primary">
              Student portal
            </Link>
            <Link to="/contact" className="hidden sm:inline hover:text-primary">
              Enquiries
            </Link>
          </div>
        </div>
      </div>
      <div className="border-b bg-background/95 backdrop-blur">
        <div className="container-site flex h-16 items-center justify-between gap-4 lg:h-20">
          <Link
            to="/"
            className="flex shrink-0 items-center gap-2"
            aria-label="Profia Institute home"
          >
            <img
              src={g.logo_url}
              alt="Profia Institute logo"
              width={56}
              height={56}
              className="h-11 w-auto lg:h-14"
            />
          </Link>
          <nav className="hidden items-center gap-1 lg:flex" aria-label="Main">
            {main.map((m) =>
              m.to === "/academics" ? (
                <div key={m.to} className="group relative">
                  <Link
                    to="/academics"
                    className="flex items-center gap-1 rounded-md px-3 py-2 text-sm font-semibold text-foreground hover:text-primary"
                    activeProps={{ className: "text-primary" }}
                  >
                    Academics <ChevronDown className="h-3.5 w-3.5" />
                  </Link>
                  <div className="invisible absolute left-0 top-full w-64 rounded-lg border bg-popover p-2 opacity-0 shadow-card transition group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100">
                    {schools.map((s) => (
                      <Link
                        key={s.to}
                        to={s.to}
                        className="block rounded-md px-3 py-2 text-sm hover:bg-accent hover:text-brand"
                      >
                        {s.label}
                      </Link>
                    ))}
                  </div>
                </div>
              ) : (
                <Link
                  key={m.to}
                  to={m.to}
                  className="rounded-md px-3 py-2 text-sm font-semibold text-foreground hover:text-primary"
                  activeProps={{ className: "text-primary" }}
                  activeOptions={{ exact: m.to === "/" }}
                >
                  {m.label}
                </Link>
              ),
            )}
          </nav>
          <div className="flex items-center gap-2">
            <InstallAppButton />
            <Button asChild variant="hero" className="px-4 sm:px-6">
              <Link to="/admission" search={{}}>
                Apply Now
              </Link>
            </Button>
            <button
              className="inline-flex h-10 w-10 items-center justify-center rounded-md border lg:hidden"
              onClick={() => setOpen(!open)}
              aria-label={open ? "Close menu" : "Open menu"}
              aria-expanded={open}
            >
              {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>
        {open && (
          <nav
            className="max-h-[75vh] overflow-y-auto border-t bg-background lg:hidden"
            aria-label="Mobile"
          >
            <div className="container-site py-3">
              {main.map((m) => (
                <div key={m.to}>
                  <Link
                    to={m.to}
                    onClick={() => setOpen(false)}
                    className="block rounded-md px-3 py-3 text-base font-semibold hover:bg-accent"
                    activeProps={{ className: "text-primary" }}
                    activeOptions={{ exact: true }}
                  >
                    {m.label}
                  </Link>
                  {m.to === "/academics" && (
                    <div className="ml-3 border-l pl-3">
                      {schools.map((s) => (
                        <Link
                          key={s.to}
                          to={s.to}
                          onClick={() => setOpen(false)}
                          className="block px-3 py-2.5 text-sm text-muted-foreground hover:text-brand"
                        >
                          {s.label}
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              ))}
              <div className="mt-3 grid grid-cols-2 gap-2 border-t pt-3">
                <Button asChild variant="outline">
                  <Link to="/student" search={{ course: undefined }} onClick={() => setOpen(false)}>
                    Student portal
                  </Link>
                </Button>
                <Button asChild variant="outline">
                  <Link to="/application-status" search={{}} onClick={() => setOpen(false)}>
                    Track application
                  </Link>
                </Button>
              </div>
            </div>
          </nav>
        )}
      </div>
    </header>
  );
}
