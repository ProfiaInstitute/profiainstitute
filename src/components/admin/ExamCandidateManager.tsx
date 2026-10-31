import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDownToLine, ClipboardCheck, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useUser } from "@/lib/auth";
import { createExcelWorkbook } from "@/lib/excel-export";

const examBodies = ["KASNEB", "TVETA", "ICPAK", "NITA", "Other"] as const;

type SittingDraft = {
  exam_body: string;
  qualification: string;
  title: string;
  course_id: string;
  level_id: string;
  registration_deadline: string;
  exam_date: string;
  minimum_passing_score: string;
  required_unit_ids: string[];
};

const emptyDraft: SittingDraft = {
  exam_body: "KASNEB",
  qualification: "",
  title: "",
  course_id: "",
  level_id: "",
  registration_deadline: "",
  exam_date: "",
  minimum_passing_score: "50",
  required_unit_ids: [],
};

type ExamSitting = {
  id: string;
  exam_body: string;
  qualification: string;
  title: string;
  course_id: string;
  level_id: string;
  registration_deadline: string | null;
  exam_date: string | null;
  minimum_passing_score: number;
  required_unit_ids: string[];
  status: string;
  created_at: string;
};

type Candidate = {
  id: string;
  student_id: string;
  status: string;
  external_reference: string | null;
  student: {
    student_number: string;
    first_name: string;
    middle_name: string | null;
    last_name: string;
    email: string;
    phone: string | null;
  } | null;
};

type Assessment = {
  student_id: string;
  unit_id: string;
  score: number | null;
};

function downloadRoster(rows: readonly object[], name: string) {
  if (!rows.length) {
    toast.error("There are no nominated candidates to export.");
    return;
  }
  try {
    const bytes = createExcelWorkbook(rows);
    const blob = new Blob([bytes], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${name.replace(/[^a-z0-9-]+/gi, "-").replace(/^-|-$/g, "")}-candidates.xlsx`;
    anchor.click();
    URL.revokeObjectURL(url);
  } catch (error) {
    toast.error("Could not export candidate roster", {
      description: error instanceof Error ? error.message : "The workbook could not be created.",
    });
  }
}

export function ExamCandidateManager() {
  const queryClient = useQueryClient();
  const { user } = useUser();
  const [draft, setDraft] = useState<SittingDraft>(emptyDraft);
  const [selectedSittingId, setSelectedSittingId] = useState("");
  const [selectedStudents, setSelectedStudents] = useState<string[]>([]);
  const coursesQuery = useQuery({
    queryKey: ["admin", "exam-sitting-courses"],
    queryFn: async () => {
      const { data, error } = await supabase.from("courses").select("id,title").order("title");
      if (error) throw error;
      return data;
    },
  });
  const levelsQuery = useQuery({
    queryKey: ["admin", "exam-sitting-levels"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("course_levels")
        .select("id,course_id,name,sort_order")
        .order("sort_order");
      if (error) throw error;
      return data;
    },
  });
  const unitsQuery = useQuery({
    queryKey: ["admin", "exam-sitting-units", draft.course_id, draft.level_id],
    enabled: Boolean(draft.course_id && draft.level_id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("course_units")
        .select("id,title,code,semester")
        .eq("course_id", draft.course_id)
        .eq("level_id", draft.level_id)
        .order("sort_order");
      if (error) throw error;
      return data;
    },
  });
  const sittingsQuery = useQuery({
    queryKey: ["admin", "exam-sittings"],
    queryFn: async (): Promise<ExamSitting[]> => {
      const { data, error } = await supabase
        .from("exam_sittings")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as ExamSitting[];
    },
  });
  const selectedSitting = sittingsQuery.data?.find((sitting) => sitting.id === selectedSittingId);
  const candidatesQuery = useQuery({
    queryKey: ["admin", "exam-sitting-candidates", selectedSittingId],
    enabled: Boolean(selectedSittingId),
    queryFn: async (): Promise<Candidate[]> => {
      const { data: candidates, error } = await supabase
        .from("exam_sitting_candidates")
        .select("id,student_id,status,external_reference")
        .eq("sitting_id", selectedSittingId)
        .order("created_at");
      if (error) throw error;
      if (!candidates.length) return [];
      const studentIds = [...new Set(candidates.map((candidate) => candidate.student_id))];
      const { data: students, error: studentsError } = await supabase
        .from("students")
        .select("id,student_number,first_name,middle_name,last_name,email,phone")
        .in("id", studentIds);
      if (studentsError) throw studentsError;
      const studentById = new Map(students.map((student) => [student.id, student]));
      return candidates.map((candidate) => ({
        ...candidate,
        student: studentById.get(candidate.student_id) ?? null,
      }));
    },
  });
  const enrollmentQuery = useQuery({
    queryKey: ["admin", "exam-sitting-enrollment", selectedSitting?.id],
    enabled: Boolean(selectedSitting),
    queryFn: async () => {
      const sitting = selectedSitting!;
      const [primary, standard, online] = await Promise.all([
        supabase
          .from("students")
          .select("id")
          .eq("course_id", sitting.course_id)
          .eq("level_id", sitting.level_id)
          .eq("status", "active"),
        supabase
          .from("enrollments")
          .select("student_id")
          .eq("course_id", sitting.course_id)
          .eq("level_id", sitting.level_id)
          .eq("status", "active"),
        supabase
          .from("online_course_enrollments")
          .select("student_id")
          .eq("course_id", sitting.course_id)
          .eq("level_id", sitting.level_id)
          .eq("status", "active"),
      ]);
      if (primary.error) throw primary.error;
      if (standard.error) throw standard.error;
      if (online.error) throw online.error;
      const studentIds = [
        ...new Set([
          ...primary.data.map((student) => student.id),
          ...standard.data.map((enrollment) => enrollment.student_id),
          ...online.data.map((enrollment) => enrollment.student_id),
        ]),
      ];
      if (!studentIds.length) return { students: [], assessments: [] as Assessment[] };
      const [studentsResult, resultsResult] = await Promise.all([
        supabase
          .from("students")
          .select("id,student_number,first_name,middle_name,last_name,email,phone,status")
          .in("id", studentIds)
          .eq("status", "active")
          .order("last_name"),
        sitting.required_unit_ids.length
          ? supabase
              .from("results")
              .select("student_id,unit_id,score,updated_at")
              .in("student_id", studentIds)
              .in("unit_id", sitting.required_unit_ids)
              .eq("published", true)
              .order("updated_at", { ascending: false })
          : Promise.resolve({ data: [] as Assessment[], error: null }),
      ]);
      if (studentsResult.error) throw studentsResult.error;
      if (resultsResult.error) throw resultsResult.error;
      return {
        students: studentsResult.data,
        assessments: (resultsResult.data ?? []) as Assessment[],
      };
    },
  });
  const saveSitting = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase
        .from("exam_sittings")
        .insert({
          exam_body: draft.exam_body,
          qualification: draft.qualification.trim(),
          title: draft.title.trim(),
          course_id: draft.course_id,
          level_id: draft.level_id,
          registration_deadline: draft.registration_deadline || null,
          exam_date: draft.exam_date || null,
          minimum_passing_score: Number(draft.minimum_passing_score),
          required_unit_ids: draft.required_unit_ids,
          created_by: user?.id ?? null,
        })
        .select("id")
        .single();
      if (error) throw error;
      return data.id;
    },
    onSuccess: async (id) => {
      toast.success("Exam sitting saved");
      setDraft(emptyDraft);
      setSelectedSittingId(id);
      setSelectedStudents([]);
      await queryClient.invalidateQueries({ queryKey: ["admin", "exam-sittings"] });
    },
    onError: (error) => toast.error("Could not save exam sitting", { description: error.message }),
  });
  const nominateCandidates = useMutation({
    mutationFn: async () => {
      if (!selectedSittingId || !selectedStudents.length) {
        throw new Error("Select at least one ready candidate.");
      }
      const { error } = await supabase.from("exam_sitting_candidates").upsert(
        selectedStudents.map((student_id) => ({
          sitting_id: selectedSittingId,
          student_id,
          status: "nominated",
          nominated_by: user?.id ?? null,
        })),
        { onConflict: "sitting_id,student_id", ignoreDuplicates: true },
      );
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("Ready candidates nominated");
      setSelectedStudents([]);
      await queryClient.invalidateQueries({
        queryKey: ["admin", "exam-sitting-candidates", selectedSittingId],
      });
    },
    onError: (error) =>
      toast.error("Could not nominate candidates", { description: error.message }),
  });
  const updateCandidateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase
        .from("exam_sitting_candidates")
        .update({ status })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["admin", "exam-sitting-candidates", selectedSittingId],
      });
    },
    onError: (error) =>
      toast.error("Could not update candidate status", { description: error.message }),
  });

  const courseById = useMemo(
    () => new Map(coursesQuery.data?.map((course) => [course.id, course.title]) ?? []),
    [coursesQuery.data],
  );
  const levelById = useMemo(
    () => new Map(levelsQuery.data?.map((level) => [level.id, level.name]) ?? []),
    [levelsQuery.data],
  );
  const resultMap = useMemo(() => {
    const map = new Map<string, number | null>();
    for (const result of enrollmentQuery.data?.assessments ?? []) {
      const key = `${result.student_id}:${result.unit_id}`;
      if (!map.has(key)) map.set(key, result.score);
    }
    return map;
  }, [enrollmentQuery.data?.assessments]);
  const readiness = (enrollmentQuery.data?.students ?? []).map((student) => {
    const missingUnits = (selectedSitting?.required_unit_ids ?? []).filter(
      (unitId) =>
        !resultMap.has(`${student.id}:${unitId}`) ||
        resultMap.get(`${student.id}:${unitId}`) === null,
    );
    const failedUnits = (selectedSitting?.required_unit_ids ?? []).filter((unitId) => {
      const score = resultMap.get(`${student.id}:${unitId}`);
      return (
        score !== undefined && score !== null && score < selectedSitting!.minimum_passing_score
      );
    });
    const passedUnits = (selectedSitting?.required_unit_ids ?? []).filter((unitId) => {
      const score = resultMap.get(`${student.id}:${unitId}`);
      return (
        score !== undefined && score !== null && score >= selectedSitting!.minimum_passing_score
      );
    });
    return {
      ...student,
      ready: missingUnits.length === 0 && failedUnits.length === 0,
      missingUnits,
      failedUnits,
      passedUnits,
    };
  });
  const candidateStatuses = candidatesQuery.data ?? [];
  const nominatedRows = candidateStatuses
    .filter((candidate) => candidate.status !== "withdrawn" && candidate.student)
    .map((candidate) => ({
      "Exam body": selectedSitting?.exam_body ?? "",
      Qualification: selectedSitting?.qualification ?? "",
      "Exam sitting": selectedSitting?.title ?? "",
      "Student number": candidate.student?.student_number ?? "",
      "First name": candidate.student?.first_name ?? "",
      "Middle name": candidate.student?.middle_name ?? "",
      "Last name": candidate.student?.last_name ?? "",
      Email: candidate.student?.email ?? "",
      Phone: candidate.student?.phone ?? "",
      Status: candidate.status,
      "Registration reference": candidate.external_reference ?? "",
    }));

  function submitSitting(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft.title.trim() || !draft.qualification.trim() || !draft.course_id || !draft.level_id) {
      toast.error("Enter the exam, qualification, course, and course level.");
      return;
    }
    const passingScore = Number(draft.minimum_passing_score);
    if (!Number.isFinite(passingScore) || passingScore < 0 || passingScore > 100) {
      toast.error("The minimum pass score must be between 0 and 100.");
      return;
    }
    if (
      draft.registration_deadline &&
      draft.exam_date &&
      draft.registration_deadline > draft.exam_date
    ) {
      toast.error("The registration deadline cannot be after the exam date.");
      return;
    }
    saveSitting.mutate();
  }

  function toggleCandidate(studentId: string) {
    setSelectedStudents((current) =>
      current.includes(studentId)
        ? current.filter((id) => id !== studentId)
        : [...current, studentId],
    );
  }

  if (coursesQuery.error || levelsQuery.error || sittingsQuery.error) {
    const error = coursesQuery.error ?? levelsQuery.error ?? sittingsQuery.error;
    return (
      <section className="rounded-xl border bg-card p-5">
        <h2 className="font-semibold text-brand">Could not load exam sitting data</h2>
        <p className="mt-2 text-sm text-destructive">{error?.message}</p>
        <p className="mt-2 text-sm text-muted-foreground">
          Confirm migration <code>0041_exam_sittings_and_candidates.sql</code> has been applied.
        </p>
      </section>
    );
  }

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-primary/30 bg-cream p-5">
        <div className="flex gap-3">
          <ClipboardCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          <div>
            <h2 className="font-semibold text-brand">Exam readiness & candidate rosters</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Set the course-level and required published results for a sitting. Readiness is a
              local checklist only; staff must verify the exam body’s current rules and approve
              nominations before submitting any candidate data externally.
            </p>
          </div>
        </div>
      </section>

      <form
        onSubmit={submitSitting}
        className="space-y-4 rounded-xl border bg-card p-5 shadow-card"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold text-brand">Create an exam sitting</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Readiness checks only the unit results and pass mark configured here.
            </p>
          </div>
          {draft.title && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              aria-label="Clear exam sitting form"
              onClick={() => setDraft(emptyDraft)}
            >
              <X />
            </Button>
          )}
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Exam body">
            <select
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={draft.exam_body}
              onChange={(event) => setDraft({ ...draft, exam_body: event.target.value })}
            >
              {examBodies.map((body) => (
                <option key={body}>{body}</option>
              ))}
            </select>
          </Field>
          <Field label="Qualification / programme">
            <Input
              required
              maxLength={180}
              value={draft.qualification}
              onChange={(event) => setDraft({ ...draft, qualification: event.target.value })}
            />
          </Field>
          <Field label="Sitting / examination name">
            <Input
              required
              maxLength={180}
              value={draft.title}
              onChange={(event) => setDraft({ ...draft, title: event.target.value })}
              placeholder="e.g. November 2026 examination"
            />
          </Field>
          <Field label="Course">
            <select
              required
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={draft.course_id}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  course_id: event.target.value,
                  level_id: "",
                  required_unit_ids: [],
                })
              }
            >
              <option value="">Select a course</option>
              {coursesQuery.data?.map((course) => (
                <option key={course.id} value={course.id}>
                  {course.title}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Course level">
            <select
              required
              disabled={!draft.course_id}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={draft.level_id}
              onChange={(event) =>
                setDraft({ ...draft, level_id: event.target.value, required_unit_ids: [] })
              }
            >
              <option value="">Select a course level</option>
              {levelsQuery.data
                ?.filter((level) => level.course_id === draft.course_id)
                .map((level) => (
                  <option key={level.id} value={level.id}>
                    {level.name}
                  </option>
                ))}
            </select>
          </Field>
          <Field label="Minimum pass score (%)">
            <Input
              type="number"
              min="0"
              max="100"
              step="0.01"
              required
              value={draft.minimum_passing_score}
              onChange={(event) =>
                setDraft({ ...draft, minimum_passing_score: event.target.value })
              }
            />
          </Field>
          <Field label="Registration deadline (optional)">
            <Input
              type="date"
              value={draft.registration_deadline}
              onChange={(event) =>
                setDraft({ ...draft, registration_deadline: event.target.value })
              }
            />
          </Field>
          <Field label="Exam date (optional)">
            <Input
              type="date"
              value={draft.exam_date}
              onChange={(event) => setDraft({ ...draft, exam_date: event.target.value })}
            />
          </Field>
        </div>
        {draft.course_id && draft.level_id && (
          <fieldset className="space-y-2 rounded-lg border p-3">
            <legend className="px-1 text-sm font-medium">Required units</legend>
            <p className="text-xs text-muted-foreground">
              Select required units; a student is ready only when each has a published result at or
              above the pass score. Leave all unchecked if enrollment alone is your checklist.
            </p>
            {unitsQuery.isLoading ? (
              <p className="text-sm text-muted-foreground">Loading level units…</p>
            ) : unitsQuery.error ? (
              <p role="alert" className="text-sm text-destructive">
                Could not load level units: {unitsQuery.error.message}
              </p>
            ) : unitsQuery.data?.length ? (
              <div className="grid gap-2 sm:grid-cols-2">
                {unitsQuery.data.map((unit) => (
                  <label key={unit.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={draft.required_unit_ids.includes(unit.id)}
                      onChange={() =>
                        setDraft((current) => ({
                          ...current,
                          required_unit_ids: current.required_unit_ids.includes(unit.id)
                            ? current.required_unit_ids.filter((id) => id !== unit.id)
                            : [...current.required_unit_ids, unit.id],
                        }))
                      }
                    />
                    <span>
                      {unit.code ? `${unit.code} · ` : ""}
                      {unit.title}
                      {unit.semester ? ` (${unit.semester})` : ""}
                    </span>
                  </label>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                No units are configured for this course level.
              </p>
            )}
          </fieldset>
        )}
        <Button type="submit" disabled={saveSitting.isPending || sittingsQuery.isLoading}>
          <Plus /> {saveSitting.isPending ? "Saving…" : "Save sitting"}
        </Button>
      </form>

      <section className="space-y-3 rounded-xl border bg-card p-5 shadow-card">
        <div>
          <h2 className="font-semibold text-brand">Candidate readiness</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Choose a saved sitting to see its active course-level cohort.
          </p>
        </div>
        {sittingsQuery.data?.length ? (
          <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
            <Field label="Exam sitting">
              <select
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={selectedSittingId}
                onChange={(event) => {
                  setSelectedSittingId(event.target.value);
                  setSelectedStudents([]);
                }}
              >
                <option value="">Select an exam sitting</option>
                {sittingsQuery.data.map((sitting) => (
                  <option key={sitting.id} value={sitting.id}>
                    {sitting.exam_body} · {sitting.title} ·{" "}
                    {courseById.get(sitting.course_id) ?? "Course"} ·{" "}
                    {levelById.get(sitting.level_id) ?? "Level"}
                  </option>
                ))}
              </select>
            </Field>
            <Button
              type="button"
              variant="outline"
              disabled={!nominatedRows.length}
              onClick={() =>
                selectedSitting &&
                downloadRoster(
                  nominatedRows,
                  `${selectedSitting.exam_body}-${selectedSitting.title}`,
                )
              }
            >
              <ArrowDownToLine /> Export nominated roster
            </Button>
          </div>
        ) : (
          <p className="rounded-lg border p-4 text-sm text-muted-foreground">
            No exam sittings yet. Add one above to check candidate readiness.
          </p>
        )}

        {selectedSitting && (
          <>
            <div className="rounded-lg border bg-muted/30 p-3 text-sm">
              <p className="font-medium text-brand">
                {selectedSitting.exam_body}: {selectedSitting.qualification}
              </p>
              <p className="mt-1 text-muted-foreground">
                Registration closes {selectedSitting.registration_deadline ?? "not set"} · Exam date{" "}
                {selectedSitting.exam_date ?? "not set"} · Minimum pass score{" "}
                {selectedSitting.minimum_passing_score}%
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Readiness is not a confirmation of the external body’s rules, fee clearance, or
                identity-document validity. Verify those separately before nomination.
              </p>
            </div>
            {enrollmentQuery.isLoading || candidatesQuery.isLoading ? (
              <p role="status" className="text-sm text-muted-foreground">
                Checking enrolled students and published results…
              </p>
            ) : enrollmentQuery.error || candidatesQuery.error ? (
              <p role="alert" className="text-sm text-destructive">
                Could not calculate candidate readiness:{" "}
                {(enrollmentQuery.error ?? candidatesQuery.error)?.message}
              </p>
            ) : readiness.length ? (
              <>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm text-muted-foreground">
                    {readiness.filter((candidate) => candidate.ready).length} ready ·{" "}
                    {readiness.length} active enrolled students
                  </p>
                  <Button
                    type="button"
                    size="sm"
                    disabled={
                      !selectedStudents.length ||
                      nominateCandidates.isPending ||
                      selectedSitting.status !== "open"
                    }
                    onClick={() => nominateCandidates.mutate()}
                  >
                    {nominateCandidates.isPending
                      ? "Saving nominations…"
                      : `Nominate selected (${selectedStudents.length})`}
                  </Button>
                </div>
                <div className="overflow-x-auto rounded-lg border">
                  <table className="w-full min-w-[700px] text-left text-sm">
                    <thead className="bg-muted/40">
                      <tr>
                        <th className="px-3 py-2">Student</th>
                        <th className="px-3 py-2">Readiness</th>
                        <th className="px-3 py-2">Required-unit results</th>
                        <th className="px-3 py-2">Nomination</th>
                      </tr>
                    </thead>
                    <tbody>
                      {readiness.map((candidate) => {
                        const existing = candidateStatuses.find(
                          (row) => row.student_id === candidate.id,
                        );
                        return (
                          <tr key={candidate.id} className="border-t">
                            <td className="px-3 py-3">
                              <p className="font-medium">
                                {candidate.first_name} {candidate.middle_name} {candidate.last_name}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {candidate.student_number} · {candidate.email}
                              </p>
                            </td>
                            <td className="px-3 py-3">
                              <Badge variant={candidate.ready ? "default" : "destructive"}>
                                {candidate.ready ? "Ready" : "Needs review"}
                              </Badge>
                              {!candidate.ready && (
                                <p className="mt-1 max-w-xs text-xs text-muted-foreground">
                                  {candidate.missingUnits.length
                                    ? `${candidate.missingUnits.length} missing published result(s)`
                                    : `${candidate.failedUnits.length} result(s) below pass score`}
                                </p>
                              )}
                            </td>
                            <td className="px-3 py-3">
                              {selectedSitting.required_unit_ids.length
                                ? `${candidate.passedUnits.length}/${selectedSitting.required_unit_ids.length} passed`
                                : "Enrollment only"}
                            </td>
                            <td className="px-3 py-3">
                              {existing ? (
                                <select
                                  aria-label={`Nomination status for ${candidate.student_number}`}
                                  className="h-9 rounded-md border border-input bg-background px-2 text-sm capitalize"
                                  value={existing.status}
                                  disabled={updateCandidateStatus.isPending}
                                  onChange={(event) =>
                                    updateCandidateStatus.mutate({
                                      id: existing.id,
                                      status: event.target.value,
                                    })
                                  }
                                >
                                  {[
                                    "nominated",
                                    "registered",
                                    "sat",
                                    "passed",
                                    "failed",
                                    "withdrawn",
                                  ].map((status) => (
                                    <option key={status} value={status}>
                                      {status}
                                    </option>
                                  ))}
                                </select>
                              ) : (
                                <label className="flex items-center gap-2">
                                  <input
                                    type="checkbox"
                                    aria-label={`Select ${candidate.student_number} for nomination`}
                                    disabled={!candidate.ready || selectedSitting.status !== "open"}
                                    checked={selectedStudents.includes(candidate.id)}
                                    onChange={() => toggleCandidate(candidate.id)}
                                  />
                                  <span className="text-xs text-muted-foreground">
                                    {candidate.ready ? "Select to nominate" : "Not nominated"}
                                  </span>
                                </label>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <p className="rounded-lg border p-4 text-sm text-muted-foreground">
                No active students are enrolled in this course level.
              </p>
            )}
            {candidateStatuses.length > 0 && (
              <p className="text-xs text-muted-foreground">
                {candidateStatuses.length} saved candidate records. Use the export button for the
                nominated roster; it includes student number, name, email, phone, and registration
                reference, but not national ID or date of birth.
              </p>
            )}
          </>
        )}
      </section>
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
