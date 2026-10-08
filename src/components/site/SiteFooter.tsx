import { Link } from "@tanstack/react-router";
import { Facebook, Mail, MapPin, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useActiveIntake, useGeneral, whatsappLink } from "@/lib/site";

export function SiteFooter() {
  const g = useGeneral();
  const activeIntake = useActiveIntake();
  return (
    <footer className="bg-brand-deep text-brand-foreground">
      <div className="bg-gradient-brand">
        <div className="container-site flex flex-col items-start justify-between gap-4 py-10 md:flex-row md:items-center">
          <div>
            <h2 className="text-2xl font-bold">Ready to start your journey?</h2>
            <p className="mt-1 text-brand-foreground/80">
              {activeIntake.isLoading
                ? "Checking current admissions…"
                : activeIntake.error
                  ? "Contact admissions for current application details."
                  : activeIntake.data
                    ? `Applications are open for the ${activeIntake.data.name}${
                        activeIntake.data.application_deadline
                          ? ` Apply by ${new Date(`${activeIntake.data.application_deadline}T00:00:00`).toLocaleDateString("en-KE", { dateStyle: "medium" })}.`
                          : ""
                      }`
                    : "There is no active intake at the moment. Contact admissions for upcoming dates."}
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button asChild variant="hero" size="lg">
              <Link to="/admission" search={{}}>
                Apply Now
              </Link>
            </Button>
            <Button asChild variant="heroOutline" size="lg">
              <a href={whatsappLink(g.whatsapp)} target="_blank" rel="noopener noreferrer">
                Chat on WhatsApp
              </a>
            </Button>
          </div>
        </div>
      </div>
      <div className="container-site grid gap-10 py-12 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <div className="inline-block rounded-lg bg-background p-2">
            <img
              src={g.logo_url}
              alt="Profia Institute logo"
              width={64}
              height={64}
              loading="lazy"
              className="h-16 w-auto"
            />
          </div>
          <p className="mt-4 text-sm text-brand-foreground/75">
            TVET accredited college in Homa Bay offering business, ICT, hospitality, cosmetology and
            engineering programmes.
          </p>
          {g.facebook && (
            <a
              href={g.facebook}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Facebook"
              className="mt-4 inline-flex h-9 w-9 items-center justify-center rounded-full bg-brand-foreground/10 hover:bg-primary"
            >
              <Facebook className="h-4 w-4" />
            </a>
          )}
        </div>
        <div>
          <h3 className="mb-3 font-semibold">Quick links</h3>
          <ul className="space-y-2 text-sm text-brand-foreground/80">
            <li>
              <Link to="/about" className="hover:text-primary">
                About us
              </Link>
            </li>
            <li>
              <Link to="/contact" className="hover:text-primary">
                Contact
              </Link>
            </li>
            <li>
              <Link to="/articles" className="hover:text-primary">
                News & updates
              </Link>
            </li>
            <li>
              <Link to="/announcements" className="hover:text-primary">
                Announcements
              </Link>
            </li>
            <li>
              <Link to="/tech-hub" className="hover:text-primary">
                Tech hub
              </Link>
            </li>
            <li>
              <Link to="/application-status" search={{}} className="hover:text-primary">
                Track application
              </Link>
            </li>
            <li>
              <Link to="/student" className="hover:text-primary">
                Student portal
              </Link>
            </li>
          </ul>
        </div>
        <div>
          <h3 className="mb-3 font-semibold">Academics</h3>
          <ul className="space-y-2 text-sm text-brand-foreground/80">
            <li>
              <Link to="/ict" className="hover:text-primary">
                School of ICT
              </Link>
            </li>
            <li>
              <Link to="/business" className="hover:text-primary">
                School of Business
              </Link>
            </li>
            <li>
              <Link to="/hospitality" className="hover:text-primary">
                School of Hospitality
              </Link>
            </li>
            <li>
              <Link to="/engineering" className="hover:text-primary">
                School of Engineering
              </Link>
            </li>
            <li>
              <Link to="/cosmetology" className="hover:text-primary">
                School of Beauty/Cosmetology
              </Link>
            </li>
          </ul>
        </div>
        <div>
          <h3 className="mb-3 font-semibold">Contact</h3>
          <ul className="space-y-3 text-sm text-brand-foreground/80">
            <li className="flex gap-2">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              {g.address}
            </li>
            <li className="flex gap-2">
              <Mail className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <a href={`mailto:${g.email}`} className="break-all hover:text-primary">
                {g.email}
              </a>
            </li>
            <li className="flex gap-2">
              <Phone className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <span>
                {g.phones?.map((p, i) => (
                  <a key={p} href={`tel:${p}`} className="hover:text-primary">
                    {i > 0 && " | "}
                    {p}
                  </a>
                ))}
              </span>
            </li>
          </ul>
        </div>
      </div>
      <div className="border-t border-brand-foreground/10">
        <div className="container-site py-5 text-center text-xs text-brand-foreground/60">
          © {new Date().getFullYear()} {g.footer_text || "Profia Institute. All Rights Reserved"}
        </div>
      </div>
    </footer>
  );
}
