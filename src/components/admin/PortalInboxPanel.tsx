import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Mail, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useUser } from "@/lib/auth";

export function PortalInboxPanel() {
  const { user } = useUser();
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState("");
  const [draft, setDraft] = useState("");
  const conversationsQuery = useQuery({
    queryKey: ["admin", "portal-inbox"],
    refetchInterval: 10_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("portal_conversations")
        .select("id,student_id,updated_at")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      const studentIds = [...new Set(data.map((conversation) => conversation.student_id))];
      const { data: students, error: studentError } = studentIds.length
        ? await supabase
            .from("students")
            .select("id,student_number,first_name,last_name,course_id,level_id")
            .in("id", studentIds)
        : { data: [], error: null };
      if (studentError) throw studentError;
      return {
        conversations: data,
        students: students ?? [],
      };
    },
  });
  useEffect(() => {
    if (!selectedId && conversationsQuery.data?.conversations.length)
      setSelectedId(conversationsQuery.data.conversations[0]!.id);
  }, [conversationsQuery.data, selectedId]);
  const messagesQuery = useQuery({
    queryKey: ["admin", "portal-messages", selectedId],
    enabled: Boolean(selectedId),
    refetchInterval: 5_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("portal_messages")
        .select("id,sender_id,body,read_at,created_at")
        .eq("conversation_id", selectedId)
        .order("created_at");
      if (error) throw error;
      return data;
    },
  });
  useEffect(() => {
    const unread =
      messagesQuery.data?.filter((message) => message.sender_id !== user?.id && !message.read_at) ??
      [];
    if (!unread.length) return;
    void supabase
      .from("portal_messages")
      .update({ read_at: new Date().toISOString() })
      .in(
        "id",
        unread.map((message) => message.id),
      )
      .then(({ error }) => {
        if (error) toast.error("Could not mark messages as read", { description: error.message });
        else
          void queryClient.invalidateQueries({
            queryKey: ["admin", "portal-messages", selectedId],
          });
      });
  }, [messagesQuery.data, queryClient, selectedId, user?.id]);
  const sendMutation = useMutation({
    mutationFn: async () => {
      if (!user?.id || !selectedId) throw new Error("Select a student conversation first.");
      const { error } = await supabase.from("portal_messages").insert({
        conversation_id: selectedId,
        sender_id: user.id,
        body: draft.trim(),
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      setDraft("");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["admin", "portal-messages", selectedId] }),
        queryClient.invalidateQueries({ queryKey: ["admin", "portal-inbox"] }),
      ]);
    },
    onError: (error) => toast.error("Could not send reply", { description: error.message }),
  });
  if (conversationsQuery.isLoading)
    return <p className="rounded-xl border bg-card p-5 text-sm">Loading student inbox…</p>;
  if (conversationsQuery.error)
    return (
      <section className="rounded-xl border border-destructive/30 bg-destructive/5 p-5">
        <p role="alert" className="text-sm text-destructive">
          Could not load the student inbox: {conversationsQuery.error.message}
        </p>
        <Button
          className="mt-3"
          variant="outline"
          onClick={() => void conversationsQuery.refetch()}
        >
          Retry
        </Button>
      </section>
    );
  if (!conversationsQuery.data)
    return <p className="rounded-xl border bg-card p-5 text-sm">Loading student inbox…</p>;
  const studentById = new Map(
    conversationsQuery.data.students.map((student) => [student.id, student]),
  );
  const activeStudent = conversationsQuery.data.conversations.find(
    (item) => item.id === selectedId,
  );
  const activeStudentInfo = activeStudent ? studentById.get(activeStudent.student_id) : undefined;
  return (
    <div className="grid min-h-[34rem] overflow-hidden rounded-xl border bg-card shadow-card md:grid-cols-[18rem_minmax(0,1fr)]">
      <aside className="border-b bg-muted/30 md:border-b-0 md:border-r">
        <h2 className="border-b p-4 font-semibold text-brand">Student conversations</h2>
        <ul className="max-h-80 divide-y overflow-y-auto md:max-h-[38rem]">
          {conversationsQuery.data.conversations.map((conversation) => {
            const student = studentById.get(conversation.student_id);
            return (
              <li key={conversation.id}>
                <button
                  type="button"
                  className={`w-full px-4 py-3 text-left hover:bg-muted ${conversation.id === selectedId ? "bg-primary/10" : ""}`}
                  onClick={() => setSelectedId(conversation.id)}
                >
                  <span className="block truncate text-sm font-semibold">
                    {student
                      ? `${student.first_name} ${student.last_name}`
                      : "Student conversation"}
                  </span>
                  <span className="mt-1 block text-xs text-muted-foreground">
                    {student?.student_number ?? "Student"} ·{" "}
                    {new Date(conversation.updated_at).toLocaleDateString("en-KE")}
                  </span>
                </button>
              </li>
            );
          })}
          {!conversationsQuery.data.conversations.length && (
            <li className="p-5 text-sm text-muted-foreground">No student messages yet.</li>
          )}
        </ul>
      </aside>
      <section className="flex min-w-0 flex-col">
        <header className="border-b p-4">
          <h2 className="font-semibold text-brand">
            {activeStudentInfo
              ? `${activeStudentInfo.first_name} ${activeStudentInfo.last_name}`
              : "Select a conversation"}
          </h2>
          {activeStudentInfo && (
            <p className="mt-1 text-xs text-muted-foreground">
              Student no. {activeStudentInfo.student_number}
            </p>
          )}
        </header>
        {messagesQuery.error ? (
          <p role="alert" className="p-4 text-sm text-destructive">
            Could not load messages: {messagesQuery.error.message}
          </p>
        ) : (
          <ol className="flex-1 space-y-3 overflow-y-auto p-4">
            {messagesQuery.data?.map((message) => (
              <li
                key={message.id}
                className={`max-w-[85%] rounded-lg p-3 text-sm ${message.sender_id === user?.id ? "ml-auto bg-primary text-primary-foreground" : "bg-muted"}`}
              >
                <p className="whitespace-pre-wrap">{message.body}</p>
                <time className="mt-2 block text-[10px] opacity-70">
                  {new Date(message.created_at).toLocaleString("en-KE")}
                </time>
              </li>
            ))}
            {!messagesQuery.isLoading && messagesQuery.data?.length === 0 && (
              <li className="py-12 text-center text-sm text-muted-foreground">
                No messages in this conversation yet.
              </li>
            )}
          </ol>
        )}
        {activeStudent && (
          <form
            className="grid gap-2 border-t p-4"
            onSubmit={(event) => {
              event.preventDefault();
              sendMutation.mutate();
            }}
          >
            <Textarea
              required
              maxLength={5000}
              rows={3}
              placeholder="Reply to the student"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
            />
            <Button className="justify-self-end" disabled={sendMutation.isPending || !draft.trim()}>
              <Send className="mr-2 h-4 w-4" />
              {sendMutation.isPending ? "Sending…" : "Send reply"}
            </Button>
          </form>
        )}
        {!activeStudent && !conversationsQuery.data.conversations.length && (
          <div className="m-auto text-center text-sm text-muted-foreground">
            <Mail className="mx-auto mb-2 h-6 w-6" />
            Messages from students will appear here.
          </div>
        )}
      </section>
    </div>
  );
}
