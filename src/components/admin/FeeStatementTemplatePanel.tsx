import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { useUser } from "@/lib/auth";

type StatementTemplate = { payment_methods: string; account_details: string };
type Templates = Record<string, StatementTemplate>;

const emptyTemplate: StatementTemplate = { payment_methods: "", account_details: "" };
const selectClass =
  "h-10 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

function templatesFromJson(value: Json | null | undefined): Templates {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const result: Templates = {};
  for (const [courseId, setting] of Object.entries(value)) {
    if (!setting || typeof setting !== "object" || Array.isArray(setting)) continue;
    const item = setting as { payment_methods?: Json; account_details?: Json };
    result[courseId] = {
      payment_methods: typeof item.payment_methods === "string" ? item.payment_methods : "",
      account_details: typeof item.account_details === "string" ? item.account_details : "",
    };
  }
  return result;
}

export function FeeStatementTemplatePanel() {
  const { user } = useUser();
  const queryClient = useQueryClient();
  const [courseId, setCourseId] = useState("");
  const [template, setTemplate] = useState(emptyTemplate);
  const coursesQuery = useQuery({
    queryKey: ["admin", "fee-statement-template-courses"],
    queryFn: async () => {
      const { data, error } = await supabase.from("courses").select("id,title").order("title");
      if (error) throw error;
      return data;
    },
  });
  const settingsQuery = useQuery({
    queryKey: ["admin", "fee-statement-templates"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("site_settings")
        .select("value")
        .eq("key", "fees.statement_templates")
        .maybeSingle();
      if (error) throw error;
      return templatesFromJson(data?.value);
    },
  });
  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!courseId) throw new Error("Select a course first.");
      const templates = {
        ...(settingsQuery.data ?? {}),
        [courseId]: {
          payment_methods: template.payment_methods.trim(),
          account_details: template.account_details.trim(),
        },
      };
      const { error } = await supabase.from("site_settings").upsert(
        {
          key: "fees.statement_templates",
          value: templates as Json,
          updated_by: user?.id ?? null,
        },
        { onConflict: "key" },
      );
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("Course statement template settings saved");
      await queryClient.invalidateQueries({ queryKey: ["admin", "fee-statement-templates"] });
    },
    onError: (error) =>
      toast.error("Could not save template settings", {
        description: error instanceof Error ? error.message : "Please retry.",
      }),
  });
  const downloadMutation = useMutation({
    mutationFn: async (windowRef: Window) => {
      const { data, error } = await supabase.functions.invoke("generate-fee-statement-template", {
        body: { courseId },
      });
      if (error) {
        if ("context" in error && error.context instanceof Response) {
          const response = await error.context
            .clone()
            .json()
            .catch(() => null);
          if (typeof response?.error === "string") throw new Error(response.error);
        }
        throw error;
      }
      if (!data?.success || typeof data.signedUrl !== "string")
        throw new Error(data?.error ?? "Could not prepare the template download.");
      return { windowRef, signedUrl: data.signedUrl };
    },
    onSuccess: ({ windowRef, signedUrl }) => {
      windowRef.location.href = signedUrl;
    },
    onError: (error, windowRef) => {
      windowRef.close();
      toast.error("Could not download statement template", {
        description: error instanceof Error ? error.message : "Please retry.",
      });
    },
  });

  function selectCourse(nextCourseId: string) {
    setCourseId(nextCourseId);
    setTemplate(settingsQuery.data?.[nextCourseId] ?? emptyTemplate);
  }

  function downloadTemplate() {
    if (!courseId) {
      toast.error("Select a course before downloading its template.");
      return;
    }
    const windowRef = window.open("about:blank", "_blank");
    if (!windowRef) {
      toast.error("Allow pop-ups to download the template.");
      return;
    }
    downloadMutation.mutate(windowRef);
  }

  return (
    <section className="space-y-4 rounded-xl border bg-card p-5 shadow-card">
      <div>
        <h2 className="font-semibold text-brand">Course fee statement templates</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Save payment instructions for a course and download a branded PDF template with
          placeholders for student details, charges, payments, and balances. The school logo and
          contact information come from public site settings.
        </p>
      </div>
      {(coursesQuery.error || settingsQuery.error) && (
        <p role="alert" className="text-sm text-destructive">
          {coursesQuery.error?.message ?? settingsQuery.error?.message}
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1.5 text-sm font-medium">
          Course
          <select
            className={selectClass}
            value={courseId}
            disabled={coursesQuery.isLoading || settingsQuery.isLoading}
            onChange={(event) => selectCourse(event.target.value)}
          >
            <option value="">Select course</option>
            {coursesQuery.data?.map((course) => (
              <option key={course.id} value={course.id}>
                {course.title}
              </option>
            ))}
          </select>
        </label>
        <div className="space-y-1.5 text-sm text-muted-foreground">
          <p className="font-medium text-foreground">Included placeholders</p>
          <p>Student name/admission number · course · fee items · payment details · balance</p>
        </div>
        <label className="space-y-1.5 text-sm font-medium">
          Payment methods
          <Textarea
            rows={3}
            maxLength={500}
            placeholder={"PayHero M-Pesa STK push from the Student Portal\nOther approved methods"}
            value={template.payment_methods}
            onChange={(event) => setTemplate({ ...template, payment_methods: event.target.value })}
          />
        </label>
        <label className="space-y-1.5 text-sm font-medium">
          Official account details
          <Textarea
            rows={3}
            maxLength={500}
            placeholder="Bank name, account name and number, Paybill or other official payment details"
            value={template.account_details}
            onChange={(event) => setTemplate({ ...template, account_details: event.target.value })}
          />
        </label>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={!courseId || saveMutation.isPending}
          loading={saveMutation.isPending}
          onClick={() => saveMutation.mutate()}
        >
          <Save /> {saveMutation.isPending ? "Saving…" : "Save course template"}
        </Button>
        <Button
          type="button"
          disabled={!courseId || downloadMutation.isPending}
          loading={downloadMutation.isPending}
          onClick={downloadTemplate}
        >
          <Download /> {downloadMutation.isPending ? "Preparing…" : "Download PDF template"}
        </Button>
      </div>
    </section>
  );
}
