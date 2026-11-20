import { supabase } from "@/integrations/supabase/client";

export type LiveClassAction = "start" | "end" | "cancel";

export async function transitionLiveClass(sessionId: string, action: LiveClassAction) {
  const { data, error } = await supabase.functions.invoke<{ status: string }>("manage-live-class", {
    body: { sessionId, action },
  });
  if (error) throw error;
  if (!data || typeof data.status !== "string") {
    throw new Error("The live-class service returned an invalid session status.");
  }
  return data.status;
}
