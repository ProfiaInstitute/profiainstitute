import { lazy, Suspense, useEffect, useState } from "react";
import { LoaderCircle, Radio, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

type LiveKitCredentials = { serverUrl: string; token: string };
const LiveKitConference = lazy(() => import("@/components/learning/LiveKitConference"));

export function LiveClassRoom({
  sessionId,
  title,
  onClose,
}: {
  sessionId: string;
  title: string;
  onClose: () => void;
}) {
  const [credentials, setCredentials] = useState<LiveKitCredentials | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void supabase.functions
      .invoke<LiveKitCredentials>("livekit-token", {
        body: { sessionId },
      })
      .then(({ data, error: invokeError }) => {
        if (invokeError) throw invokeError;
        if (!data || !data.serverUrl || !data.token) {
          throw new Error("The live-class service returned an incomplete connection.");
        }
        if (active) setCredentials(data);
      })
      .catch((cause: unknown) => {
        if (active) {
          setError(cause instanceof Error ? cause.message : "Could not connect to the live class.");
        }
      });

    return () => {
      active = false;
    };
  }, [sessionId]);

  return (
    <div
      className="fixed inset-0 z-[70] flex flex-col bg-slate-950 text-white"
      role="dialog"
      aria-modal="true"
      aria-label={`Live class: ${title}`}
    >
      <header className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-red-500/15 text-red-300">
            <Radio className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="truncate font-semibold">{title}</p>
            <p className="text-xs text-white/60">Profia live classroom</p>
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          className="shrink-0 border-white/20 bg-white/5 text-white hover:bg-white/10 hover:text-white"
          onClick={onClose}
        >
          <X className="mr-1 h-4 w-4" />
          Leave class
        </Button>
      </header>

      <main className="min-h-0 flex-1 p-2 sm:p-4">
        {error ? (
          <div className="mx-auto mt-12 max-w-lg rounded-2xl border border-white/10 bg-white/5 p-6 text-center">
            <h2 className="text-lg font-semibold">Could not join this class</h2>
            <p className="mt-2 text-sm text-white/70">{error}</p>
            <Button className="mt-5" variant="outline" onClick={onClose}>
              Close
            </Button>
          </div>
        ) : credentials ? (
          <Suspense
            fallback={
              <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
                <LoaderCircle className="h-8 w-8 animate-spin text-sky-300" />
                <p className="font-medium">Loading the classroom…</p>
              </div>
            }
          >
            <LiveKitConference credentials={credentials} onDisconnected={onClose} />
          </Suspense>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <LoaderCircle className="h-8 w-8 animate-spin text-sky-300" />
            <p className="font-medium">Connecting to {title}…</p>
            <p className="text-sm text-white/60">
              Checking your class access and preparing your room.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
