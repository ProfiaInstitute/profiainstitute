import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, Clock3, Plus, Radio, Video } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { LiveClassRoom } from "@/components/learning/LiveClassRoom";
import { supabase } from "@/integrations/supabase/client";
import { transitionLiveClass } from "@/lib/live-classes";
import type { Tables } from "@/integrations/supabase/types";

type LiveClassSession = Tables<"live_class_sessions">;

function localDateTimeValue(value: Date) {
  const date = new Date(value.getTime() - value.getTimezoneOffset() * 60_000);
  return date.toISOString().slice(0, 16);
}

const sessionTime = new Intl.DateTimeFormat("en-KE", {
  dateStyle: "medium",
  timeStyle: "short",
});

export function FacilitatorLiveClasses({
  facilitatorId,
  unitId,
  unitTitle,
}: {
  facilitatorId: string;
  unitId: string;
  unitTitle: string;
}) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [scheduledAt, setScheduledAt] = useState(() =>
    localDateTimeValue(new Date(Date.now() + 15 * 60_000)),
  );
  const [duration, setDuration] = useState("60");
  const [activeSession, setActiveSession] = useState<LiveClassSession | null>(null);
  const sessionsQuery = useQuery({
    queryKey: ["live-class-sessions", "facilitator", unitId],
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("live_class_sessions")
        .select("*")
        .eq("unit_id", unitId)
        .order("scheduled_at", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const createSession = useMutation({
    mutationFn: async () => {
      const start = new Date(scheduledAt);
      if (!title.trim() || Number.isNaN(start.getTime()) || start <= new Date()) {
        throw new Error("Enter a title and choose a future start time.");
      }
      const minutes = Number(duration);
      if (!Number.isInteger(minutes) || minutes < 15 || minutes > 240) {
        throw new Error("Class duration must be between 15 and 240 minutes.");
      }
      const { error } = await supabase.from("live_class_sessions").insert({
        unit_id: unitId,
        facilitator_id: facilitatorId,
        title: title.trim(),
        description: description.trim() || null,
        scheduled_at: start.toISOString(),
        duration_minutes: minutes,
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      setTitle("");
      setDescription("");
      await queryClient.invalidateQueries({
        queryKey: ["live-class-sessions", "facilitator", unitId],
      });
      toast.success("Live class scheduled");
    },
    onError: (error) =>
      toast.error("Could not schedule the live class", { description: error.message }),
  });

  const changeStatus = useMutation({
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
      await queryClient.invalidateQueries({
        queryKey: ["live-class-sessions", "facilitator", unitId],
      });
      toast.success("Live class updated");
    },
    onError: (error) =>
      toast.error("Could not update the live class", { description: error.message }),
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

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border bg-card p-5 shadow-sm">
        <div className="flex items-start gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
            <Video className="h-5 w-5" />
          </span>
          <div>
            <h2 className="font-semibold text-brand">Live classes · {unitTitle}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Schedule a session for this unit. Students with access to the unit can join after you
              start it. Screen sharing is enabled for facilitators.
            </p>
          </div>
        </div>

        <form
          className="mt-5 grid gap-4 border-t pt-5 md:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault();
            createSession.mutate();
          }}
        >
          <label className="grid gap-1.5 text-sm font-medium">
            Class title
            <Input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="e.g. Introduction to bookkeeping"
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
          <label className="grid gap-1.5 text-sm font-medium md:col-span-2">
            Class notes <span className="font-normal text-muted-foreground">(optional)</span>
            <Textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Topics or preparation students should know about"
              rows={3}
              maxLength={2000}
            />
          </label>
          <div className="md:col-span-2">
            <Button type="submit" disabled={createSession.isPending}>
              <Plus className="mr-2 h-4 w-4" />
              {createSession.isPending ? "Scheduling…" : "Schedule class"}
            </Button>
          </div>
        </form>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-semibold text-brand">Scheduled and recent classes</h3>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => void sessionsQuery.refetch()}
            disabled={sessionsQuery.isFetching}
          >
            Refresh
          </Button>
        </div>
        {sessionsQuery.isLoading ? (
          <p className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">
            Loading classes…
          </p>
        ) : sessionsQuery.error ? (
          <p className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
            Could not load classes: {sessionsQuery.error.message}
          </p>
        ) : sessionsQuery.data?.length ? (
          sessionsQuery.data.map((session) => (
            <article key={session.id} className="rounded-xl border bg-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h4 className="font-semibold">{session.title}</h4>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {sessionTime.format(new Date(session.scheduled_at))} ·{" "}
                    {session.duration_minutes} min
                  </p>
                </div>
                <Badge variant={session.status === "live" ? "destructive" : "secondary"}>
                  {session.status === "live" ? "Live now" : session.status}
                </Badge>
              </div>
              {session.description && (
                <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">
                  {session.description}
                </p>
              )}
              {session.status !== "ended" && session.status !== "cancelled" && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {session.status === "scheduled" ? (
                    <Button
                      size="sm"
                      disabled={changeStatus.isPending}
                      onClick={() => changeStatus.mutate({ session, status: "live" })}
                    >
                      <Radio className="mr-2 h-4 w-4" />
                      Start class
                    </Button>
                  ) : (
                    <>
                      <Button size="sm" onClick={() => setActiveSession(session)}>
                        <Video className="mr-2 h-4 w-4" />
                        Join room
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={changeStatus.isPending}
                        onClick={() => changeStatus.mutate({ session, status: "ended" })}
                      >
                        End class
                      </Button>
                    </>
                  )}
                  {session.status === "scheduled" && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={changeStatus.isPending}
                      onClick={() => changeStatus.mutate({ session, status: "cancelled" })}
                    >
                      Cancel
                    </Button>
                  )}
                </div>
              )}
              {(session.status === "ended" || session.status === "cancelled") &&
                session.started_at && (
                  <Button
                    className="mt-4"
                    size="sm"
                    variant="outline"
                    disabled={changeStatus.isPending}
                    onClick={() =>
                      changeStatus.mutate({
                        session,
                        status: session.status === "ended" ? "ended" : "cancelled",
                      })
                    }
                  >
                    Retry room closure
                  </Button>
                )}
              <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
                <CalendarDays className="h-3.5 w-3.5" />
                {session.started_at
                  ? `Started ${sessionTime.format(new Date(session.started_at))}`
                  : "Not started"}
                {session.ended_at && (
                  <>
                    <Clock3 className="ml-2 h-3.5 w-3.5" />
                    Ended {sessionTime.format(new Date(session.ended_at))}
                  </>
                )}
              </p>
            </article>
          ))
        ) : (
          <p className="rounded-xl border border-dashed bg-card p-5 text-sm text-muted-foreground">
            No classes have been scheduled for this unit.
          </p>
        )}
      </section>
    </div>
  );
}
