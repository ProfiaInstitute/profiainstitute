import { useState } from "react";
import { Mail, Paperclip, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { buildAdmissionLetter, parseAdmissionLetterData } from "@/lib/admission-letter";

type ShareableDocument = {
  id: string;
  kind:
    | "student_document"
    | "application_document"
    | "admission_letter"
    | "fee_statement"
    | "fee_receipt";
  label: string;
  fileName: string;
  courseId?: string;
};

const maxFileSize = 5 * 1024 * 1024;
const maxTotalBytes = 15 * 1024 * 1024;
const docxMimeType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export function EmailFileShareDialog({
  studentId,
  studentEmail,
}: {
  studentId: string;
  studentEmail: string;
}) {
  const [open, setOpen] = useState(false);
  const [recipient, setRecipient] = useState(studentEmail);
  const [subject, setSubject] = useState("Documents from Profia Institute");
  const [message, setMessage] = useState("");
  const [documents, setDocuments] = useState<ShareableDocument[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const [loadingDocuments, setLoadingDocuments] = useState(false);
  const [sending, setSending] = useState(false);

  async function loadDocuments() {
    setLoadingDocuments(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-send-email", {
        body: { action: "list", studentId },
      });
      if (error) throw await functionError(error);
      if (!data || !Array.isArray(data.documents))
        throw new Error("The document list was returned in an invalid format.");
      const validDocuments: ShareableDocument[] = [];
      data.documents.forEach((value: unknown) => {
        if (isShareableDocument(value)) validDocuments.push(value);
      });
      setDocuments(validDocuments);
      setSelectedIds((previous) =>
        previous.filter((id) => validDocuments.some((document) => document.id === id)),
      );
    } catch (error) {
      toast.error("Could not load student documents", {
        description: error instanceof Error ? error.message : "Please try again.",
      });
    } finally {
      setLoadingDocuments(false);
    }
  }

  async function sendEmail(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const selected = documents.filter((document) => selectedIds.includes(document.id));
    const selectedAdmissionLetters = selected.filter(
      (document) => document.kind === "admission_letter",
    );
    const serverDocuments = selected.filter((document) => document.kind !== "admission_letter");
    if (serverDocuments.length + selectedAdmissionLetters.length + files.length > 10) {
      toast.error("Choose no more than 10 attachments.");
      return;
    }
    if (!selected.length && !files.length && !message.trim()) {
      toast.error("Add an email message or choose at least one attachment.");
      return;
    }
    const localTotal = files.reduce((total, file) => total + file.size, 0);
    if (files.some((file) => file.size > maxFileSize) || localTotal > maxTotalBytes) {
      toast.error("Attachments must be 5 MB or less each and 15 MB or less in total.");
      return;
    }

    setSending(true);
    const stagedPaths: string[] = [];
    try {
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError || !userData.user) throw new Error("Sign in again before sending email.");
      for (const file of files) {
        stagedPaths.push(await uploadStagedFile(userData.user.id, file, file.name, file.type));
      }
      for (const document of selectedAdmissionLetters) {
        if (!document.courseId) throw new Error("An admission letter is missing its course.");
        const { data, error } = await supabase.rpc("get_admission_letter_data", {
          _student_id: studentId,
          _course_id: document.courseId,
        });
        if (error) throw error;
        const letterData = parseAdmissionLetterData(data);
        const templateResponse = await fetch("/templates/office-of-registrar-template.docx");
        if (!templateResponse.ok)
          throw new Error("The admission letter template could not be loaded.");
        const template = new Uint8Array(await templateResponse.arrayBuffer());
        const bytes = buildAdmissionLetter(template, letterData);
        const blob = new Blob([new Uint8Array(bytes)], { type: docxMimeType });
        const fileName = `${safeFileName(letterData.admissionNumber)}-admission-letter.docx`;
        stagedPaths.push(await uploadStagedFile(userData.user.id, blob, fileName, docxMimeType));
      }

      const { data: result, error } = await supabase.functions.invoke("admin-send-email", {
        body: {
          action: "send",
          studentId,
          to: recipient.trim(),
          subject: subject.trim(),
          message: message.trim(),
          documents: serverDocuments.map(({ id, kind }) => ({ id, kind })),
          stagedFiles: stagedPaths,
        },
      });
      if (error) throw await functionError(error);
      if (!result?.success) throw new Error("The email service did not confirm delivery.");
      toast.success("Email sent", { description: `Message sent to ${recipient.trim()}.` });
      setMessage("");
      setFiles([]);
      setSelectedIds([]);
      setOpen(false);
    } catch (error) {
      toast.error("Could not send email", {
        description: error instanceof Error ? error.message : "Please try again.",
      });
    } finally {
      if (stagedPaths.length) {
        const { error } = await supabase.storage.from("email-share-staging").remove(stagedPaths);
        if (error) console.error("Could not remove temporary email attachments:", error.message);
      }
      setSending(false);
    }
  }

  function updateOpen(nextOpen: boolean) {
    setOpen(nextOpen);
    if (nextOpen) {
      setRecipient(studentEmail);
      void loadDocuments();
    } else {
      setSelectedIds([]);
      setFiles([]);
    }
  }

  return (
    <Dialog open={open} onOpenChange={updateOpen}>
      <Button type="button" size="sm" variant="outline" onClick={() => updateOpen(true)}>
        <Mail className="h-4 w-4" />
        Email files
      </Button>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Email student files</DialogTitle>
          <DialogDescription>
            Send a message and selected student documents to one email address.
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={(event) => void sendEmail(event)}>
          <label className="block space-y-1.5 text-sm font-medium">
            Recipient email
            <Input
              type="email"
              required
              maxLength={254}
              value={recipient}
              onChange={(event) => setRecipient(event.target.value)}
              placeholder="name@example.com"
            />
          </label>
          <label className="block space-y-1.5 text-sm font-medium">
            Subject
            <Input
              required
              maxLength={200}
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
            />
          </label>
          <label className="block space-y-1.5 text-sm font-medium">
            Message
            <Textarea
              rows={4}
              maxLength={10_000}
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder="Write an email message (optional when attaching documents)."
            />
          </label>
          <fieldset className="space-y-2 rounded-lg border p-3">
            <legend className="px-1 text-sm font-semibold">Existing student documents</legend>
            {loadingDocuments ? (
              <p className="text-sm text-muted-foreground">Loading available files…</p>
            ) : documents.length ? (
              <div className="max-h-48 space-y-2 overflow-y-auto">
                {documents.map((document) => (
                  <label
                    key={`${document.kind}:${document.id}`}
                    className="flex items-start gap-2 text-sm"
                  >
                    <input
                      type="checkbox"
                      className="mt-1 accent-primary"
                      checked={selectedIds.includes(document.id)}
                      onChange={(event) =>
                        setSelectedIds((previous) =>
                          event.target.checked
                            ? [...previous, document.id]
                            : previous.filter((id) => id !== document.id),
                        )
                      }
                      disabled={sending}
                    />
                    <span>
                      {document.label}
                      <span className="block text-xs text-muted-foreground">
                        {document.fileName}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No existing documents are available.</p>
            )}
          </fieldset>
          <label className="block space-y-1.5 text-sm font-medium">
            Attach files from your computer
            <Input
              type="file"
              multiple
              disabled={sending}
              onChange={(event) => setFiles(Array.from(event.target.files ?? []))}
            />
            <span className="flex items-center gap-1 text-xs font-normal text-muted-foreground">
              <Paperclip className="h-3.5 w-3.5" />
              Up to 10 attachments, 5 MB each and 15 MB total.
            </span>
          </label>
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={sending}
              onClick={() => updateOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={sending || loadingDocuments}>
              <Send className="h-4 w-4" />
              {sending ? "Sending…" : "Send email"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

async function uploadStagedFile(
  userId: string,
  file: Blob,
  fileName: string,
  contentType: string,
): Promise<string> {
  if (file.size > maxFileSize) throw new Error("Each attachment must be 5 MB or smaller.");
  const path = `${userId}/${crypto.randomUUID()}/${safeFileName(fileName)}`;
  const { error } = await supabase.storage.from("email-share-staging").upload(path, file, {
    contentType: contentType || "application/octet-stream",
    upsert: false,
  });
  if (error) throw new Error(`Could not upload ${fileName}: ${error.message}`);
  return path;
}

function safeFileName(value: string): string {
  return (
    Array.from(value, (character) =>
      /[<>:"/\\|?*]/.test(character) || character.charCodeAt(0) < 32 ? "-" : character,
    )
      .join("")
      .slice(0, 180) || "attachment"
  );
}

function isShareableDocument(value: unknown): value is ShareableDocument {
  if (!value || typeof value !== "object") return false;
  const document = value as Record<string, unknown>;
  return (
    typeof document["id"] === "string" &&
    typeof document["kind"] === "string" &&
    typeof document["label"] === "string" &&
    typeof document["fileName"] === "string" &&
    [
      "student_document",
      "application_document",
      "admission_letter",
      "fee_statement",
      "fee_receipt",
    ].includes(document["kind"]) &&
    (document["courseId"] === undefined || typeof document["courseId"] === "string")
  );
}

async function functionError(error: { context?: unknown; message: string }): Promise<Error> {
  if (error.context instanceof Response) {
    const body: unknown = await error.context
      .clone()
      .json()
      .catch(() => null);
    if (body && typeof body === "object" && "error" in body && typeof body.error === "string") {
      return new Error(body.error);
    }
  }
  return new Error(error.message);
}
