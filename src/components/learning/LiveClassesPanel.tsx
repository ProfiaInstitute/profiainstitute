import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, Clock3, Radio, RefreshCw, Video } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LiveClassRoom } from "@/components/learning/LiveClassRoom";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

type LiveClassSession = Tables<"live_class_sessions">;
type SessionCard = LiveClassSession & { unitTitle: string };

const sessionTime = new Intl.DateTimeFormat("en-KE", {
  dateStyle: "medium",
  timeStyle: "short",
});

export function LiveClassesPanel() {
  const [activeSession, setActiveSession] = useState<SessionCard | null>(null);
  const sessionsQuery = useQuery({
    queryKey: ["live-class-sessions", "student"],
    refetchInterval: 30_000,
    queryFn: async (): Promise<SessionCard[]> => {
      const { data: sessions, error } = await supabase
        .from("live_class_sessions")
        .select("*")
        .in("status", ["scheduled", "live"])
        .order("scheduled_at", { ascending: true });
      if (error) throw error;
      if (!sessions.length) return [];

      const unitIds = [...new Set(sessions.map((session) => session.unit_id))];
      const unitsResult = await supabase.from("course_units").select("id,title").in("id", unitIds);
      if (unitsResult.error) throw unitsResult.error;

      const units = new Map(unitsResult.data.map((unit) => [unit.id, unit.title]));
      return sessions.map((session) => ({
        ...session,
        unitTitle: units.get(session.unit_id) ?? "Course unit",
      }));
    },
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
    <section className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border bg-gradient-to-br from-sky-50 via-background to-indigo-50 p-5 dark:from-sky-950/30 dark:to-indigo-950/20">
        <div className="flex items-start gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
            <Video className="h-5 w-5" />
          </span>
          <div>
            <h2 className="font-semibold text-brand">Live classes</h2>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Join a scheduled class when your facilitator starts it. Your enrolled units and any
              classes assigned by an administrator appear here.
            </p>
          </div>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => void sessionsQuery.refetch()}
          disabled={sessionsQuery.isFetching}
        >
          <RefreshCw className={`mr-2 h-4 w-4 ${sessionsQuery.isFetching ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {sessionsQuery.isLoading ? (
        <p className="rounded-xl border bg-card p-5 text-sm text-muted-foreground">
          Loading your live classes…
        </p>
      ) : sessionsQuery.error ? (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-5" role="alert">
          <p className="font-medium text-destructive">Could not load live classes.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {sessionsQuery.error instanceof Error
              ? sessionsQuery.error.message
              : "Please try again."}
          </p>
        </div>
      ) : sessionsQuery.data?.length ? (
        <div className="grid gap-4 xl:grid-cols-2">
          {sessionsQuery.data.map((session) => (
            <article
              key={session.id}
              className="rounded-2xl border bg-card p-5 shadow-sm transition hover:border-primary/30"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="text-lg font-semibold text-brand">{session.title}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{session.unitTitle}</p>
                </div>
                <Badge variant={session.status === "live" ? "destructive" : "secondary"}>
                  {session.status === "live" ? (
                    <span className="mr-1.5 inline-block h-2 w-2 animate-pulse rounded-full bg-white" />
                  ) : null}
                  {session.status === "live" ? "Live now" : "Scheduled"}
                </Badge>
              </div>
              {session.description && (
                <p className="mt-3 whitespace-pre-wrap text-sm text-muted-foreground">
                  {session.description}
                </p>
              )}
              <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <CalendarDays className="h-4 w-4" />
                  {sessionTime.format(new Date(session.scheduled_at))}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Clock3 className="h-4 w-4" />
                  {session.duration_minutes} min
                </span>
              </div>
              <div className="mt-5 flex items-center justify-between gap-3 border-t pt-4">
                <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Radio className="h-3.5 w-3.5" />
                  Video and screen sharing
                </span>
                <Button
                  type="button"
                  size="sm"
                  disabled={session.status !== "live"}
                  onClick={() => setActiveSession(session)}
                >
                  {session.status === "live" ? "Join class" : "Waiting for facilitator"}
                </Button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed bg-card p-8 text-center">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-primary/10 text-primary">
            <CalendarDays className="h-5 w-5" />
          </span>
          <h3 className="mt-3 font-semibold text-brand">No live classes scheduled</h3>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            Classes assigned to your enrolled course units will appear here.
          </p>
        </div>
      )}
    </section>
  );
}
