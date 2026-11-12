import { useState, type ChangeEvent, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Mail, Paperclip, Reply, Send } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
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
import type { Tables } from "@/integrations/supabase/types";

type ContactMessage = Tables<"contact_messages">;
type ContactMessageReply = Tables<"contact_message_replies">;
type MessageWithReplies = ContactMessage & { replies: ContactMessageReply[] };

const maxFileSize = 5 * 1024 * 1024;
const maxTotalBytes = 15 * 1024 * 1024;
const maxFiles = 10;

export function ContactMessagesPanel() {
  const queryClient = useQueryClient();
  const [selectedMessageId, setSelectedMessageId] = useState("");
  const [composingReply, setComposingReply] = useState(false);
  const [subject, setSubject] = useState("");
  const [replyBody, setReplyBody] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");
  const [updatingStatusId, setUpdatingStatusId] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ["admin", "contact-messages"],
    queryFn: async () => {
      const [messagesResult, repliesResult] = await Promise.all([
        supabase.from("contact_messages").select("*").order("created_at", { ascending: false }),
        supabase
          .from("contact_message_replies")
          .select("*")
          .order("created_at", { ascending: true }),
      ]);
      if (messagesResult.error) throw messagesResult.error;
      if (repliesResult.error) throw repliesResult.error;
      const repliesByMessage = new Map<string, ContactMessageReply[]>();
      for (const reply of repliesResult.data) {
        const replies = repliesByMessage.get(reply.message_id) ?? [];
        replies.push(reply);
        repliesByMessage.set(reply.message_id, replies);
      }
      return messagesResult.data.map((message) => ({
        ...message,
        replies: repliesByMessage.get(message.id) ?? [],
      }));
    },
  });

  const messages = query.data ?? [];
  const selectedMessage = messages.find((message) => message.id === selectedMessageId);
  const validFiles = files.length <= maxFiles && files.every((file) => file.size <= maxFileSize);
  const totalBytes = files.reduce((total, file) => total + file.size, 0);

  function openMessage(message: MessageWithReplies) {
    setSelectedMessageId(message.id);
    setComposingReply(false);
    setReplyBody("");
    setFiles([]);
    setSendError("");
    setSubject(
      /^re:/i.test(message.subject ?? "")
        ? (message.subject ?? "")
        : `Re: ${message.subject?.trim() || "Your message to Profia Institute"}`,
    );
  }

  function closeMessage(open: boolean) {
    if (open) return;
    setSelectedMessageId("");
    setComposingReply(false);
    setReplyBody("");
    setFiles([]);
    setSendError("");
  }

  async function toggleMessageStatus(message: ContactMessage) {
    setUpdatingStatusId(message.id);
    try {
      const { error } = await supabase
        .from("contact_messages")
        .update({ status: message.status === "new" ? "responded" : "new" })
        .eq("id", message.id);
      if (error) throw error;
      toast.success(message.status === "new" ? "Message marked responded" : "Message reopened");
      await queryClient.invalidateQueries({ queryKey: ["admin", "contact-messages"] });
    } catch (cause) {
      const errorMessage =
        cause instanceof Error ? cause.message : "The message status could not be updated.";
      toast.error("Could not update message status", { description: errorMessage });
    } finally {
      setUpdatingStatusId(null);
    }
  }

  function selectFiles(event: ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(event.target.files ?? []);
    setSendError("");
    if (selected.length > maxFiles) {
      setSendError(`Choose no more than ${maxFiles} attachments.`);
      event.target.value = "";
      return;
    }
    if (selected.some((file) => file.size > maxFileSize)) {
      setSendError("Each attachment must be 5 MB or smaller.");
      event.target.value = "";
      return;
    }
    if (selected.reduce((sum, file) => sum + file.size, 0) > maxTotalBytes) {
      setSendError("Attachments must total 15 MB or less.");
      event.target.value = "";
      return;
    }
    setFiles(selected);
  }

  async function sendReply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedMessage) return;
    if (!selectedMessage.email?.trim()) {
      setSendError(
        "This message has no sender email address, so it cannot be replied to by email.",
      );
      return;
    }
    if (!validFiles || totalBytes > maxTotalBytes) {
      setSendError("Attachments must be 5 MB or smaller each and 15 MB or smaller in total.");
      return;
    }
    setSending(true);
    setSendError("");
    const stagedPaths: string[] = [];
    try {
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError || !userData.user) throw new Error("Sign in again before sending a reply.");
      for (const file of files) {
        stagedPaths.push(await uploadStagedFile(userData.user.id, file));
      }
      const { data, error } = await supabase.functions.invoke("admin-reply-contact-message", {
        body: {
          messageId: selectedMessage.id,
          subject: subject.trim(),
          body: replyBody.trim(),
          stagedFiles: stagedPaths,
        },
      });
      if (error) throw await functionError(error);
      if (!data?.success || !isReply(data.reply)) {
        throw new Error("The email service did not confirm delivery.");
      }
      toast.success("Reply sent", {
        description:
          typeof data.warning === "string"
            ? data.warning
            : `Your reply was sent to ${selectedMessage.email}.`,
      });
      setReplyBody("");
      setFiles([]);
      setComposingReply(false);
      await queryClient.invalidateQueries({ queryKey: ["admin", "contact-messages"] });
      await queryClient.invalidateQueries({ queryKey: ["admin", "directory", "messages"] });
    } catch (cause) {
      const message =
        cause instanceof Error ? cause.message : "The reply could not be sent. Please try again.";
      setSendError(message);
      toast.error("Could not send reply", { description: message });
    } finally {
      if (stagedPaths.length) {
        const { error } = await supabase.storage.from("email-share-staging").remove(stagedPaths);
        if (error) console.error("Could not remove temporary reply attachments:", error.message);
      }
      setSending(false);
    }
  }

  return (
    <section className="space-y-4 rounded-xl border bg-card p-5 shadow-card">
      <div>
        <h2 className="font-semibold text-brand">Messages</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Open a message to read the full text and reply directly to its sender.
        </p>
      </div>
      {query.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading messages…</p>
      ) : query.error ? (
        <div role="alert" className="text-sm text-destructive">
          Could not load messages: {query.error.message}
          <Button className="ml-3" size="sm" variant="outline" onClick={() => void query.refetch()}>
            Retry
          </Button>
        </div>
      ) : messages.length ? (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[640px] border-collapse text-left text-sm">
            <thead>
              <tr className="bg-muted/40">
                <th className="border-b px-3 py-2">Sender</th>
                <th className="border-b px-3 py-2">Subject</th>
                <th className="border-b px-3 py-2">Message preview</th>
                <th className="border-b px-3 py-2">Received</th>
                <th className="border-b px-3 py-2">Status</th>
                <th className="border-b px-3 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {messages.map((message) => (
                <tr key={message.id} className="border-b last:border-0">
                  <td className="px-3 py-3 font-medium">{message.name}</td>
                  <td className="px-3 py-3">{message.subject || "(No subject)"}</td>
                  <td className="max-w-72 truncate px-3 py-3 text-muted-foreground">
                    {message.message}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3">
                    {new Date(message.created_at).toLocaleString()}
                  </td>
                  <td className="px-3 py-3">
                    <Badge variant={message.status === "responded" ? "secondary" : "default"}>
                      {message.status === "responded" ? "Responded" : "New"}
                    </Badge>
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => openMessage(message)}
                      >
                        <Mail />
                        Open message
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        disabled={updatingStatusId === message.id}
                        onClick={() => void toggleMessageStatus(message)}
                      >
                        {message.status === "new" ? "Mark responded" : "Reopen"}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="rounded-lg bg-muted/40 p-4 text-sm text-muted-foreground">
          No messages have been received.
        </p>
      )}

      <Dialog open={Boolean(selectedMessage)} onOpenChange={closeMessage}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          {selectedMessage && (
            <>
              <DialogHeader>
                <DialogTitle>{selectedMessage.subject || "Message"}</DialogTitle>
                <DialogDescription>
                  Received {new Date(selectedMessage.created_at).toLocaleString()}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3 rounded-lg border bg-muted/20 p-4 text-sm">
                <p>
                  <span className="font-semibold">From:</span> {selectedMessage.name}
                </p>
                <p>
                  <span className="font-semibold">Email:</span>{" "}
                  {selectedMessage.email || "No email address provided"}
                </p>
                {selectedMessage.phone && (
                  <p>
                    <span className="font-semibold">Phone:</span> {selectedMessage.phone}
                  </p>
                )}
                <div>
                  <p className="font-semibold">Message</p>
                  <p className="mt-1 whitespace-pre-wrap break-words">{selectedMessage.message}</p>
                </div>
              </div>

              {selectedMessage.replies.map((reply) => (
                <article key={reply.id} className="space-y-2 rounded-lg border p-4 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="font-semibold">{reply.subject}</h3>
                    <Badge variant={reply.status === "sent" ? "secondary" : "destructive"}>
                      {reply.status}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {reply.sent_at
                      ? `Sent ${new Date(reply.sent_at).toLocaleString()}`
                      : `Created ${new Date(reply.created_at).toLocaleString()}`}
                  </p>
                  <p className="whitespace-pre-wrap break-words">{reply.body}</p>
                  {reply.attachment_names.length > 0 && (
                    <p className="text-xs text-muted-foreground">
                      Attachments: {reply.attachment_names.join(", ")}
                    </p>
                  )}
                </article>
              ))}

              {!composingReply ? (
                <Button
                  type="button"
                  disabled={!selectedMessage.email?.trim()}
                  onClick={() => {
                    setSubject(
                      /^re:/i.test(selectedMessage.subject ?? "")
                        ? (selectedMessage.subject ?? "")
                        : `Re: ${selectedMessage.subject?.trim() || "Your message to Profia Institute"}`,
                    );
                    setComposingReply(true);
                    setSendError("");
                  }}
                >
                  <Reply />
                  Reply to sender
                </Button>
              ) : (
                <form
                  className="space-y-3 border-t pt-4"
                  onSubmit={(event) => void sendReply(event)}
                >
                  <p className="text-sm">
                    Replying to <span className="font-semibold">{selectedMessage.email}</span>
                  </p>
                  <label className="grid gap-1 text-sm font-medium">
                    Subject
                    <Input
                      required
                      maxLength={200}
                      value={subject}
                      onChange={(event) => setSubject(event.target.value)}
                      disabled={sending}
                    />
                  </label>
                  <label className="grid gap-1 text-sm font-medium">
                    Reply
                    <Textarea
                      required
                      rows={5}
                      maxLength={10_000}
                      value={replyBody}
                      onChange={(event) => setReplyBody(event.target.value)}
                      disabled={sending}
                      placeholder="Write your reply…"
                    />
                  </label>
                  <label className="grid gap-1 text-sm font-medium">
                    Attach files
                    <Input type="file" multiple disabled={sending} onChange={selectFiles} />
                    <span className="flex items-center gap-1 text-xs font-normal text-muted-foreground">
                      <Paperclip className="h-3.5 w-3.5" />
                      Up to 10 files, 5 MB each and 15 MB total.
                    </span>
                  </label>
                  {files.length > 0 && (
                    <p className="text-xs text-muted-foreground">
                      {files.map((file) => file.name).join(", ")}
                    </p>
                  )}
                  {sendError && (
                    <p role="alert" className="text-sm text-destructive">
                      {sendError}
                    </p>
                  )}
                  <div className="flex justify-end gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      disabled={sending}
                      onClick={() => {
                        setComposingReply(false);
                        setReplyBody("");
                        setFiles([]);
                        setSendError("");
                      }}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      disabled={sending || !validFiles || totalBytes > maxTotalBytes}
                    >
                      <Send />
                      {sending ? "Sending…" : "Send reply"}
                    </Button>
                  </div>
                </form>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}

async function uploadStagedFile(userId: string, file: File) {
  const path = `${userId}/${crypto.randomUUID()}/${safeFileName(file.name)}`;
  const { error } = await supabase.storage.from("email-share-staging").upload(path, file, {
    contentType: file.type || "application/octet-stream",
    upsert: false,
  });
  if (error) throw new Error(`Could not upload ${file.name}: ${error.message}`);
  return path;
}

function safeFileName(value: string) {
  return (
    Array.from(value, (character) =>
      /[<>:"/\\|?*]/.test(character) || character.charCodeAt(0) < 32 ? "-" : character,
    )
      .join("")
      .slice(0, 180) || "attachment"
  );
}

function isReply(value: unknown): value is ContactMessageReply {
  return Boolean(
    value &&
    typeof value === "object" &&
    "id" in value &&
    "message_id" in value &&
    "subject" in value &&
    "body" in value &&
    "status" in value,
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
