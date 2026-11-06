import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { CalendarDays, CheckCircle2, Clock3, MapPin, Monitor, UsersRound } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import type { Json, Tables } from "@/integrations/supabase/types";
import { formatKES } from "@/lib/site";

type Track = Tables<"holiday_program_tracks">;
type Period = Tables<"holiday_program_periods">;
type Module = Tables<"holiday_program_modules">;

const fieldClass = "grid gap-1.5 text-sm font-medium";
const emptyPeriods: Period[] = [];
const emptyModules: Module[] = [];
const nairobiDate = () =>
  new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Africa/Nairobi",
  }).format(new Date());

export function HolidayProgramPage({
  initialTrack = "general",
}: {
  initialTrack?: "general" | "kids";
}) {
  const [trackKey, setTrackKey] = useState<"general" | "kids">(initialTrack);
  const [periodId, setPeriodId] = useState("");
  const [moduleIds, setModuleIds] = useState<string[]>([]);
  const [confirmationCode, setConfirmationCode] = useState("");
  const query = useQuery({
    queryKey: ["public-holiday-program", trackKey],
    queryFn: async () => {
      const { data: track, error: trackError } = await supabase
        .from("holiday_program_tracks")
        .select("*")
        .eq("track_key", trackKey)
        .eq("published", true)
        .maybeSingle();
      if (trackError) throw trackError;
      if (!track) return { track: null, periods: [], modules: [], periodModules: [] };
      const [periodResult, moduleResult, linkResult] = await Promise.all([
        supabase
          .from("holiday_program_periods")
          .select("*")
          .eq("track_id", track.id)
          .eq("status", "open")
          .gte("ends_on", nairobiDate())
          .order("starts_on"),
        supabase
          .from("holiday_program_modules")
          .select("*")
          .eq("track_id", track.id)
          .eq("active", true)
          .order("title"),
        supabase.from("holiday_program_period_modules").select("period_id,module_id"),
      ]);
      if (periodResult.error) throw periodResult.error;
      if (moduleResult.error) throw moduleResult.error;
      if (linkResult.error) throw linkResult.error;
      return {
        track,
        periods: periodResult.data,
        modules: moduleResult.data,
        periodModules: linkResult.data,
      };
    },
  });
  const track = query.data?.track ?? null;
  const periods = query.data?.periods ?? emptyPeriods;
  const modules = query.data?.modules ?? emptyModules;
  const selectedPeriod = periods.find((period) => period.id === periodId) ?? null;
  const availableModules = useMemo(() => {
    if (!selectedPeriod) return [];
    const assigned = new Set(
      (query.data?.periodModules ?? [])
        .filter((link) => link.period_id === selectedPeriod.id)
        .map((link) => link.module_id),
    );
    return modules.filter((module) => assigned.has(module.id));
  }, [modules, query.data?.periodModules, selectedPeriod]);

  useEffect(() => {
    setPeriodId("");
    setModuleIds([]);
    setConfirmationCode("");
  }, [trackKey]);

  const submitMutation = useMutation({
    mutationFn: async (payload: Json) => {
      const { data, error } = await supabase.rpc("submit_holiday_program_application", {
        p: payload,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (code) => {
      setConfirmationCode(code);
      toast.success("Your holiday program application has been received");
    },
    onError: (error) => toast.error(error.message),
  });

  function submitApplication(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!track || !selectedPeriod || !availableModules.length || !moduleIds.length) {
      toast.error("Choose an open period and at least one available module.");
      return;
    }
    const formData = new FormData(event.currentTarget);
    const payload: Json = {
      period_id: selectedPeriod.id,
      applicant_name: String(formData.get("applicant-name") ?? "").trim(),
      applicant_age: track.track_key === "kids" ? Number(formData.get("applicant-age")) : null,
      phone: String(formData.get("phone") ?? "").trim(),
      email: String(formData.get("email") ?? "").trim() || null,
      location: String(formData.get("location") ?? "").trim(),
      guardian_name: String(formData.get("guardian-name") ?? "").trim() || null,
      guardian_phone:
        track.track_key === "kids" ? String(formData.get("phone") ?? "").trim() : null,
      guardian_email:
        track.track_key === "kids" ? String(formData.get("email") ?? "").trim() || null : null,
      guardian_consent: formData.get("guardian-consent") === "on",
      module_ids: moduleIds,
    };
    submitMutation.mutate(payload);
  }

  const today = nairobiDate();
  const offerActive =
    selectedPeriod?.discount_percent &&
    selectedPeriod.discount_percent > 0 &&
    (!selectedPeriod.offer_deadline || selectedPeriod.offer_deadline >= today);
  const amountDue = selectedPeriod
    ? selectedPeriod.fee_amount * (offerActive ? 1 - selectedPeriod.discount_percent / 100 : 1)
    : 0;

  return (
    <div>
      <section className="bg-brand-deep py-10 text-brand-foreground sm:py-14">
        <div className="container-site">
          <div className="mx-auto max-w-5xl">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
              Profia Institute of Professionals
            </p>
            <h1 className="mt-3 text-3xl font-extrabold sm:text-5xl">
              {trackKey === "kids" ? "Kids Holiday Program" : "Holiday Computer Training"}
            </h1>
            <p className="mt-3 max-w-2xl text-base text-white/75 sm:text-lg">
              {track?.description ||
                "Build practical digital skills during the holidays with hands-on learning at Profia Institute."}
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              {(["general", "kids"] as const).map((key) => (
                <Button
                  key={key}
                  variant={trackKey === key ? "hero" : "heroOutline"}
                  onClick={() => setTrackKey(key)}
                  aria-pressed={trackKey === key}
                >
                  {key === "kids" ? "Kids holiday program" : "General holiday training"}
                </Button>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="container-site grid gap-8 py-8 sm:py-12 lg:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
        {query.isLoading ? (
          <p className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">
            Loading program details…
          </p>
        ) : query.error ? (
          <div className="rounded-xl border bg-card p-6">
            <h2 className="font-semibold">Program details are unavailable</h2>
            <p className="mt-2 text-sm text-destructive">{query.error.message}</p>
            <Button className="mt-4" variant="outline" onClick={() => void query.refetch()}>
              Try again
            </Button>
          </div>
        ) : !track ? (
          <div className="rounded-xl border bg-card p-6">
            <h2 className="font-semibold">This program is not currently published</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Please contact Profia Institute for upcoming holiday training.
            </p>
          </div>
        ) : (
          <>
            <div className="space-y-6">
              <article className="overflow-hidden rounded-2xl border bg-card shadow-card">
                <div className="bg-gradient-to-r from-brand-deep to-brand px-6 py-7 text-white sm:px-8">
                  <div className="flex items-start justify-between gap-5">
                    <div>
                      <Badge variant="outline" className="border-white/30 text-white">
                        {track.track_key === "kids" ? "Kids program" : "Holiday computer training"}
                      </Badge>
                      <h2 className="mt-4 text-2xl font-extrabold sm:text-3xl">{track.title}</h2>
                      <p className="mt-2 text-sm text-white/80">
                        {track.subtitle || track.description}
                      </p>
                    </div>
                    <Monitor className="hidden h-12 w-12 shrink-0 text-white/35 sm:block" />
                  </div>
                </div>
                {track.description && (
                  <div className="grid gap-3 p-5 sm:grid-cols-2 sm:p-6">
                    <InfoTile
                      icon={Clock3}
                      label="Duration"
                      value={
                        selectedPeriod
                          ? `${selectedPeriod.starts_on} – ${selectedPeriod.ends_on}`
                          : "Choose a period"
                      }
                    />
                    <InfoTile
                      icon={MapPin}
                      label="Location"
                      value={selectedPeriod?.location || track.location || "Contact the Institute"}
                    />
                    <InfoTile
                      icon={CalendarDays}
                      label="Schedule"
                      value={selectedPeriod?.schedule || "See period details"}
                    />
                    <InfoTile
                      icon={UsersRound}
                      label="Who can apply"
                      value={
                        track.track_key === "kids"
                          ? `Children${track.min_age !== null ? ` aged ${track.min_age}` : ""}${track.max_age !== null ? `–${track.max_age}` : ""}`
                          : "Holiday learners"
                      }
                    />
                  </div>
                )}
              </article>
              {track.contact_phone || track.contact_email ? (
                <p className="text-sm text-muted-foreground">
                  Questions?{" "}
                  {track.contact_phone && (
                    <a
                      className="font-semibold text-primary underline"
                      href={`tel:${track.contact_phone}`}
                    >
                      {track.contact_phone}
                    </a>
                  )}
                  {track.contact_phone && track.contact_email ? " · " : ""}
                  {track.contact_email && (
                    <a
                      className="font-semibold text-primary underline"
                      href={`mailto:${track.contact_email}`}
                    >
                      {track.contact_email}
                    </a>
                  )}
                </p>
              ) : null}
            </div>

            <div className="rounded-2xl border bg-card p-5 shadow-card sm:p-7">
              {confirmationCode ? (
                <div className="py-6 text-center">
                  <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600" />
                  <h2 className="mt-4 text-2xl font-bold text-brand">Application received</h2>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Keep this confirmation code and contact the Institute to arrange your deposit.
                  </p>
                  <p className="mt-4 inline-block rounded-lg bg-muted px-4 py-3 font-mono text-lg font-bold tracking-wider">
                    {confirmationCode}
                  </p>
                  <p className="mt-4 text-sm">
                    Fee: {formatKES(amountDue)} · Deposit:{" "}
                    {formatKES(selectedPeriod?.deposit_amount ?? 0)}
                  </p>
                  <Button
                    className="mt-6"
                    variant="outline"
                    onClick={() => {
                      setConfirmationCode("");
                      setModuleIds([]);
                    }}
                  >
                    Submit another application
                  </Button>
                </div>
              ) : (
                <form className="space-y-5" onSubmit={submitApplication}>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-widest text-primary">
                      Registration
                    </p>
                    <h2 className="mt-1 text-xl font-bold text-brand">Apply for a place</h2>
                  </div>
                  {periods.length === 0 ? (
                    <p className="rounded-lg bg-muted p-4 text-sm text-muted-foreground">
                      There are no open periods at the moment. Contact the Institute for upcoming
                      dates.
                    </p>
                  ) : (
                    <>
                      <label className={fieldClass}>
                        Select period
                        <select
                          required
                          className="h-10 rounded-md border bg-background px-3 font-normal"
                          value={periodId}
                          onChange={(event) => {
                            setPeriodId(event.target.value);
                            setModuleIds([]);
                          }}
                        >
                          <option value="">Choose a period</option>
                          {periods.map((period) => (
                            <option key={period.id} value={period.id}>
                              {period.title} · {period.starts_on} – {period.ends_on}
                            </option>
                          ))}
                        </select>
                      </label>
                      {selectedPeriod && (
                        <div className="rounded-lg bg-muted/70 p-4 text-sm">
                          <p className="font-semibold">
                            {formatKES(amountDue)} total
                            {offerActive ? ` (${selectedPeriod.discount_percent}% offer)` : ""}
                          </p>
                          <p className="mt-1 text-muted-foreground">
                            Deposit to secure a slot: {formatKES(selectedPeriod.deposit_amount)}
                          </p>
                          {selectedPeriod.offer_deadline && offerActive && (
                            <p className="mt-1 text-xs text-muted-foreground">
                              Offer ends {selectedPeriod.offer_deadline}.
                            </p>
                          )}
                        </div>
                      )}
                      <fieldset className="space-y-2">
                        <legend className="text-sm font-medium">Choose modules</legend>
                        {availableModules.length ? (
                          availableModules.map((module) => (
                            <label
                              key={module.id}
                              className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm"
                            >
                              <input
                                className="mt-1"
                                type="checkbox"
                                checked={moduleIds.includes(module.id)}
                                onChange={(event) =>
                                  setModuleIds((ids) =>
                                    event.target.checked
                                      ? [...ids, module.id]
                                      : ids.filter((id) => id !== module.id),
                                  )
                                }
                              />
                              <span>
                                <span className="font-semibold">{module.title}</span>
                                {module.duration && (
                                  <span className="text-muted-foreground">
                                    {" "}
                                    · {module.duration}
                                  </span>
                                )}
                                {module.description && (
                                  <span className="mt-1 block text-muted-foreground">
                                    {module.description}
                                  </span>
                                )}
                              </span>
                            </label>
                          ))
                        ) : (
                          <p className="text-sm text-muted-foreground">
                            {selectedPeriod
                              ? "Modules for this period will be posted soon."
                              : "Choose a period to see its modules."}
                          </p>
                        )}
                      </fieldset>
                      <div className="space-y-3 border-t pt-4">
                        <h3 className="font-semibold text-brand">
                          {track.track_key === "kids"
                            ? "Child and parent/guardian details"
                            : "Your details"}
                        </h3>
                        <label className={fieldClass}>
                          {track.track_key === "kids" ? "Child's full name" : "Full name"}
                          <Input name="applicant-name" autoComplete="name" required />
                        </label>
                        {track.track_key === "kids" && (
                          <label className={fieldClass}>
                            Child's age
                            <Input
                              name="applicant-age"
                              type="number"
                              min={track.min_age ?? 0}
                              max={track.max_age ?? 25}
                              required
                            />
                          </label>
                        )}
                        <div className="grid gap-3 sm:grid-cols-2">
                          <label className={fieldClass}>
                            {track.track_key === "kids"
                              ? "Parent/guardian phone / WhatsApp"
                              : "Phone / WhatsApp"}
                            <Input name="phone" type="tel" autoComplete="tel" required />
                          </label>
                          <label className={fieldClass}>
                            {track.track_key === "kids"
                              ? "Parent/guardian email (optional)"
                              : "Email (optional)"}
                            <Input name="email" type="email" autoComplete="email" />
                          </label>
                        </div>
                        <label className={fieldClass}>
                          Where are you based?
                          <Input name="location" autoComplete="address-level2" required />
                        </label>
                        {track.track_key === "kids" && (
                          <>
                            <label className={fieldClass}>
                              Parent/guardian full name
                              <Input name="guardian-name" required />
                            </label>
                            <label className="flex items-start gap-2 text-sm">
                              <input
                                className="mt-1"
                                type="checkbox"
                                name="guardian-consent"
                                required
                              />
                              I am the parent or legal guardian and consent to this application and
                              contact from Profia Institute.
                            </label>
                          </>
                        )}
                      </div>
                      <label className="sr-only" aria-hidden="true">
                        Leave this field blank
                        <input name="website" tabIndex={-1} autoComplete="off" />
                      </label>
                      <Button
                        type="submit"
                        className="w-full"
                        disabled={
                          submitMutation.isPending ||
                          periods.length === 0 ||
                          !availableModules.length ||
                          !moduleIds.length
                        }
                      >
                        {submitMutation.isPending ? "Submitting…" : "Submit application"}
                      </Button>
                      <p className="text-xs leading-5 text-muted-foreground">
                        Submitting this form does not confirm a place. The Institute will contact
                        you about availability and the deposit payment.
                      </p>
                    </>
                  )}
                </form>
              )}
            </div>
          </>
        )}
      </section>
    </div>
  );
}

function InfoTile({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Clock3;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border bg-background p-4">
      <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <Icon className="h-4 w-4 text-primary" /> {label}
      </p>
      <p className="mt-2 font-semibold text-brand">{value}</p>
    </div>
  );
}
