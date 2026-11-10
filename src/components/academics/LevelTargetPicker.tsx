import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function LevelTargetPicker({
  courseId,
  selectedLevelIds,
  onChange,
  allowedLevelId,
}: {
  courseId: string;
  selectedLevelIds: string[];
  onChange: (levelIds: string[]) => void;
  allowedLevelId?: string | null;
}) {
  const levelsQuery = useQuery({
    queryKey: ["course-level-targets", courseId],
    enabled: Boolean(courseId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("course_levels")
        .select("id,name,sort_order")
        .eq("course_id", courseId)
        .order("sort_order");
      if (error) throw error;
      return data;
    },
  });
  const levels = (levelsQuery.data ?? []).filter(
    (level) => !allowedLevelId || level.id === allowedLevelId,
  );

  function toggleLevel(levelId: string, checked: boolean) {
    onChange(
      checked
        ? [...new Set([...selectedLevelIds, levelId])]
        : selectedLevelIds.filter((selectedId) => selectedId !== levelId),
    );
  }

  return (
    <fieldset className="space-y-2 sm:col-span-2" disabled={!courseId || levelsQuery.isLoading}>
      <legend className="text-sm font-medium">Course levels</legend>
      {levelsQuery.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading course levels…</p>
      ) : levelsQuery.error ? (
        <p role="alert" className="text-sm text-destructive">
          Could not load course levels: {levelsQuery.error.message}
        </p>
      ) : levels.length ? (
        <div className="grid gap-2 sm:grid-cols-2">
          {levels.map((level) => (
            <label key={level.id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                required={selectedLevelIds.length === 0}
                checked={selectedLevelIds.includes(level.id)}
                onChange={(event) => toggleLevel(level.id, event.target.checked)}
              />
              {level.name}
            </label>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          {allowedLevelId
            ? "The assigned unit's level is not available for this course."
            : "Create course levels before targeting assignments or CATs."}
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        Select every level that should receive this item.
      </p>
    </fieldset>
  );
}
