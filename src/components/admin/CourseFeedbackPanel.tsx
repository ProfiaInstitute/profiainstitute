import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";

export function CourseFeedbackPanel() {
  const queryClient = useQueryClient();
  const [replies, setReplies] = useState<Record<string, string>>({});
  const feedbackQuery = useQuery({
    queryKey: ["admin", "student-course-feedback"],
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("student_course_feedback")
        .select("id,student_id,category,subject,body,status,admin_reply,created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      const ids = [...new Set(data.map((item) => item.student_id))];
      const { data: students, error: studentError } = ids.length
        ? await supabase
            .from("students")
            .select("id,student_number,first_name,last_name")
            .in("id", ids)
        : { data: [], error: null };
      if (studentError) throw studentError;
      return { feedback: data, students: students ?? [] };
    },
  });
  const replyMutation = useMutation({
    mutationFn: async ({
      id,
      reply,
      status,
    }: {
      id: string;
      reply: string;
      status: "reviewing" | "resolved";
    }) => {
      const { error } = await supabase
        .from("student_course_feedback")
        .update({ admin_reply: reply.trim(), status })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("Feedback response saved");
      await queryClient.invalidateQueries({ queryKey: ["admin", "student-course-feedback"] });
    },
    onError: (error) =>
      toast.error("Could not save feedback response", { description: error.message }),
  });
  if (feedbackQuery.isLoading)
    return <p className="rounded-xl border bg-card p-5 text-sm">Loading student feedback…</p>;
  if (feedbackQuery.error)
    return (
      <section className="rounded-xl border border-destructive/30 bg-destructive/5 p-5">
        <p role="alert" className="text-sm text-destructive">
          Could not load student feedback: {feedbackQuery.error.message}
        </p>
        <Button className="mt-3" variant="outline" onClick={() => void feedbackQuery.refetch()}>
          Retry
        </Button>
      </section>
    );
  if (!feedbackQuery.data)
    return <p className="rounded-xl border bg-card p-5 text-sm">Loading student feedback…</p>;
  const studentById = new Map(feedbackQuery.data.students.map((student) => [student.id, student]));
  return (
    <section className="space-y-4">
      <header>
        <h2 className="text-lg font-semibold text-brand">Student course feedback</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Review student reports about their course, progress, and curriculum; responses appear in
          the student portal.
        </p>
      </header>
      {feedbackQuery.data.feedback.length ? (
        feedbackQuery.data.feedback.map((item) => {
          const student = studentById.get(item.student_id);
          const reply = replies[item.id] ?? item.admin_reply ?? "";
          return (
            <article key={item.id} className="space-y-3 rounded-xl border bg-card p-5 shadow-card">
              <div className="flex flex-wrap justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-brand">{item.subject}</h3>
                  <p className="mt-1 text-xs capitalize text-muted-foreground">
                    {item.category} · {item.status} · {student?.student_number ?? "Student"}
                    {student ? ` · ${student.first_name} ${student.last_name}` : ""}
                  </p>
                </div>
                <time className="text-xs text-muted-foreground">
                  {new Date(item.created_at).toLocaleString("en-KE")}
                </time>
              </div>
              <p className="whitespace-pre-wrap text-sm">{item.body}</p>
              <Textarea
                rows={3}
                maxLength={5000}
                aria-label={`Reply to ${item.subject}`}
                placeholder="Write a response for the student"
                value={reply}
                onChange={(event) => setReplies({ ...replies, [item.id]: event.target.value })}
              />
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  disabled={replyMutation.isPending || !reply.trim()}
                  onClick={() => replyMutation.mutate({ id: item.id, reply, status: "reviewing" })}
                >
                  Save response
                </Button>
                <Button
                  disabled={replyMutation.isPending || !reply.trim()}
                  onClick={() => replyMutation.mutate({ id: item.id, reply, status: "resolved" })}
                >
                  Respond & resolve
                </Button>
              </div>
            </article>
          );
        })
      ) : (
        <p className="rounded-xl border bg-card p-5 text-sm text-muted-foreground">
          No student feedback has been submitted.
        </p>
      )}
    </section>
  );
}
