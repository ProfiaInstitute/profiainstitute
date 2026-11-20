import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, Clock3, Plus, Radio, Trash2, Users, Video } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LiveClassRoom } from "@/components/learning/LiveClassRoom";
import { supabase } from "@/integrations/supabase/client";
import { transitionLiveClass } from "@/lib/live-classes";
import type { Tables } from "@/integrations/supabase/types";

type LiveClassSession = Tables<"live_class_sessions">;
type Student = Pick<
  Tables<"students">,
  "id" | "first_name" | "last_name" | "student_number" | "study_mode" | "status"
>;
type SessionMember = { student_id: string; student: Student | null };

function localDateTimeValue(value: Date) {
  const date = new Date(value.getTime() - value.getTimezoneOffset() * 60_000);
  return date.toISOString().slice(0, 16);
}

const sessionTime = new Intl.DateTimeFormat("en-KE", {
  dateStyle: "medium",
  timeStyle: "short",
});

export function LiveClassAdminPanel() {
  const queryClient = useQueryClient();
  const [unitId, setUnitId] = useState("");
  const [facilitatorId, setFacilitatorId] = useState("");
  const [title, setTitle] = useState("");
  const [scheduledAt, setScheduledAt] = useState(() =>
    localDateTimeValue(new Date(Date.now() + 15 * 60_000)),
  );
  const [duration, setDuration] = useState("60");
  const [selectedSessionId, setSelectedSessionId] = useState("");
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [activeSession, setActiveSession] = useState<LiveClassSession | null>(null);

  const unitsQuery = useQuery({
    queryKey: ["live-class-admin", "units"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("course_units")
        .select("id,title,course_id")
        .order("title");
      if (error) throw error;
      return data;
    },
  });
  const assignmentsQuery = useQuery({
    queryKey: ["live-class-admin", "facilitators"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("facilitator_unit_assignments")
        .select("facilitator_id,unit_id")
        .eq("active", true);
      if (error) throw error;
      const facilitatorIds = [...new Set(data.map((row) => row.facilitator_id))];
      if (!facilitatorIds.length) return { assignments: data, names: new Map<string, string>() };
      const { data: profiles, error: profileError } = await supabase
        .from("profiles")
        .select("id,full_name")
        .in("id", facilitatorIds);
      if (profileError) throw profileError;
      return {
        assignments: data,
        names: new Map(profiles.map((profile) => [profile.id, profile.full_name ?? "Facilitator"])),
      };
    },
  });
  const studentsQuery = useQuery({
    queryKey: ["live-class-admin", "students"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("students")
        .select("id,first_name,last_name,student_number,study_mode,status")
        .eq("status", "active")
        .not("user_id", "is", null)
        .order("last_name");
      if (error) throw error;
      return data;
    },
  });
  const sessionsQuery = useQuery({
    queryKey: ["live-class-admin", "sessions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("live_class_sessions")
        .select("*")
        .order("scheduled_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data;
    },
  });

  const unitTitleById = useMemo(
    () => new Map((unitsQuery.data ?? []).map((unit) => [unit.id, unit.title])),
    [unitsQuery.data],
  );
  const selectedUnitFacilitators = (assignmentsQuery.data?.assignments ?? []).filter(
    (assignment) => assignment.unit_id === unitId,
  );

  const membersQuery = useQuery({
    queryKey: ["live-class-admin", "members", selectedSessionId],
    enabled: Boolean(selectedSessionId) && studentsQuery.isSuccess,
    queryFn: async (): Promise<SessionMember[]> => {
      const { data: members, error } = await supabase
        .from("live_class_members")
        .select("student_id")
        .eq("session_id", selectedSessionId);
      if (error) throw error;
      const studentsById = new Map(
        (studentsQuery.data ?? []).map((student) => [student.id, student]),
      );
      return members.map((member) => ({
        student_id: member.student_id,
        student: studentsById.get(member.student_id) ?? null,
      }));
    },
  });

  const createSession = useMutation({
    mutationFn: async () => {
      const start = new Date(scheduledAt);
      if (
        !unitId ||
        !facilitatorId ||
        !title.trim() ||
        Number.isNaN(start.getTime()) ||
        start <= new Date()
      ) {
        throw new Error("Choose a unit, assigned facilitator, title, and future start time.");
      }
      if (
        !selectedUnitFacilitators.some((assignment) => assignment.facilitator_id === facilitatorId)
      ) {
        throw new Error("Choose a facilitator assigned to the selected unit.");
      }
      const minutes = Number(duration);
      if (!Number.isInteger(minutes) || minutes < 15 || minutes > 240) {
        throw new Error("Class duration must be between 15 and 240 minutes.");
      }
      const { error } = await supabase.from("live_class_sessions").insert({
        unit_id: unitId,
        facilitator_id: facilitatorId,
        title: title.trim(),
        scheduled_at: start.toISOString(),
        duration_minutes: minutes,
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      setTitle("");
      await queryClient.invalidateQueries({ queryKey: ["live-class-admin", "sessions"] });
      toast.success("Live class scheduled");
    },
    onError: (error) =>
      toast.error("Could not schedule the live class", { description: error.message }),
  });

  const updateSessionStatus = useMutation({
    mutationFn: async ({
      session,
      status,
    }: {
      session: LiveClassSession;
      status: "live" | "ended" | "cancelled";
    }) => {
      const action = status === "live" ? "start" : status === "ended" ? "end" : "cancel";
      await transitionLiveClass(session.id, action);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["live-class-admin", "sessions"] });
      toast.success("Live class updated");
    },
    onError: (error) =>
      toast.error("Could not update the live class", { description: error.message }),
  });

  const addMember = useMutation({
    mutationFn: async () => {
      if (!selectedSessionId || !selectedStudentId) {
        throw new Error("Select a class and student.");
      }
      const { error } = await supabase.from("live_class_members").insert({
        session_id: selectedSessionId,
        student_id: selectedStudentId,
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      setSelectedStudentId("");
      await queryClient.invalidateQueries({
        queryKey: ["live-class-admin", "members", selectedSessionId],
      });
      toast.success("Student added to this class");
    },
    onError: (error) => toast.error("Could not add student", { description: error.message }),
  });

  const removeMember = useMutation({
    mutationFn: async (studentId: string) => {
      const { error } = await supabase
        .from("live_class_members")
        .delete()
        .eq("session_id", selectedSessionId)
        .eq("student_id", studentId);
      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["live-class-admin", "members", selectedSessionId],
      });
      toast.success("Student removed from this class");
    },
    onError: (error) => toast.error("Could not remove student", { description: error.message }),
  });

  if (activeSession) {
    return (
      <LiveClassRoom
        sessionId={activeSession.id}
        title={activeSession.title}
        onClose={() => setActiveSession(null)}
      />
    );
  }

  const selectedMemberIds = new Set((membersQuery.data ?? []).map((member) => member.student_id));
  const availableStudents = (studentsQuery.data ?? []).filter(
    (student) => !selectedMemberIds.has(student.id),
  );

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border bg-gradient-to-br from-sky-50 via-background to-indigo-50 p-5 dark:from-sky-950/30 dark:to-indigo-950/20">
        <div className="flex items-start gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
            <Video className="h-5 w-5" />
          </span>
          <div>
            <h2 className="font-semibold text-brand">Live class scheduling</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Schedule sessions for course units and optionally add students to a specific class.
              Adding a student here grants class access without changing their study mode or fees.
            </p>
          </div>
        </div>
        {(unitsQuery.error || assignmentsQuery.error || studentsQuery.error) && (
          <p className="mt-4 text-sm text-destructive" role="alert">
            Could not load scheduling data:{" "}
            {unitsQuery.error?.message ??
              assignmentsQuery.error?.message ??
              studentsQuery.error?.message}
          </p>
        )}
        <form
          className="mt-5 grid gap-4 border-t pt-5 md:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault();
            createSession.mutate();
          }}
        >
          <label className="grid gap-1.5 text-sm font-medium">
            Course unit
            <select
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              value={unitId}
              onChange={(event) => {
                const nextUnitId = event.target.value;
                setUnitId(nextUnitId);
                setFacilitatorId(
                  (assignmentsQuery.data?.assignments ?? []).find(
                    (assignment) => assignment.unit_id === nextUnitId,
                  )?.facilitator_id ?? "",
                );
              }}
              required
            >
              <option value="">Select a unit</option>
              {(unitsQuery.data ?? []).map((unit) => (
                <option key={unit.id} value={unit.id}>
                  {unit.title}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1.5 text-sm font-medium">
            Assigned facilitator
            <select
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              value={facilitatorId}
              onChange={(event) => setFacilitatorId(event.target.value)}
              disabled={!unitId || !selectedUnitFacilitators.length}
              required
            >
              <option value="">
                {unitId && !selectedUnitFacilitators.length
                  ? "No active facilitator is assigned"
                  : "Select facilitator"}
              </option>
              {selectedUnitFacilitators.map((assignment) => (
                <option key={assignment.facilitator_id} value={assignment.facilitator_id}>
                  {assignmentsQuery.data?.names.get(assignment.facilitator_id) ?? "Facilitator"}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1.5 text-sm font-medium">
            Class title
            <Input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="e.g. Revision session"
              maxLength={160}
              required
            />
          </label>
          <label className="grid gap-1.5 text-sm font-medium">
            Start time
            <Input
              type="datetime-local"
              value={scheduledAt}
              min={localDateTimeValue(new Date())}
              onChange={(event) => setScheduledAt(event.target.value)}
              required
            />
          </label>
          <label className="grid gap-1.5 text-sm font-medium">
            Duration
            <select
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              value={duration}
              onChange={(event) => setDuration(event.target.value)}
            >
              {[30, 45, 60, 90, 120, 180, 240].map((minutes) => (
                <option key={minutes} value={minutes}>
                  {minutes} minutes
                </option>
              ))}
            </select>
          </label>
          <div className="flex items-end md:col-span-2">
            <Button
              type="submit"
              disabled={createSession.isPending || !unitId || !selectedUnitFacilitators.length}
            >
              <Plus className="mr-2 h-4 w-4" />
              {createSession.isPending ? "Scheduling…" : "Schedule class"}
            </Button>
          </div>
        </form>
      </section>

      <section className="space-y-3">
        <h3 className="font-semibold text-brand">Sessions</h3>
        {sessionsQuery.isLoading ? (
          <p className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">
            Loading sessions…
          </p>
        ) : sessionsQuery.error ? (
          <p className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
            Could not load sessions: {sessionsQuery.error.message}
          </p>
        ) : sessionsQuery.data?.length ? (
          sessionsQuery.data.map((session) => (
            <article key={session.id} className="rounded-xl border bg-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h4 className="font-semibold">{session.title}</h4>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {unitTitleById.get(session.unit_id) ?? "Course unit"} ·{" "}
                    {assignmentsQuery.data?.names.get(session.facilitator_id) ?? "Facilitator"}
                  </p>
                </div>
                <Badge variant={session.status === "live" ? "destructive" : "secondary"}>
                  {session.status === "live" ? "Live now" : session.status}
                </Badge>
              </div>
              <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <CalendarDays className="h-4 w-4" />
                  {sessionTime.format(new Date(session.scheduled_at))}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Clock3 className="h-4 w-4" />
                  {session.duration_minutes} min
                </span>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {session.status === "scheduled" ? (
                  <>
                    <Button
                      size="sm"
                      disabled={updateSessionStatus.isPending}
                      onClick={() => updateSessionStatus.mutate({ session, status: "live" })}
                    >
                      <Radio className="mr-2 h-4 w-4" />
                      Start class
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={updateSessionStatus.isPending}
                      onClick={() => updateSessionStatus.mutate({ session, status: "cancelled" })}
                    >
                      Cancel
                    </Button>
                  </>
                ) : session.status === "live" ? (
                  <>
                    <Button size="sm" onClick={() => setActiveSession(session)}>
                      <Video className="mr-2 h-4 w-4" />
                      Join room
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={updateSessionStatus.isPending}
                      onClick={() => updateSessionStatus.mutate({ session, status: "ended" })}
                    >
                      End class
                    </Button>
                  </>
                ) : null}
                {(session.status === "ended" || session.status === "cancelled") &&
                  session.started_at && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={updateSessionStatus.isPending}
                      onClick={() =>
                        updateSessionStatus.mutate({
                          session,
                          status: session.status === "ended" ? "ended" : "cancelled",
                        })
                      }
                    >
                      Retry room closure
                    </Button>
                  )}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setSelectedSessionId(session.id)}
                >
                  <Users className="mr-2 h-4 w-4" />
                  Manage roster
                </Button>
              </div>
              {selectedSessionId === session.id && (
                <div className="mt-4 rounded-xl border bg-muted/20 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h5 className="font-medium">Class roster</h5>
                      <p className="text-xs text-muted-foreground">
                        This adds access to this live class only; it does not change enrollment or
                        study mode.
                      </p>
                    </div>
                    <Button size="sm" variant="ghost" onClick={() => setSelectedSessionId("")}>
                      Close
                    </Button>
                  </div>
                  {membersQuery.error && (
                    <p className="mt-3 text-sm text-destructive" role="alert">
                      Could not load roster: {membersQuery.error.message}
                    </p>
                  )}
                  {studentsQuery.isLoading ? (
                    <p className="mt-3 text-sm text-muted-foreground">Loading students…</p>
                  ) : studentsQuery.data?.length ? (
                    <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                      <select
                        aria-label="Add student to live class"
                        className="h-10 min-w-0 flex-1 rounded-md border border-input bg-background px-3 text-sm"
                        value={selectedStudentId}
                        onChange={(event) => setSelectedStudentId(event.target.value)}
                      >
                        <option value="">Select an active student</option>
                        {availableStudents.map((student) => (
                          <option key={student.id} value={student.id}>
                            {student.first_name} {student.last_name} · {student.student_number} ·{" "}
                            {student.study_mode.replace("_", " ")}
                          </option>
                        ))}
                      </select>
                      <Button
                        size="sm"
                        disabled={!selectedStudentId || addMember.isPending}
                        onClick={() => addMember.mutate()}
                      >
                        <Plus className="mr-1 h-4 w-4" />
                        Add student
                      </Button>
                    </div>
                  ) : (
                    <p className="mt-3 text-sm text-muted-foreground">
                      No active student accounts linked to the portal are available.
                    </p>
                  )}
                  <ul className="mt-4 divide-y">
                    {(membersQuery.data ?? []).map((member) => (
                      <li
                        key={member.student_id}
                        className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"
                      >
                        <span>
                          {member.student
                            ? `${member.student.first_name} ${member.student.last_name} · ${member.student.student_number} · ${member.student.study_mode.replace("_", " ")}`
                            : "Student"}
                        </span>
                        <Button
                          size="sm"
                          variant="ghost"
                          aria-label="Remove student from class"
                          disabled={removeMember.isPending}
                          onClick={() => removeMember.mutate(member.student_id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </article>
          ))
        ) : (
          <p className="rounded-xl border border-dashed bg-card p-5 text-sm text-muted-foreground">
            No live classes have been scheduled.
          </p>
        )}
      </section>
    </div>
  );
}
