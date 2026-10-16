import { useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BarChart3, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

type FaqDraft = {
  question: string;
  answer: string;
  category: string;
  school_id: string;
  sort_order: string;
  published: boolean;
};

const EMPTY_DRAFT: FaqDraft = {
  question: "",
  answer: "",
  category: "Admissions",
  school_id: "",
  sort_order: "0",
  published: false,
};

export function FaqManagementPanel() {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<FaqDraft>(EMPTY_DRAFT);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const faqsQuery = useQuery({
    queryKey: ["admin", "faqs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("faqs")
        .select("*")
        .order("category")
        .order("sort_order");
      if (error) throw error;
      return data;
    },
  });
  const schoolsQuery = useQuery({
    queryKey: ["admin", "faq-schools"],
    queryFn: async () => {
      const { data, error } = await supabase.from("schools").select("id,name").order("name");
      if (error) throw error;
      return data;
    },
  });
  const insightsQuery = useQuery({
    queryKey: ["admin", "faq-search-insights", 30],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("list_faq_search_insights", { _days: 30 });
      if (error) throw error;
      return data;
    },
  });

  async function saveFaq(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const question = draft.question.trim();
    const answer = draft.answer.trim();
    const category = draft.category.trim();
    const sortOrder = Number(draft.sort_order);
    if (!question || !answer || !category) {
      toast.error("Enter a question, answer, and category.");
      return;
    }
    if (!Number.isSafeInteger(sortOrder)) {
      toast.error("Sort order must be a whole number.");
      return;
    }

    setSaving(true);
    try {
      const values = {
        question,
        answer,
        category,
        school_id: draft.school_id || null,
        sort_order: sortOrder,
        published: draft.published,
      };
      const result = editingId
        ? await supabase.from("faqs").update(values).eq("id", editingId)
        : await supabase.from("faqs").insert(values);
      if (result.error) throw result.error;
      toast.success(editingId ? "FAQ updated" : "FAQ created");
      resetDraft();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["admin", "faqs"] }),
        queryClient.invalidateQueries({ queryKey: ["faqs"] }),
      ]);
    } catch (error) {
      toast.error("Could not save FAQ", {
        description: error instanceof Error ? error.message : "Please try again.",
      });
    } finally {
      setSaving(false);
    }
  }

  async function deleteFaq(id: string) {
    if (!window.confirm("Delete this FAQ? This will also remove its anonymous search totals."))
      return;
    try {
      const { error } = await supabase.from("faqs").delete().eq("id", id);
      if (error) throw error;
      toast.success("FAQ deleted");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["admin", "faqs"] }),
        queryClient.invalidateQueries({ queryKey: ["admin", "faq-search-insights"] }),
        queryClient.invalidateQueries({ queryKey: ["faqs"] }),
      ]);
      if (editingId === id) resetDraft();
    } catch (error) {
      toast.error("Could not delete FAQ", {
        description: error instanceof Error ? error.message : "Please try again.",
      });
    }
  }

  function editFaq(faq: Tables<"faqs">) {
    setEditingId(faq.id);
    setDraft({
      question: faq.question,
      answer: faq.answer,
      category: faq.category,
      school_id: faq.school_id ?? "",
      sort_order: String(faq.sort_order),
      published: faq.published,
    });
  }

  function resetDraft() {
    setEditingId(null);
    setDraft(EMPTY_DRAFT);
  }

  if (faqsQuery.isLoading || schoolsQuery.isLoading)
    return (
      <p className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">Loading FAQs…</p>
    );
  const queryError = faqsQuery.error ?? schoolsQuery.error;
  if (queryError)
    return (
      <section className="space-y-3 rounded-xl border bg-card p-6">
        <h2 className="font-semibold text-brand">FAQ management could not be loaded</h2>
        <p className="text-sm text-muted-foreground">{queryError.message}</p>
        <Button
          variant="outline"
          onClick={() => {
            void faqsQuery.refetch();
            void schoolsQuery.refetch();
            void insightsQuery.refetch();
          }}
        >
          Try again
        </Button>
      </section>
    );

  const insightsByFaq = new Map(
    (insightsQuery.data ?? []).map((row) => [row.faq_id, row.search_count]),
  );
  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(20rem,0.8fr)]">
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-primary" />
          <div>
            <h2 className="font-semibold text-brand">Frequently searched FAQ topics</h2>
            <p className="text-xs text-muted-foreground">
              Anonymous matched searches over the last 30 days. Search text and visitor identity are
              not saved.
            </p>
          </div>
        </div>
        <div className="rounded-xl border bg-card p-4">
          {insightsQuery.error ? (
            <p className="text-sm text-destructive">
              Search insights are unavailable: {insightsQuery.error.message}
            </p>
          ) : insightsQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading search insights…</p>
          ) : insightsQuery.data?.length ? (
            <ol className="divide-y">
              {insightsQuery.data.map((item) => (
                <li key={item.faq_id} className="flex items-start justify-between gap-4 py-3">
                  <div>
                    <p className="text-sm font-medium">{item.question}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{item.category}</p>
                  </div>
                  <span className="shrink-0 rounded-full bg-accent px-3 py-1 text-sm font-semibold text-brand">
                    {item.search_count}
                  </span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-sm text-muted-foreground">
              Search insights will appear after visitors search for published FAQ topics.
            </p>
          )}
        </div>
        <div className="space-y-3">
          <h2 className="font-semibold text-brand">Published and draft FAQs</h2>
          {faqsQuery.data?.length ? (
            faqsQuery.data.map((faq) => (
              <article key={faq.id} className="rounded-xl border bg-card p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-accent px-2.5 py-1 text-xs font-medium text-brand">
                        {faq.category}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {faq.published ? "Published" : "Draft"}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {insightsByFaq.get(faq.id) ?? 0} searches
                      </span>
                    </div>
                    <h3 className="mt-3 font-semibold text-brand">{faq.question}</h3>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">
                      {faq.answer}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      aria-label={`Edit ${faq.question}`}
                      onClick={() => editFaq(faq)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      aria-label={`Delete ${faq.question}`}
                      onClick={() => void deleteFaq(faq.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </article>
            ))
          ) : (
            <p className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">
              No FAQs have been added yet.
            </p>
          )}
        </div>
      </section>

      <form onSubmit={saveFaq} className="h-fit space-y-4 rounded-xl border bg-card p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-semibold text-brand">{editingId ? "Edit FAQ" : "Add an FAQ"}</h2>
          {editingId && (
            <Button type="button" variant="ghost" size="sm" onClick={resetDraft}>
              Cancel
            </Button>
          )}
        </div>
        <label className="block space-y-1.5 text-sm font-medium">
          Question
          <Input
            required
            maxLength={300}
            value={draft.question}
            onChange={(event) => setDraft({ ...draft, question: event.target.value })}
          />
        </label>
        <label className="block space-y-1.5 text-sm font-medium">
          Answer
          <Textarea
            required
            maxLength={5000}
            rows={7}
            value={draft.answer}
            onChange={(event) => setDraft({ ...draft, answer: event.target.value })}
          />
        </label>
        <label className="block space-y-1.5 text-sm font-medium">
          Category
          <Input
            required
            maxLength={80}
            value={draft.category}
            onChange={(event) => setDraft({ ...draft, category: event.target.value })}
          />
        </label>
        <label className="block space-y-1.5 text-sm font-medium">
          Applies to
          <select
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            value={draft.school_id}
            onChange={(event) => setDraft({ ...draft, school_id: event.target.value })}
          >
            <option value="">All schools</option>
            {schoolsQuery.data?.map((school) => (
              <option key={school.id} value={school.id}>
                {school.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-1.5 text-sm font-medium">
          Display order
          <Input
            type="number"
            step="1"
            value={draft.sort_order}
            onChange={(event) => setDraft({ ...draft, sort_order: event.target.value })}
          />
        </label>
        <label className="flex items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            checked={draft.published}
            onChange={(event) => setDraft({ ...draft, published: event.target.checked })}
          />
          Publish this answer on the public website
        </label>
        <Button type="submit" disabled={saving} className="w-full">
          {editingId ? <Pencil /> : <Plus />}
          {saving ? "Saving…" : editingId ? "Save changes" : "Create FAQ"}
        </Button>
      </form>
    </div>
  );
}
