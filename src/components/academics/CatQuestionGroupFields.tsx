import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export function CatQuestionGroupFields({
  group,
  prompt,
  position,
  onChange,
}: {
  group: string;
  prompt: string;
  position: string;
  onChange: (field: "sharedGroup" | "sharedPrompt" | "groupPosition", value: string) => void;
}) {
  return (
    <div className="space-y-2 rounded-md border border-dashed p-3">
      <label className="grid gap-1 text-sm font-medium">
        Shared question group (optional)
        <Input
          maxLength={120}
          value={group}
          onChange={(event) => onChange("sharedGroup", event.target.value)}
          placeholder="For example: Case study 1"
        />
      </label>
      {group.trim() && (
        <>
          <label className="grid gap-1 text-sm font-medium">
            Shared case, passage, or data
            <Textarea
              maxLength={4000}
              rows={3}
              value={prompt}
              onChange={(event) => onChange("sharedPrompt", event.target.value)}
              placeholder="Enter the information these questions use. Repeat the same text and group name for each related question."
            />
          </label>
          <label className="grid max-w-48 gap-1 text-sm font-medium">
            Solution step
            <Input
              required
              type="number"
              min={1}
              max={100}
              step={1}
              value={position}
              onChange={(event) => onChange("groupPosition", event.target.value)}
            />
          </label>
        </>
      )}
    </div>
  );
}
