import { useEffect, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useUser } from "@/lib/auth";
import type { Json } from "@/integrations/supabase/types";

type SiteCopy = {
  heroTitle: string;
  heroCta: string;
  aboutIntro: string;
  mission: string;
  vision: string;
  story: string;
  accreditation: string;
  coreValues: string;
};

const emptyCopy: SiteCopy = {
  heroTitle: "",
  heroCta: "",
  aboutIntro: "",
  mission: "",
  vision: "",
  story: "",
  accreditation: "",
  coreValues: "",
};

function settingValues(value: Json | undefined) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value;
}

function textValue(value: Json | undefined) {
  return typeof value === "string" ? value : "";
}

export function SiteCopyManager() {
  const queryClient = useQueryClient();
  const { user } = useUser();
  const [values, setValues] = useState(emptyCopy);
  const [saving, setSaving] = useState(false);
  const copyQuery = useQuery({
    queryKey: ["admin", "site-copy"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("site_settings")
        .select("key,value")
        .in("key", ["content.hero", "content.about"]);
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (!copyQuery.data) return;
    const records = new Map(copyQuery.data.map((record) => [record.key, record.value]));
    const hero = settingValues(records.get("content.hero"));
    const about = settingValues(records.get("content.about"));
    setValues({
      heroTitle: textValue(hero["title"]),
      heroCta: textValue(hero["cta"]),
      aboutIntro: textValue(about["intro"]),
      mission: textValue(about["mission"]),
      vision: textValue(about["vision"]),
      story: textValue(about["history"]),
      accreditation: textValue(about["accreditation"]),
      coreValues: Array.isArray(about["core_values"])
        ? about["core_values"].filter((item): item is string => typeof item === "string").join("\n")
        : "",
    });
  }, [copyQuery.data]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    const hero: Json = {
      ...settingValues(
        new Map(copyQuery.data?.map((row) => [row.key, row.value])).get("content.hero"),
      ),
      title: values.heroTitle.trim(),
      cta: values.heroCta.trim(),
    };
    const about: Json = {
      ...settingValues(
        new Map(copyQuery.data?.map((row) => [row.key, row.value])).get("content.about"),
      ),
      intro: values.aboutIntro.trim(),
      mission: values.mission.trim(),
      vision: values.vision.trim(),
      history: values.story.trim(),
      accreditation: values.accreditation.trim(),
      core_values: values.coreValues
        .split("\n")
        .map((item) => item.trim())
        .filter(Boolean),
    };
    const { error } = await supabase.from("site_settings").upsert(
      [
        { key: "content.hero", value: hero, updated_by: user?.id ?? null },
        { key: "content.about", value: about, updated_by: user?.id ?? null },
      ],
      { onConflict: "key" },
    );
    setSaving(false);
    if (error) {
      toast.error("Could not save site copy", { description: error.message });
      return;
    }
    toast.success("Homepage and About page copy updated");
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["site_settings"] }),
      queryClient.invalidateQueries({ queryKey: ["admin", "site-copy"] }),
    ]);
  }

  if (copyQuery.isLoading)
    return <p className="rounded-xl border bg-card p-5 text-sm">Loading site copy…</p>;
  if (copyQuery.error)
    return (
      <section className="rounded-xl border border-destructive/30 bg-destructive/5 p-5">
        <p role="alert" className="text-sm text-destructive">
          Could not load site copy: {copyQuery.error.message}
        </p>
        <Button className="mt-3" variant="outline" onClick={() => void copyQuery.refetch()}>
          Retry
        </Button>
      </section>
    );

  return (
    <form onSubmit={save} className="space-y-6 rounded-xl border bg-card p-5 shadow-card sm:p-6">
      <div>
        <p className="eyebrow">Website content</p>
        <h2 className="mt-1 text-xl font-bold text-brand">Homepage and About page copy</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Update the hero heading and button, and the text shown in the About page sections.
        </p>
      </div>
      <section className="grid gap-4 rounded-lg border p-4">
        <h3 className="font-semibold text-brand">Homepage hero</h3>
        <label className="grid gap-1.5 text-sm font-medium">
          Hero heading
          <Input
            required
            value={values.heroTitle}
            onChange={(event) => setValues({ ...values, heroTitle: event.target.value })}
          />
        </label>
        <label className="grid gap-1.5 text-sm font-medium">
          Primary button text
          <Input
            value={values.heroCta}
            onChange={(event) => setValues({ ...values, heroCta: event.target.value })}
          />
        </label>
        <p className="text-xs text-muted-foreground">
          A heading entered on an individual hero slide takes priority over this default heading.
        </p>
      </section>
      <section className="grid gap-4 rounded-lg border p-4 sm:grid-cols-2">
        <h3 className="font-semibold text-brand sm:col-span-2">About page</h3>
        <CopyField
          label="Introduction"
          value={values.aboutIntro}
          onChange={(aboutIntro) => setValues({ ...values, aboutIntro })}
        />
        <CopyField
          label="Our mission"
          value={values.mission}
          onChange={(mission) => setValues({ ...values, mission })}
        />
        <CopyField
          label="Our vision"
          value={values.vision}
          onChange={(vision) => setValues({ ...values, vision })}
        />
        <CopyField
          label="Our story"
          value={values.story}
          onChange={(story) => setValues({ ...values, story })}
        />
        <CopyField
          label="Accreditation"
          value={values.accreditation}
          onChange={(accreditation) => setValues({ ...values, accreditation })}
        />
        <label className="grid gap-1.5 text-sm font-medium sm:col-span-2">
          Core values (one per line)
          <Textarea
            rows={4}
            value={values.coreValues}
            onChange={(event) => setValues({ ...values, coreValues: event.target.value })}
          />
        </label>
      </section>
      <Button disabled={saving || !copyQuery.data}>
        {saving ? "Saving…" : "Save website copy"}
      </Button>
    </form>
  );
}

function CopyField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="grid gap-1.5 text-sm font-medium">
      {label}
      <Textarea rows={4} value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}
