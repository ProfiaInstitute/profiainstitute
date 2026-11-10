import { useState, type FormEvent, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, FileCheck2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { FeeStructureActions } from "@/components/site/FeeStructureActions";
import { formatKES, STUDY_MODES, useActiveIntake } from "@/lib/site";
import type { Enums, Json } from "@/integrations/supabase/types";

const inputClass =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

type ApplicationFormValues = {
  first_name: string;
  middle_name: string;
  last_name: string;
  email: string;
  phone: string;
  alt_phone: string;
  date_of_birth: string;
  gender: string;
  national_id: string;
  county: string;
  town: string;
  address: string;
  highest_qualification: string;
  institution_attended: string;
  year_completed: string;
  kcse_grade: string;
  course_id: string;
  level_id: string;
  study_mode: Enums<"study_mode">;
  previous_training: string;
  work_experience: string;
  special_requirements: string;
  heard_about: string;
};

const applicationDocumentTypes = [
  { id: "KCSE certificate", label: "KCSE certificate" },
  { id: "KCPE certificate", label: "KCPE certificate" },
  { id: "Other certificates", label: "Any other certificates" },
  { id: "Birth certificate", label: "Birth certificate" },
  { id: "ID or passport", label: "National ID or passport" },
] as const;
type ApplicationDocumentType = (typeof applicationDocumentTypes)[number]["id"];
type SubmittedApplication = { id: string; token: string; number: string };
const maxDocumentSize = 5 * 1024 * 1024;
const acceptedDocumentTypes = new Set(["application/pdf", "image/jpeg", "image/png"]);
function documentContentType(file: File) {
  if (acceptedDocumentTypes.has(file.type)) return file.type;
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (extension === "pdf") return "application/pdf";
  if (extension === "jpg" || extension === "jpeg") return "image/jpeg";
  if (extension === "png") return "image/png";
  return "";
}

const initialValues: ApplicationFormValues = {
  first_name: "",
  middle_name: "",
  last_name: "",
  email: "",
  phone: "",
  alt_phone: "",
  date_of_birth: "",
  gender: "",
  national_id: "",
  county: "",
  town: "",
  address: "",
  highest_qualification: "",
  institution_attended: "",
  year_completed: "",
  kcse_grade: "",
  course_id: "",
  level_id: "",
  study_mode: "full_time",
  previous_training: "",
  work_experience: "",
  special_requirements: "",
  heard_about: "",
};

export function OnlineApplication({
  initialCourseId,
  initialLevelId,
}: {
  initialCourseId?: string;
  initialLevelId?: string;
}) {
  const activeIntake = useActiveIntake();
  const [values, setValues] = useState({
    ...initialValues,
    course_id: initialCourseId ?? "",
    level_id: initialLevelId ?? "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [applicationNumber, setApplicationNumber] = useState("");
  const [submittedApplication, setSubmittedApplication] = useState<SubmittedApplication | null>(
    null,
  );
  const [documents, setDocuments] = useState<Record<ApplicationDocumentType, File[]>>({
    "KCSE certificate": [],
    "KCPE certificate": [],
    "Other certificates": [],
    "Birth certificate": [],
    "ID or passport": [],
  });
  const levels = useQuery({
    queryKey: ["application-course-levels", values.course_id],
    enabled: Boolean(values.course_id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("course_levels")
        .select(
          "id,name,code,description,fee_items,total_fee,fee_structure_url,fee_structure_path,fee_structure_file_name,sort_order",
        )
        .eq("course_id", values.course_id)
        .eq("published", true)
        .order("sort_order")
        .order("name");
      if (error) throw error;
      return data;
    },
  });
  const selectedLevel = levels.data?.find((level) => level.id === values.level_id);
  const units = useQuery({
    queryKey: ["application-level-units", values.level_id],
    enabled: Boolean(values.level_id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("course_units")
        .select("id,code,title,semester")
        .eq("level_id", values.level_id)
        .order("sort_order")
        .order("title");
      if (error) throw error;
      return data;
    },
  });
  const [documentUploadError, setDocumentUploadError] = useState("");
  const [uploadingDocuments, setUploadingDocuments] = useState(false);
  const [uploadedDocumentPaths, setUploadedDocumentPaths] = useState<Map<File, string>>(
    () => new Map(),
  );
  const options = useQuery({
    queryKey: ["application-form-options"],
    queryFn: async () => {
      const courses = await supabase
        .from("courses")
        .select("*,schools(name)")
        .eq("published", true)
        .order("title");
      if (courses.error) throw courses.error;
      return {
        courses: (courses.data ?? []).filter((course) => course.application_enabled !== false),
      };
    },
  });
  const selectedCourse = options.data?.courses.find((course) => course.id === values.course_id);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!values.course_id) {
      toast.error("Select the course you want to apply for.");
      return;
    }
    if (!values.level_id || !selectedLevel) {
      toast.error("Select a course level before submitting your application.");
      return;
    }
    if (values.study_mode === "online" && !selectedCourse?.available_online) {
      toast.error("Online study is not available for this course.");
      return;
    }
    if (!/^\+?[0-9 ]{9,15}$/.test(values.phone.trim())) {
      toast.error("Enter a valid phone number including the country code if applicable.");
      return;
    }
    setSubmitting(true);
    const payload: Json = {
      ...values,
      first_name: values.first_name.trim(),
      middle_name: values.middle_name.trim() || null,
      last_name: values.last_name.trim(),
      email: values.email.trim().toLowerCase(),
      phone: values.phone.trim(),
      alt_phone: values.alt_phone.trim() || null,
      date_of_birth: values.date_of_birth || null,
      gender: values.gender || null,
      national_id: values.national_id.trim() || null,
      county: values.county.trim() || null,
      town: values.town.trim() || null,
      address: values.address.trim() || null,
      highest_qualification: values.highest_qualification.trim() || null,
      institution_attended: values.institution_attended.trim() || null,
      year_completed: values.year_completed || null,
      kcse_grade: values.kcse_grade.trim() || null,
      intake_id: activeIntake.data?.id ?? null,
      previous_training: values.previous_training.trim() || null,
      work_experience: values.work_experience.trim() || null,
      special_requirements: values.special_requirements.trim() || null,
      heard_about: values.heard_about.trim() || null,
    };
    const { data, error } = await supabase.rpc("submit_application", { p: payload });
    setSubmitting(false);
    if (error) {
      toast.error("Could not submit your application", { description: error.message });
      return;
    }
    const response = data && typeof data === "object" && !Array.isArray(data) ? data : null;
    const applicationId =
      response && "id" in response && typeof response["id"] === "string" ? response["id"] : "";
    const uploadToken =
      response && "upload_token" in response && typeof response["upload_token"] === "string"
        ? response["upload_token"]
        : "";
    const number =
      response &&
      "application_number" in response &&
      typeof response["application_number"] === "string"
        ? response["application_number"]
        : "";
    if (!number) {
      toast.error(
        "Your application was submitted, but we could not retrieve its reference number. Contact admissions for help.",
      );
      return;
    }
    setApplicationNumber(number);
    if (applicationId && uploadToken) {
      const submitted = { id: applicationId, token: uploadToken, number };
      setSubmittedApplication(submitted);
      await uploadApplicationDocuments(submitted);
    } else if (Object.values(documents).some((files) => files.length > 0)) {
      setDocumentUploadError(
        "Your application was received, but its document upload could not be started. Contact admissions and provide your application number.",
      );
    }
    toast.success("Application submitted successfully");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function uploadApplicationDocuments(application: SubmittedApplication) {
    const selected = applicationDocumentTypes.flatMap(({ id }) =>
      documents[id].map((file) => ({ type: id, file })),
    );
    if (!selected.length) return;
    setUploadingDocuments(true);
    setDocumentUploadError("");
    const errors: string[] = [];
    for (const { type, file } of selected) {
      let path = uploadedDocumentPaths.get(file);
      if (!path) {
        const safeFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-180);
        const newPath = `${application.id}/${application.token}/${type.toLowerCase().replace(/[^a-z0-9]+/g, "-")}/${Date.now()}-${safeFileName}`;
        const { error: uploadError } = await supabase.storage
          .from("application-docs")
          .upload(newPath, file, { contentType: documentContentType(file), upsert: false });
        if (uploadError) {
          errors.push(`${type}: ${uploadError.message}`);
          continue;
        }
        path = newPath;
        setUploadedDocumentPaths((current) => new Map(current).set(file, newPath));
      }
      const { error: attachError } = await supabase.rpc("attach_application_document", {
        _application_id: application.id,
        _token: application.token,
        _doc_type: type,
        _file_path: path,
        _file_name: file.name,
      });
      if (attachError) {
        errors.push(`${type}: ${attachError.message}`);
        continue;
      }
      setUploadedDocumentPaths((current) => {
        const next = new Map(current);
        next.delete(file);
        return next;
      });
      setDocuments((current) => ({
        ...current,
        [type]: current[type].filter((selectedFile) => selectedFile !== file),
      }));
    }
    setUploadingDocuments(false);
    setDocumentUploadError(errors.join("\n"));
    if (errors.length) {
      toast.error("Application received, but some documents were not uploaded", {
        description: errors.join("; "),
      });
    }
  }

  if (applicationNumber) {
    return (
      <section className="mx-auto max-w-2xl rounded-2xl border bg-card p-8 text-center shadow-card sm:p-12">
        <CheckCircle2 className="mx-auto h-12 w-12 text-success" />
        <p className="eyebrow mt-5">Application received</p>
        <h2 className="mt-2 text-2xl font-bold text-brand">Thank you, {values.first_name}.</h2>
        <p className="mt-3 text-muted-foreground">
          Keep this application number to check your application status.
        </p>
        {uploadingDocuments && (
          <p role="status" className="mt-4 text-sm text-muted-foreground">
            Uploading your supporting documents…
          </p>
        )}
        {documentUploadError && (
          <div role="alert" className="mt-4 rounded-lg border border-destructive/30 p-4 text-left">
            <p className="whitespace-pre-line text-sm text-destructive">{documentUploadError}</p>
            {submittedApplication && Object.values(documents).some((files) => files.length > 0) && (
              <Button
                type="button"
                variant="outline"
                className="mt-3"
                disabled={uploadingDocuments}
                onClick={() => void uploadApplicationDocuments(submittedApplication)}
              >
                {uploadingDocuments ? "Retrying uploads…" : "Retry document uploads"}
              </Button>
            )}
          </div>
        )}
        <p className="mt-5 rounded-lg bg-cream px-4 py-3 text-xl font-bold tracking-wide text-brand">
          {applicationNumber}
        </p>
        <Button asChild variant="outline" className="mt-6">
          <a href={`/application-status?number=${encodeURIComponent(applicationNumber)}`}>
            Check application status
          </a>
        </Button>
        <p className="mt-4 text-xs text-muted-foreground">
          A confirmation message has been queued for {values.email}.
        </p>
      </section>
    );
  }

  if (options.isLoading || activeIntake.isLoading) return <LoadingPanel />;
  if (options.error || activeIntake.error)
    return (
      <ErrorPanel
        message={
          options.error?.message ?? activeIntake.error?.message ?? "Could not load admissions."
        }
        retry={() => {
          void options.refetch();
          void activeIntake.refetch();
        }}
      />
    );

  return (
    <form
      onSubmit={submit}
      className="mx-auto max-w-4xl space-y-6 rounded-2xl border bg-card p-5 shadow-card sm:p-8"
    >
      <section>
        <p className="eyebrow">Online admissions</p>
        <h2 className="mt-1 text-2xl font-bold text-brand">Start your application</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Complete your contact and course details. Required fields are marked.
        </p>
      </section>
      {!options.data?.courses.length && (
        <div
          role="status"
          className="rounded-lg border border-warning/50 bg-cream p-4 text-sm text-brand"
        >
          There are currently no courses accepting applications. Please contact admissions for
          assistance.
        </div>
      )}
      <fieldset className="space-y-4">
        <legend className="font-semibold text-brand">Personal details</legend>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="First name *">
            <Input
              required
              maxLength={80}
              autoComplete="given-name"
              value={values.first_name}
              onChange={(e) => setValues({ ...values, first_name: e.target.value })}
            />
          </Field>
          <Field label="Middle name">
            <Input
              maxLength={80}
              autoComplete="additional-name"
              value={values.middle_name}
              onChange={(e) => setValues({ ...values, middle_name: e.target.value })}
            />
          </Field>
          <Field label="Last name *">
            <Input
              required
              maxLength={80}
              autoComplete="family-name"
              value={values.last_name}
              onChange={(e) => setValues({ ...values, last_name: e.target.value })}
            />
          </Field>
          <Field label="Email *">
            <Input
              required
              type="email"
              maxLength={255}
              autoComplete="email"
              value={values.email}
              onChange={(e) => setValues({ ...values, email: e.target.value })}
            />
          </Field>
          <Field label="Phone *">
            <Input
              required
              type="tel"
              autoComplete="tel"
              value={values.phone}
              onChange={(e) => setValues({ ...values, phone: e.target.value })}
            />
          </Field>
          <Field label="Alternative phone">
            <Input
              type="tel"
              value={values.alt_phone}
              onChange={(e) => setValues({ ...values, alt_phone: e.target.value })}
            />
          </Field>
          <Field label="Date of birth">
            <Input
              type="date"
              value={values.date_of_birth}
              onChange={(e) => setValues({ ...values, date_of_birth: e.target.value })}
            />
          </Field>
          <Field label="Gender">
            <select
              className={inputClass}
              value={values.gender}
              onChange={(e) => setValues({ ...values, gender: e.target.value })}
            >
              <option value="">Prefer not to say</option>
              <option>Female</option>
              <option>Male</option>
              <option>Other</option>
            </select>
          </Field>
          <Field label="National ID">
            <Input
              value={values.national_id}
              onChange={(e) => setValues({ ...values, national_id: e.target.value })}
            />
          </Field>
        </div>
      </fieldset>
      <fieldset className="space-y-4">
        <legend className="font-semibold text-brand">Course selection</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Course *">
            <select
              required
              className={inputClass}
              value={values.course_id}
              onChange={(e) =>
                setValues({
                  ...values,
                  course_id: e.target.value,
                  level_id: "",
                  ...(values.study_mode === "online" &&
                  !options.data?.courses.find((course) => course.id === e.target.value)
                    ?.available_online
                    ? { study_mode: "full_time" as const }
                    : {}),
                })
              }
            >
              <option value="">Choose a course</option>
              {options.data?.courses.map((course) => (
                <option key={course.id} value={course.id}>
                  {course.title} · {relationName(course.schools)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Intake">
            <Input
              readOnly
              value={
                activeIntake.data
                  ? `${activeIntake.data.name}${
                      activeIntake.data.application_deadline
                        ? ` · closes ${new Date(`${activeIntake.data.application_deadline}T00:00:00`).toLocaleDateString("en-KE")}`
                        : ""
                    }`
                  : "No active intake currently"
              }
            />
          </Field>
          <Field label="Course level *">
            <select
              required
              className={inputClass}
              value={values.level_id}
              disabled={!values.course_id || levels.isLoading}
              onChange={(e) => setValues({ ...values, level_id: e.target.value })}
            >
              <option value="">{levels.isLoading ? "Loading levels…" : "Choose a level"}</option>
              {levels.data?.map((level) => (
                <option key={level.id} value={level.id}>
                  {level.name}
                  {level.code ? ` · ${level.code}` : ""}
                </option>
              ))}
            </select>
            {levels.error && (
              <span role="alert" className="text-xs text-destructive">
                Could not load course levels: {levels.error.message}
              </span>
            )}
            {values.course_id && !levels.isLoading && !levels.error && !levels.data?.length && (
              <span className="text-xs text-muted-foreground">
                No published levels are available for this course. Please contact admissions.
              </span>
            )}
          </Field>
          <Field label="Study mode">
            <select
              className={inputClass}
              value={values.study_mode}
              onChange={(e) =>
                setValues({ ...values, study_mode: e.target.value as Enums<"study_mode"> })
              }
            >
              {Object.entries(STUDY_MODES)
                .filter(([key]) => key !== "online" || selectedCourse?.available_online)
                .map(([key, value]) => (
                  <option key={key} value={key}>
                    {value}
                  </option>
                ))}
            </select>
          </Field>
        </div>
      </fieldset>
      {selectedLevel && (
        <div className="rounded-xl border bg-muted/40 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="font-semibold text-brand">{selectedLevel.name} course outline</h3>
              {selectedLevel.description && (
                <p className="mt-1 text-sm text-muted-foreground">{selectedLevel.description}</p>
              )}
            </div>
            <p className="font-bold text-primary">{formatKES(selectedLevel.total_fee)}</p>
          </div>
          {units.isLoading ? (
            <p className="mt-3 text-sm text-muted-foreground">Loading units…</p>
          ) : units.error ? (
            <p role="alert" className="mt-3 text-sm text-destructive">
              Could not load units: {units.error.message}
            </p>
          ) : units.data?.length ? (
            <ul className="mt-3 grid gap-2 sm:grid-cols-2">
              {units.data.map((unit) => (
                <li key={unit.id} className="rounded-lg bg-background px-3 py-2 text-sm">
                  {unit.code && <span className="font-semibold">{unit.code} · </span>}
                  {unit.title}
                  {unit.semester && (
                    <span className="block text-xs text-muted-foreground">{unit.semester}</span>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">
              Unit details will be shared by the school.
            </p>
          )}
          {(selectedLevel.fee_structure_path || selectedLevel.fee_structure_url) && (
            <div className="mt-3">
              <FeeStructureActions
                path={selectedLevel.fee_structure_path}
                url={selectedLevel.fee_structure_url}
                filename={
                  selectedLevel.fee_structure_file_name ?? `${selectedLevel.name}-fee-structure.pdf`
                }
                title={`${selectedLevel.name} fee structure`}
              />
            </div>
          )}
        </div>
      )}
      <fieldset className="space-y-4">
        <legend className="font-semibold text-brand">Education and location</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Highest qualification">
            <Input
              value={values.highest_qualification}
              onChange={(e) => setValues({ ...values, highest_qualification: e.target.value })}
            />
          </Field>
          <Field label="Institution attended">
            <Input
              value={values.institution_attended}
              onChange={(e) => setValues({ ...values, institution_attended: e.target.value })}
            />
          </Field>
          <Field label="Year completed">
            <Input
              type="number"
              min="1950"
              max={new Date().getFullYear()}
              value={values.year_completed}
              onChange={(e) => setValues({ ...values, year_completed: e.target.value })}
            />
          </Field>
          <Field label="KCSE grade">
            <Input
              maxLength={4}
              value={values.kcse_grade}
              onChange={(e) => setValues({ ...values, kcse_grade: e.target.value })}
            />
          </Field>
          <Field label="County">
            <Input
              value={values.county}
              onChange={(e) => setValues({ ...values, county: e.target.value })}
            />
          </Field>
          <Field label="Town">
            <Input
              value={values.town}
              onChange={(e) => setValues({ ...values, town: e.target.value })}
            />
          </Field>
          <Field label="Postal or residential address">
            <Input
              value={values.address}
              onChange={(e) => setValues({ ...values, address: e.target.value })}
            />
          </Field>
        </div>
      </fieldset>
      <fieldset className="space-y-4">
        <legend className="font-semibold text-brand">Supporting documents</legend>
        <p className="text-sm text-muted-foreground">
          Upload clear scans or photos as PDF, JPG, or PNG. Each file must be 5 MB or smaller.
          Documents are optional at this stage and can be provided to admissions later.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          {applicationDocumentTypes.map(({ id, label }) => (
            <Field key={id} label={label}>
              <Input
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                multiple={id === "Other certificates"}
                onChange={(event) => {
                  const files = Array.from(event.target.files ?? []);
                  const invalid = files.find(
                    (file) => file.size > maxDocumentSize || !documentContentType(file),
                  );
                  if (invalid) {
                    toast.error(
                      invalid.size > maxDocumentSize
                        ? `${invalid.name} is larger than the 5 MB limit.`
                        : `${invalid.name} is not a PDF, JPG, or PNG file.`,
                    );
                    event.target.value = "";
                    return;
                  }
                  setDocuments((current) => ({
                    ...current,
                    [id]:
                      id === "Other certificates" ? [...current[id], ...files] : files.slice(0, 1),
                  }));
                }}
              />
              {documents[id].length > 0 && (
                <span className="block text-xs font-normal text-muted-foreground">
                  {documents[id].map((file) => file.name).join(", ")}
                </span>
              )}
            </Field>
          ))}
        </div>
      </fieldset>
      <fieldset className="space-y-4">
        <legend className="font-semibold text-brand">Additional information</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Previous training">
            <Textarea
              maxLength={1000}
              rows={3}
              value={values.previous_training}
              onChange={(e) => setValues({ ...values, previous_training: e.target.value })}
            />
          </Field>
          <Field label="Work experience">
            <Textarea
              maxLength={1000}
              rows={3}
              value={values.work_experience}
              onChange={(e) => setValues({ ...values, work_experience: e.target.value })}
            />
          </Field>
          <Field label="Special requirements">
            <Textarea
              maxLength={1000}
              rows={3}
              value={values.special_requirements}
              onChange={(e) => setValues({ ...values, special_requirements: e.target.value })}
            />
          </Field>
          <Field label="How did you hear about us?">
            <Input
              value={values.heard_about}
              onChange={(e) => setValues({ ...values, heard_about: e.target.value })}
            />
          </Field>
        </div>
      </fieldset>
      <p className="text-xs text-muted-foreground">
        Your information will be used by Profia Institute to process your application.
      </p>
      <Button
        type="submit"
        disabled={submitting || !options.data?.courses.length}
        className="w-full sm:w-auto"
      >
        <FileCheck2 />
        {submitting ? "Submitting application…" : "Submit application"}
      </Button>
    </form>
  );
}

export function ApplicationStatusLookup({ initialNumber }: { initialNumber?: string }) {
  const [number, setNumber] = useState(initialNumber ?? "");
  const [contact, setContact] = useState("");
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [busy, setBusy] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState("");
  const adminMessage =
    result && typeof result["admin_message"] === "string" ? result["admin_message"] : "";

  async function lookup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setResult(null);
    setNotFound(false);
    const { data, error: queryError } = await supabase.rpc("check_application_status", {
      _number: number.trim(),
      _contact: contact.trim(),
    });
    setBusy(false);
    if (queryError) setError(queryError.message);
    else if (!data || typeof data !== "object" || Array.isArray(data)) setNotFound(true);
    else setResult(data as Record<string, unknown>);
  }
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <form
        onSubmit={lookup}
        className="space-y-4 rounded-2xl border bg-card p-6 shadow-card sm:p-8"
      >
        <p className="eyebrow">Admissions</p>
        <h2 className="text-2xl font-bold text-brand">Check your application</h2>
        <p className="text-sm text-muted-foreground">
          Enter your application number and the email address or phone number used on the
          application.
        </p>
        <Field label="Application number">
          <Input
            required
            value={number}
            onChange={(e) => setNumber(e.target.value)}
            placeholder="PRF-2026-00001"
          />
        </Field>
        <Field label="Email or phone number">
          <Input required value={contact} onChange={(e) => setContact(e.target.value)} />
        </Field>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        {notFound && (
          <p role="status" className="text-sm text-destructive">
            No application matched those details. Check the application number and contact
            information.
          </p>
        )}
        <Button disabled={busy}>{busy ? "Checking…" : "Check status"}</Button>
      </form>
      {result && (
        <section className="rounded-xl border bg-card p-6 shadow-card">
          <p className="text-xs font-semibold uppercase tracking-wide text-primary">
            {String(result["application_number"] ?? number)}
          </p>
          <h3 className="mt-1 text-xl font-bold text-brand">
            Hello {String(result["first_name"] ?? "applicant")}
          </h3>
          <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
            <Info
              label="Status"
              value={String(result["status"] ?? "Unknown").replaceAll("_", " ")}
            />
            <Info label="Course" value={String(result["course"] ?? "Not assigned")} />
            <Info label="Intake" value={String(result["intake"] ?? "Not assigned")} />
            <Info
              label="Submitted"
              value={
                result["created_at"]
                  ? new Date(String(result["created_at"])).toLocaleDateString("en-KE")
                  : "—"
              }
            />
          </div>
          {adminMessage && <p className="mt-4 rounded-lg bg-cream p-4 text-sm">{adminMessage}</p>}
        </section>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-1.5 text-sm font-medium">
      {label}
      {children}
    </label>
  );
}
function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-muted/60 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 font-medium capitalize">{value}</p>
    </div>
  );
}
function LoadingPanel() {
  return (
    <div
      role="status"
      className="animate-pulse rounded-xl border bg-card p-8 text-sm text-muted-foreground"
    >
      Loading admissions options…
    </div>
  );
}
function ErrorPanel({ message, retry }: { message: string; retry: () => void }) {
  return (
    <div className="rounded-xl border border-destructive/30 bg-card p-5">
      <p role="alert" className="text-sm text-destructive">
        {message}
      </p>
      <Button className="mt-3" variant="outline" onClick={retry}>
        Retry
      </Button>
    </div>
  );
}
function relationName(value: unknown) {
  if (Array.isArray(value)) return relationName(value[0]);
  if (value && typeof value === "object" && "name" in value) return String(value.name);
  return "Profia Institute";
}
