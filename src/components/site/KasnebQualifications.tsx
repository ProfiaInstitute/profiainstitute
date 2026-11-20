import { Link } from "@tanstack/react-router";
import { ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";

const qualifications = [
  {
    level: "Certificate",
    courses: [
      {
        name: "Certificate in Accounting and Management (CAM)",
        url: "https://kasneb.or.ke/cam",
      },
    ],
  },
  {
    level: "Diploma",
    courses: [
      { name: "Accounting Technicians Diploma (ATD)", url: "https://kasneb.or.ke/atd" },
      {
        name: "Diploma in Data Management and Analytics (DDMA)",
        url: "https://kasneb.or.ke/ddma",
      },
      { name: "Diploma in Quality Management (DQM)", url: "https://kasneb.or.ke/dqm" },
    ],
  },
  {
    level: "Professional",
    courses: [
      { name: "Certified Public Accountants (CPA)", url: "https://kasneb.or.ke/cpa" },
      { name: "Certified Governance Secretaries (CGS)", url: "https://kasneb.or.ke/cgs" },
      {
        name: "Certified Investment and Financial Analysts (CIFA)",
        url: "https://kasneb.or.ke/cifa",
      },
      { name: "Certified Quality Professional (CQP)", url: "https://kasneb.or.ke/cqp" },
    ],
  },
  {
    level: "Post-professional",
    courses: [
      { name: "Certified Forensic Fraud Examiner (CFFE)", url: "https://kasneb.or.ke/cffe" },
      { name: "Certified Public Finance Manager (CPFM)", url: "https://kasneb.or.ke/cpfm" },
      { name: "Certified Credit Expert (CCE)", url: "https://kasneb.or.ke/cce" },
      { name: "Certified Data Analyst (CDA)", url: "https://kasneb.or.ke/cda" },
    ],
  },
];

export function KasnebQualifications() {
  return (
    <section className="container-site py-14" aria-labelledby="kasneb-qualifications">
      <div className="max-w-3xl">
        <p className="eyebrow">KASNEB examination centre · Homa Bay</p>
        <h2
          id="kasneb-qualifications"
          className="mt-3 text-2xl font-extrabold tracking-tight text-brand sm:text-3xl"
        >
          KASNEB courses and professional qualifications
        </h2>
        <p className="mt-3 leading-7 text-muted-foreground">
          Profia Institute provides KASNEB tuition and examination-centre services in Homa Bay.
          Explore the current KASNEB qualification pathways below. Intakes, eligibility and exam
          registration dates can change, so contact admissions to confirm the next available class.
        </p>
      </div>

      <div className="mt-8 grid gap-5 sm:grid-cols-2">
        {qualifications.map((group) => (
          <section key={group.level} className="rounded-xl border bg-card p-5 shadow-card">
            <h3 className="font-bold text-brand">{group.level} qualifications</h3>
            <ul className="mt-3 space-y-3">
              {group.courses.map((course) => (
                <li key={course.url}>
                  <a
                    className="inline-flex items-start gap-1 text-sm leading-6 text-foreground underline-offset-4 hover:text-primary hover:underline"
                    href={course.url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {course.name}
                    <ArrowUpRight className="mt-1 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  </a>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        <Button asChild>
          <Link to="/admission" search={{}}>
            Ask about KASNEB courses
          </Link>
        </Button>
        <Button asChild variant="outline">
          <a href="https://kasneb.or.ke/" target="_blank" rel="noopener noreferrer">
            Verify qualifications with KASNEB
          </a>
        </Button>
      </div>
      <p className="mt-4 max-w-3xl text-xs leading-5 text-muted-foreground">
        Qualification names link to KASNEB&apos;s official pages. KASNEB owns the qualifications and
        examination requirements; Profia Institute is an independent tuition provider and
        examination centre.
      </p>
    </section>
  );
}
