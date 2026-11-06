import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { formatKES } from "@/lib/site";

type Track = Tables<"holiday_program_tracks">;
type Period = Tables<"holiday_program_periods">;
type Module = Tables<"holiday_program_modules">;
type HolidayApplication = Tables<"holiday_program_applications">;

const fieldClass = "grid gap-1.5 text-sm font-medium";
const inputClass = "font-normal";
const emptyPeriods: Period[] = [];
const emptyModules: Module[] = [];
const emptyApplications: HolidayApplication[] = [];

export function HolidayProgramAdminPanel() {
  const queryClient = useQueryClient();
  const [trackKey, setTrackKey] = useState<"general" | "kids">("general");
  const [selectedPeriodId, setSelectedPeriodId] = useState("");
  const [selectedModuleIds, setSelectedModuleIds] = useState<string[]>([]);
  const [moduleDraft, setModuleDraft] = useState<Module | null>(null);
  const [periodDraft, setPeriodDraft] = useState<Period | null>(null);
  const [trackDraft, setTrackDraft] = useState<Partial<Track>>({});
  const moduleFormRef = useRef<HTMLFormElement>(null);

  const tracksQuery = useQuery({
    queryKey: ["holiday-program", "tracks"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("holiday_program_tracks")
        .select("*")
        .order("track_key");
      if (error) throw error;
      return data;
    },
  });
  const tracks = tracksQuery.data ?? [];
  const track = tracks.find((item) => item.track_key === trackKey);

  useEffect(() => {
    if (track) setTrackDraft(track);
  }, [track]);

  const periodsQuery = useQuery({
    queryKey: ["holiday-program", "periods", track?.id],
    enabled: Boolean(track?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("holiday_program_periods")
        .select("*")
        .eq("track_id", track!.id)
        .order("starts_on", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
  const modulesQuery = useQuery({
    queryKey: ["holiday-program", "modules", track?.id],
    enabled: Boolean(track?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("holiday_program_modules")
        .select("*")
        .eq("track_id", track!.id)
        .order("title");
      if (error) throw error;
      return data;
    },
  });
  const applicationsQuery = useQuery({
    queryKey: ["holiday-program", "applications", track?.id],
    enabled: Boolean(track?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("holiday_program_applications")
        .select("*")
        .eq("track_id", track!.id)
        .order("submitted_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
  const periodModulesQuery = useQuery({
    queryKey: ["holiday-program", "period-modules", selectedPeriodId],
    enabled: Boolean(selectedPeriodId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("holiday_program_period_modules")
        .select("module_id")
        .eq("period_id", selectedPeriodId);
      if (error) throw error;
      return data.map((item) => item.module_id);
    },
  });

  useEffect(() => {
    if (periodModulesQuery.data) setSelectedModuleIds(periodModulesQuery.data);
  }, [periodModulesQuery.data]);

  const invalidate = async (...keys: string[][]) => {
    await Promise.all(keys.map((queryKey) => queryClient.invalidateQueries({ queryKey })));
  };
  const saveTrackMutation = useMutation({
    mutationFn: async (values: Partial<Track>) => {
      if (!track) throw new Error("Select a program track first.");
      const { error } = await supabase
        .from("holiday_program_tracks")
        .update(values)
        .eq("id", track.id);
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("Holiday program details saved");
      await invalidate(["holiday-program", "tracks"]);
    },
    onError: (error) => toast.error(error.message),
  });
  const saveModuleMutation = useMutation({
    mutationFn: async (values: {
      id?: string;
      title: string;
      description: string;
      duration: string;
      active?: boolean;
    }) => {
      if (!track) throw new Error("Select a program track first.");
      const { id, ...moduleValues } = values;
      const query = id
        ? supabase.from("holiday_program_modules").update(moduleValues).eq("id", id)
        : supabase.from("holiday_program_modules").insert({ ...moduleValues, track_id: track.id });
      const { error } = await query;
      if (error) throw error;
    },
    onSuccess: async () => {
      setModuleDraft(null);
      moduleFormRef.current?.reset();
      toast.success("Module saved");
      await invalidate(["holiday-program", "modules", track?.id ?? ""]);
    },
    onError: (error) => toast.error(error.message),
  });
  const savePeriodMutation = useMutation({
    mutationFn: async (values: {
      id?: string;
      title: string;
      starts_on: string;
      ends_on: string;
      schedule: string;
      location: string;
      capacity: number | null;
      registration_deadline: string | null;
      fee_amount: number;
      deposit_amount: number;
      discount_percent: number;
      offer_deadline: string | null;
      status: string;
    }) => {
      if (!track) throw new Error("Select a program track first.");
      const { id, ...periodValues } = values;
      const query = id
        ? supabase.from("holiday_program_periods").update(periodValues).eq("id", id)
        : supabase.from("holiday_program_periods").insert({ ...periodValues, track_id: track.id });
      const { error } = await query;
      if (error) throw error;
    },
    onSuccess: async () => {
      setPeriodDraft(null);
      toast.success("Program period saved");
      await invalidate(["holiday-program", "periods", track?.id ?? ""]);
    },
    onError: (error) => toast.error(error.message),
  });
  const savePeriodModulesMutation = useMutation({
    mutationFn: async () => {
      if (!selectedPeriodId) throw new Error("Choose a period first.");
      const { error } = await supabase.rpc("set_holiday_program_period_modules", {
        p_period_id: selectedPeriodId,
        p_module_ids: selectedModuleIds,
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("Modules assigned to this period");
      await invalidate(["holiday-program", "period-modules", selectedPeriodId]);
    },
    onError: (error) => toast.error(error.message),
  });
  const updateApplicationMutation = useMutation({
    mutationFn: async ({
      id,
      status,
      payment_status,
      admin_notes,
    }: {
      id: string;
      status: string;
      payment_status: string;
      admin_notes: string;
    }) => {
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError) throw userError;
      const { error } = await supabase
        .from("holiday_program_applications")
        .update({
          status,
          payment_status,
          admin_notes,
          reviewed_at: new Date().toISOString(),
          reviewed_by: userData.user?.id ?? null,
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("Registration updated");
      await invalidate(["holiday-program", "applications", track?.id ?? ""]);
    },
    onError: (error) => toast.error(error.message),
  });

  const periods = periodsQuery.data ?? emptyPeriods;
  const modules = modulesQuery.data ?? emptyModules;
  const applications = applicationsQuery.data ?? emptyApplications;
  const periodById = useMemo(
    () => new Map(periods.map((period) => [period.id, period])),
    [periods],
  );

  if (tracksQuery.isLoading)
    return <p className="text-sm text-muted-foreground">Loading holiday program…</p>;
  if (tracksQuery.error) {
    return (
      <section className="rounded-xl border bg-card p-5">
        <h2 className="font-semibold">Holiday program unavailable</h2>
        <p className="mt-2 text-sm text-destructive">{tracksQuery.error.message}</p>
        <Button className="mt-4" variant="outline" onClick={() => void tracksQuery.refetch()}>
          Try again
        </Button>
      </section>
    );
  }
  if (!track)
    return (
      <p className="text-sm text-muted-foreground">No holiday program tracks are configured.</p>
    );

  return (
    <section className="space-y-6">
      <header className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-widest text-primary">Admissions</p>
        <h1 className="text-2xl font-bold text-brand">Holiday program</h1>
        <p className="text-sm text-muted-foreground">
          Manage separate program content, periods, modules, prices, and registrations.
        </p>
      </header>

      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Holiday program tracks">
        {(["general", "kids"] as const).map((key) => (
          <Button
            key={key}
            type="button"
            role="tab"
            aria-selected={trackKey === key}
            variant={trackKey === key ? "default" : "outline"}
            onClick={() => {
              setTrackKey(key);
              setPeriodDraft(null);
              setModuleDraft(null);
              setSelectedPeriodId("");
              setSelectedModuleIds([]);
            }}
          >
            {key === "kids" ? "Kids program" : "General program"}
          </Button>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <form
          className="space-y-4 rounded-xl border bg-card p-5 shadow-card"
          onSubmit={(event) => {
            event.preventDefault();
            saveTrackMutation.mutate(trackDraft);
          }}
        >
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-semibold text-brand">Program page details</h2>
            <Badge variant={trackDraft.published ? "default" : "secondary"}>
              {trackDraft.published ? "Published" : "Hidden"}
            </Badge>
          </div>
          <label className={fieldClass}>
            Program name
            <Input
              required
              className={inputClass}
              value={trackDraft.title ?? ""}
              onChange={(e) => setTrackDraft({ ...trackDraft, title: e.target.value })}
            />
          </label>
          <label className={fieldClass}>
            Short tagline
            <Input
              className={inputClass}
              value={trackDraft.subtitle ?? ""}
              onChange={(e) => setTrackDraft({ ...trackDraft, subtitle: e.target.value })}
            />
          </label>
          <label className={fieldClass}>
            Description
            <Textarea
              className={inputClass}
              value={trackDraft.description ?? ""}
              onChange={(e) => setTrackDraft({ ...trackDraft, description: e.target.value })}
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className={fieldClass}>
              Location
              <Input
                className={inputClass}
                value={trackDraft.location ?? ""}
                onChange={(e) => setTrackDraft({ ...trackDraft, location: e.target.value })}
              />
            </label>
            <label className={fieldClass}>
              Contact phone
              <Input
                className={inputClass}
                value={trackDraft.contact_phone ?? ""}
                onChange={(e) => setTrackDraft({ ...trackDraft, contact_phone: e.target.value })}
              />
            </label>
            <label className={fieldClass}>
              Contact email
              <Input
                type="email"
                className={inputClass}
                value={trackDraft.contact_email ?? ""}
                onChange={(e) => setTrackDraft({ ...trackDraft, contact_email: e.target.value })}
              />
            </label>
            {trackKey === "kids" && (
              <>
                <label className={fieldClass}>
                  Minimum age
                  <Input
                    type="number"
                    min="0"
                    max="25"
                    className={inputClass}
                    value={trackDraft.min_age ?? ""}
                    onChange={(e) =>
                      setTrackDraft({
                        ...trackDraft,
                        min_age: e.target.value ? Number(e.target.value) : null,
                      })
                    }
                  />
                </label>
                <label className={fieldClass}>
                  Maximum age
                  <Input
                    type="number"
                    min="0"
                    max="25"
                    className={inputClass}
                    value={trackDraft.max_age ?? ""}
                    onChange={(e) =>
                      setTrackDraft({
                        ...trackDraft,
                        max_age: e.target.value ? Number(e.target.value) : null,
                      })
                    }
                  />
                </label>
              </>
            )}
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={trackDraft.published ?? false}
              onChange={(e) => setTrackDraft({ ...trackDraft, published: e.target.checked })}
            />
            Show this program on the public website
          </label>
          <Button type="submit" disabled={saveTrackMutation.isPending}>
            Save program details
          </Button>
        </form>

        <div className="space-y-6">
          <form
            key={moduleDraft?.id ?? "new"}
            ref={moduleFormRef}
            className="space-y-3 rounded-xl border bg-card p-5 shadow-card"
            onSubmit={(event) => {
              event.preventDefault();
              const form = event.currentTarget;
              const data = new FormData(form);
              void saveModuleMutation
                .mutateAsync({
                  ...(moduleDraft ? { id: moduleDraft.id } : {}),
                  title: String(data.get("module-title") ?? "").trim(),
                  description: String(data.get("module-description") ?? "").trim(),
                  duration: String(data.get("module-duration") ?? "").trim(),
                })
                .then(
                  () => form.reset(),
                  () => undefined,
                );
            }}
          >
            <h2 className="font-semibold text-brand">
              {trackKey === "kids" ? "Kids modules" : "Program modules"}
            </h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <Input
                name="module-title"
                required
                placeholder="Module name"
                defaultValue={moduleDraft?.title ?? ""}
              />
              <Input
                name="module-duration"
                placeholder="Duration (e.g. 1 week)"
                defaultValue={moduleDraft?.duration ?? ""}
              />
            </div>
            <Textarea
              name="module-description"
              placeholder="What participants will learn"
              defaultValue={moduleDraft?.description ?? ""}
            />
            <div className="flex gap-2">
              <Button type="submit" disabled={saveModuleMutation.isPending}>
                {moduleDraft ? "Update module" : "Add module"}
              </Button>
              {moduleDraft && (
                <Button type="button" variant="outline" onClick={() => setModuleDraft(null)}>
                  Cancel
                </Button>
              )}
            </div>
            <ul className="divide-y">
              {modules.map((module) => (
                <li key={module.id} className="flex items-start justify-between gap-3 py-3 text-sm">
                  <div>
                    <p className="font-semibold">
                      {module.title} {!module.active && <Badge variant="secondary">Inactive</Badge>}
                    </p>
                    <p className="text-muted-foreground">
                      {module.duration || module.description || "No details added."}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => setModuleDraft(module)}
                    >
                      Edit
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        saveModuleMutation.mutate({
                          id: module.id,
                          title: module.title,
                          description: module.description,
                          duration: module.duration,
                          active: !module.active,
                        })
                      }
                    >
                      {module.active ? "Hide" : "Show"}
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </form>

          <PeriodEditor
            key={`${trackKey}:${periodDraft?.id ?? "new"}`}
            trackId={track.id}
            trackKey={trackKey}
            periods={periods}
            periodDraft={periodDraft}
            setPeriodDraft={setPeriodDraft}
            onSave={(values) => savePeriodMutation.mutateAsync(values)}
            saving={savePeriodMutation.isPending}
          />
        </div>
      </div>

      <section className="space-y-4 rounded-xl border bg-card p-5 shadow-card">
        <div>
          <h2 className="font-semibold text-brand">Modules offered in a period</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Choose which track modules applicants can select for each period.
          </p>
        </div>
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
          <select
            className="h-10 rounded-md border bg-background px-3 text-sm"
            value={selectedPeriodId}
            onChange={(event) => setSelectedPeriodId(event.target.value)}
          >
            <option value="">Select a period</option>
            {periods.map((period) => (
              <option key={period.id} value={period.id}>
                {period.title}
              </option>
            ))}
          </select>
          <div className="space-y-3">
            <div className="flex flex-wrap gap-x-5 gap-y-2">
              {modules
                .filter((module) => module.active)
                .map((module) => (
                  <label key={module.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      disabled={!selectedPeriodId}
                      checked={selectedModuleIds.includes(module.id)}
                      onChange={(event) =>
                        setSelectedModuleIds((ids) =>
                          event.target.checked
                            ? [...ids, module.id]
                            : ids.filter((id) => id !== module.id),
                        )
                      }
                    />
                    {module.title}
                  </label>
                ))}
              {!modules.some((module) => module.active) && (
                <p className="text-sm text-muted-foreground">Add active modules first.</p>
              )}
            </div>
            <Button
              disabled={!selectedPeriodId || savePeriodModulesMutation.isPending}
              onClick={() => savePeriodModulesMutation.mutate()}
            >
              Save period modules
            </Button>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-brand">
              {trackKey === "kids" ? "Kids registrations" : "General registrations"}
            </h2>
            <p className="text-sm text-muted-foreground">
              {applications.length} registration{applications.length === 1 ? "" : "s"} for this
              track.
            </p>
          </div>
          <Button variant="outline" onClick={() => void applicationsQuery.refetch()}>
            Refresh
          </Button>
        </header>
        {applicationsQuery.error && (
          <p role="alert" className="text-sm text-destructive">
            {applicationsQuery.error.message}
          </p>
        )}
        {applicationsQuery.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading registrations…</p>
        ) : null}
        {applications.map((application) => (
          <ApplicationCard
            key={application.id}
            application={application}
            {...(periodById.get(application.period_id)
              ? { period: periodById.get(application.period_id)! }
              : {})}
            modules={modules.filter((module) => application.module_ids.includes(module.id))}
            onSave={(values) => updateApplicationMutation.mutate({ id: application.id, ...values })}
            saving={updateApplicationMutation.isPending}
          />
        ))}
        {!applicationsQuery.isLoading && applications.length === 0 && (
          <p className="rounded-xl border bg-card p-5 text-sm text-muted-foreground">
            No registrations yet for this track.
          </p>
        )}
      </section>
    </section>
  );
}

function PeriodEditor({
  trackId,
  trackKey,
  periods,
  periodDraft,
  setPeriodDraft,
  onSave,
  saving,
}: {
  trackId: string;
  trackKey: string;
  periods: Period[];
  periodDraft: Period | null;
  setPeriodDraft: (period: Period | null) => void;
  onSave: (values: {
    id?: string;
    title: string;
    starts_on: string;
    ends_on: string;
    schedule: string;
    location: string;
    capacity: number | null;
    registration_deadline: string | null;
    fee_amount: number;
    deposit_amount: number;
    discount_percent: number;
    offer_deadline: string | null;
    status: string;
  }) => Promise<void>;
  saving: boolean;
}) {
  return (
    <form
      key={periodDraft?.id ?? "new"}
      className="space-y-3 rounded-xl border bg-card p-5 shadow-card"
      onSubmit={(event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const data = new FormData(form);
        void onSave({
          ...(periodDraft ? { id: periodDraft.id } : {}),
          title: String(data.get("period-title") ?? "").trim(),
          starts_on: String(data.get("starts-on") ?? ""),
          ends_on: String(data.get("ends-on") ?? ""),
          schedule: String(data.get("schedule") ?? "").trim(),
          location: String(data.get("period-location") ?? "").trim(),
          capacity: data.get("capacity") ? Number(data.get("capacity")) : null,
          registration_deadline: String(data.get("registration-deadline") || "") || null,
          fee_amount: Number(data.get("fee") || 0),
          deposit_amount: Number(data.get("deposit") || 0),
          discount_percent: Number(data.get("discount") || 0),
          offer_deadline: String(data.get("offer-deadline") || "") || null,
          status: String(data.get("period-status") || "draft"),
        }).then(
          () => form.reset(),
          () => undefined,
        );
      }}
    >
      <h2 className="font-semibold text-brand">
        {trackKey === "kids" ? "Kids periods" : "Program periods"}
      </h2>
      <Input
        name="period-title"
        required
        placeholder="Period name (e.g. December Holiday 2026)"
        defaultValue={periodDraft?.title ?? ""}
      />
      <div className="grid gap-3 sm:grid-cols-2">
        <label className={fieldClass}>
          Starts
          <Input
            name="starts-on"
            type="date"
            required
            defaultValue={periodDraft?.starts_on ?? ""}
          />
        </label>
        <label className={fieldClass}>
          Ends
          <Input name="ends-on" type="date" required defaultValue={periodDraft?.ends_on ?? ""} />
        </label>
        <label className={fieldClass}>
          Registration deadline
          <Input
            name="registration-deadline"
            type="date"
            defaultValue={periodDraft?.registration_deadline ?? ""}
          />
        </label>
        <label className={fieldClass}>
          Capacity (blank = unlimited)
          <Input name="capacity" type="number" min="1" defaultValue={periodDraft?.capacity ?? ""} />
        </label>
        <label className={fieldClass}>
          Total course fee (KES)
          <Input
            name="fee"
            type="number"
            min="0"
            step="0.01"
            required
            defaultValue={periodDraft?.fee_amount ?? 4500}
          />
        </label>
        <label className={fieldClass}>
          Deposit to secure a slot (KES)
          <Input
            name="deposit"
            type="number"
            min="0"
            step="0.01"
            required
            defaultValue={periodDraft?.deposit_amount ?? 1000}
          />
        </label>
        <label className={fieldClass}>
          Discount (%)
          <Input
            name="discount"
            type="number"
            min="0"
            max="100"
            step="0.01"
            defaultValue={periodDraft?.discount_percent ?? 10}
          />
        </label>
        <label className={fieldClass}>
          Offer ends
          <Input
            name="offer-deadline"
            type="date"
            defaultValue={periodDraft?.offer_deadline ?? ""}
          />
        </label>
      </div>
      <Input
        name="period-location"
        placeholder="Venue"
        defaultValue={periodDraft?.location ?? ""}
      />
      <Textarea
        name="schedule"
        placeholder="Timetable / schedule details"
        defaultValue={periodDraft?.schedule ?? ""}
      />
      <select
        name="period-status"
        className="h-10 w-full rounded-md border bg-background px-3 text-sm"
        defaultValue={periodDraft?.status ?? "draft"}
      >
        <option value="draft">Draft (not listed)</option>
        <option value="open">Open for applications</option>
        <option value="closed">Closed</option>
        <option value="archived">Archived</option>
      </select>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={saving}>
          {periodDraft ? "Update period" : "Add period"}
        </Button>
        {periodDraft && (
          <Button type="button" variant="outline" onClick={() => setPeriodDraft(null)}>
            Cancel edit
          </Button>
        )}
      </div>
      {periods.length > 0 && (
        <ul className="divide-y">
          {periods.map((period) => (
            <li key={period.id} className="flex items-center justify-between gap-3 py-2 text-sm">
              <div>
                <p className="font-medium">
                  {period.title}{" "}
                  <Badge variant={period.status === "open" ? "default" : "secondary"}>
                    {period.status}
                  </Badge>
                </p>
                <p className="text-muted-foreground">
                  {period.starts_on} – {period.ends_on} · {formatKES(period.fee_amount)}
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setPeriodDraft(period)}
              >
                Edit
              </Button>
            </li>
          ))}
        </ul>
      )}
      <input type="hidden" name="track-id" value={trackId} />
    </form>
  );
}

function ApplicationCard({
  application,
  period,
  modules,
  onSave,
  saving,
}: {
  application: HolidayApplication;
  period?: Period;
  modules: Module[];
  onSave: (values: { status: string; payment_status: string; admin_notes: string }) => void;
  saving: boolean;
}) {
  const [status, setStatus] = useState(application.status);
  const [paymentStatus, setPaymentStatus] = useState(application.payment_status);
  const [notes, setNotes] = useState(application.admin_notes);
  const kid = application.applicant_age !== null;
  return (
    <article className="grid gap-4 rounded-xl border bg-card p-5 shadow-card lg:grid-cols-[minmax(0,1fr)_minmax(260px,0.7fr)]">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-semibold text-brand">{application.applicant_name}</h3>
          <Badge variant="outline">{application.confirmation_code}</Badge>
          <Badge variant="secondary">{status.replace("_", " ")}</Badge>
        </div>
        {kid && (
          <p className="text-sm">
            <strong>Age:</strong> {application.applicant_age} · <strong>Guardian:</strong>{" "}
            {application.guardian_name} ({application.guardian_phone})
          </p>
        )}
        <p className="text-sm text-muted-foreground">
          {application.phone}
          {application.email ? ` · ${application.email}` : ""} · {application.location}
        </p>
        <p className="text-sm">
          <strong>Period:</strong> {period?.title ?? "Unavailable"}
        </p>
        <p className="text-sm">
          <strong>Modules:</strong>{" "}
          {modules.map((module) => module.title).join(", ") || "Unavailable"}
        </p>
        <p className="text-sm">
          <strong>Fee:</strong> {formatKES(application.amount_due)} · <strong>Deposit:</strong>{" "}
          {formatKES(application.deposit_amount)}
        </p>
        <p className="text-xs text-muted-foreground">
          Submitted {new Date(application.submitted_at).toLocaleString()}
        </p>
      </div>
      <div className="space-y-3">
        <select
          className="h-10 w-full rounded-md border bg-background px-3 text-sm"
          value={status}
          onChange={(event) => setStatus(event.target.value)}
        >
          {["submitted", "under_review", "accepted", "waitlisted", "rejected", "withdrawn"].map(
            (item) => (
              <option key={item} value={item}>
                {item.replace("_", " ")}
              </option>
            ),
          )}
        </select>
        <select
          className="h-10 w-full rounded-md border bg-background px-3 text-sm"
          value={paymentStatus}
          onChange={(event) => setPaymentStatus(event.target.value)}
        >
          {["unpaid", "deposit_paid", "paid", "waived"].map((item) => (
            <option key={item} value={item}>
              {item.replace("_", " ")}
            </option>
          ))}
        </select>
        <Textarea
          placeholder="Internal notes"
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
        />
        <Button
          disabled={saving}
          onClick={() => onSave({ status, payment_status: paymentStatus, admin_notes: notes })}
        >
          Save registration
        </Button>
      </div>
    </article>
  );
}
