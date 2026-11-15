import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Mail, Save, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { formatKES } from "@/lib/site";

type FeeReminderStudent = {
  student_id: string;
  student_number: string;
  first_name: string;
  last_name: string;
  billed: number;
  paid: number;
};

type FeeReminderTemplate = { subject: string; body: string };

const templateKey = "fees.balance_reminder_template";
const maxRecipients = 50;
const defaultTemplate: FeeReminderTemplate = {
  subject: "Fee balance reminder for {student_name}",
  body: "Dear {student_name},\n\nOur records show that your fee account has an outstanding balance of {balance}. Total fees billed: {billed}. Payments received: {paid}.\n\n{extra_info}\n\nPlease contact the institute if you have recently made a payment or need assistance.\n\nRegards,\nProfia Institute",
};

function parseTemplate(value: Json | null | undefined): FeeReminderTemplate {
  if (!value || typeof value !== "object" || Array.isArray(value)) return defaultTemplate;
  const record = value as { subject?: Json; body?: Json };
  return {
    subject: typeof record.subject === "string" ? record.subject : defaultTemplate.subject,
    body: typeof record.body === "string" ? record.body : defaultTemplate.body,
  };
}

export function FeeBalanceReminderPanel({ students }: { students: FeeReminderStudent[] }) {
  const queryClient = useQueryClient();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [extraInfo, setExtraInfo] = useState("");
  const [template, setTemplate] = useState(defaultTemplate);
  const templateQuery = useQuery({
    queryKey: ["admin", "fee-balance-reminder-template"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("site_settings")
        .select("value")
        .eq("key", templateKey)
        .maybeSingle();
      if (error) throw error;
      return parseTemplate(data?.value);
    },
  });
  useEffect(() => {
    if (templateQuery.data) setTemplate(templateQuery.data);
  }, [templateQuery.data]);
  const debtors = students.filter((student) => student.billed > student.paid);
  const saveTemplateMutation = useMutation({
    mutationFn: async () => {
      const subject = template.subject.trim();
      const body = template.body.trim();
      if (!subject || !body) throw new Error("Add both an email subject and message.");
      const { error } = await supabase.rpc("save_fee_balance_reminder_template", {
        _template: { subject, body },
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("Fee reminder template saved");
      await queryClient.invalidateQueries({ queryKey: ["admin", "fee-balance-reminder-template"] });
    },
    onError: (error) =>
      toast.error("Could not save fee reminder template", {
        description: error instanceof Error ? error.message : "Please retry.",
      }),
  });
  const sendMutation = useMutation({
    mutationFn: async (studentIds: string[]) => {
      if (!template.subject.trim() || !template.body.trim()) {
        throw new Error("Add both an email subject and message.");
      }
      if (!studentIds.length || studentIds.length > maxRecipients) {
        throw new Error(`Select between 1 and ${maxRecipients} students.`);
      }
      const { data, error } = await supabase.functions.invoke("send-fee-reminders", {
        body: {
          studentIds,
          subject: template.subject,
          body: template.body,
          extraInfo,
        },
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
      return data as { sent: number; failed: number; skipped: number; errors?: string[] };
    },
    onSuccess: (result) => {
      toast.success(`${result.sent} fee reminder${result.sent === 1 ? "" : "s"} sent`, {
        description:
          [
            result.failed ? `${result.failed} failed` : "",
            result.skipped ? `${result.skipped} skipped (no balance or email)` : "",
            result.errors?.slice(0, 3).join(" · ") ?? "",
          ]
            .filter(Boolean)
            .join(" · ") || undefined,
      });
      setSelectedIds([]);
      setExtraInfo("");
    },
    onError: (error) =>
      toast.error("Could not send fee reminders", {
        description: error instanceof Error ? error.message : "Please retry.",
      }),
  });

  const selectableDebtors = debtors.slice(0, maxRecipients);
  const allSelected =
    selectableDebtors.length > 0 &&
    selectableDebtors.every((student) => selectedIds.includes(student.student_id));

  return (
    <section className="space-y-4 rounded-lg border p-4">
      <div>
        <h3 className="font-semibold text-brand">Fee balance reminders</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Save a reusable email, add a note for this send, then send individually or to selected
          students (up to {maxRecipients} per bulk send). Email is delivered to the address on each
          student record.
        </p>
      </div>
      {templateQuery.error && (
        <p role="alert" className="text-sm text-destructive">
          Could not load the saved template: {templateQuery.error.message}
        </p>
      )}
      <div className="grid gap-3">
        <label className="grid gap-1 text-sm font-medium">
          Email subject
          <Input
            maxLength={200}
            value={template.subject}
            onChange={(event) => setTemplate({ ...template, subject: event.target.value })}
          />
        </label>
        <label className="grid gap-1 text-sm font-medium">
          Email message
          <Textarea
            rows={7}
            maxLength={10000}
            value={template.body}
            onChange={(event) => setTemplate({ ...template, body: event.target.value })}
          />
        </label>
        <p className="text-xs text-muted-foreground">
          Placeholders: {"{student_name}"}, {"{student_number}"}, {"{billed}"}, {"{paid}"},{" "}
          {"{balance}"}, and {"{extra_info}"}.
        </p>
        <label className="grid gap-1 text-sm font-medium">
          Extra information for this send
          <Textarea
            rows={3}
            maxLength={3000}
            placeholder="Optional dates, payment instructions, or other context"
            value={extraInfo}
            onChange={(event) => setExtraInfo(event.target.value)}
          />
        </label>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={saveTemplateMutation.isPending || templateQuery.isLoading}
            loading={saveTemplateMutation.isPending}
            onClick={() => saveTemplateMutation.mutate()}
          >
            <Save /> Save template
          </Button>
          <Button
            type="button"
            disabled={sendMutation.isPending || !selectedIds.length || templateQuery.isLoading}
            loading={sendMutation.isPending}
            onClick={() => sendMutation.mutate(selectedIds)}
          >
            <Send /> Send to selected ({selectedIds.length})
          </Button>
        </div>
      </div>
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full min-w-[760px] border-collapse text-left text-sm">
          <thead>
            <tr className="bg-muted/40">
              <th className="w-10 border-b px-3 py-2">
                <input
                  type="checkbox"
                  aria-label="Select all students with outstanding balances"
                  className="size-4 accent-primary"
                  checked={allSelected}
                  disabled={!selectableDebtors.length || sendMutation.isPending}
                  onChange={(event) =>
                    setSelectedIds(
                      event.target.checked
                        ? selectableDebtors.map((student) => student.student_id)
                        : [],
                    )
                  }
                />
              </th>
              <th className="border-b px-3 py-2">Student</th>
              <th className="border-b px-3 py-2">Student number</th>
              <th className="border-b px-3 py-2">Balance</th>
              <th className="border-b px-3 py-2">Reminder</th>
            </tr>
          </thead>
          <tbody>
            {debtors.map((student) => (
              <tr key={student.student_id} className="border-b last:border-0">
                <td className="px-3 py-2">
                  <input
                    type="checkbox"
                    aria-label={`Select ${student.first_name} ${student.last_name}`}
                    className="size-4 accent-primary"
                    checked={selectedIds.includes(student.student_id)}
                    disabled={
                      sendMutation.isPending ||
                      (!selectedIds.includes(student.student_id) &&
                        selectedIds.length >= maxRecipients)
                    }
                    onChange={(event) =>
                      setSelectedIds((current) =>
                        event.target.checked
                          ? [...current, student.student_id]
                          : current.filter((id) => id !== student.student_id),
                      )
                    }
                  />
                </td>
                <td className="px-3 py-2 font-medium">
                  {student.first_name} {student.last_name}
                </td>
                <td className="px-3 py-2">{student.student_number}</td>
                <td className="px-3 py-2">{formatKES(student.billed - student.paid)}</td>
                <td className="px-3 py-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={sendMutation.isPending || templateQuery.isLoading}
                    loading={sendMutation.isPending}
                    onClick={() => sendMutation.mutate([student.student_id])}
                  >
                    <Mail /> Send
                  </Button>
                </td>
              </tr>
            ))}
            {!debtors.length && (
              <tr>
                <td colSpan={5} className="px-3 py-5 text-center text-muted-foreground">
                  No outstanding fee balances.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
