import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

export type LearningMaterialTarget = {
  courseId: string;
  levelId: string;
  unitId: string;
};

export function LearningMaterialTargetFields({
  target,
  courses,
  title,
  onChange,
  onRemove,
}: {
  target: LearningMaterialTarget;
  courses: { id: string; title: string }[];
  title: string;
  onChange: (target: LearningMaterialTarget) => void;
  onRemove?: () => void;
}) {
  const levelsQuery = useQuery({
    queryKey: ["learning-material-target-levels", target.courseId],
    enabled: Boolean(target.courseId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("course_levels")
        .select("id,name,sort_order")
        .eq("course_id", target.courseId)
        .order("sort_order");
      if (error) throw error;
      return data;
    },
  });
  const unitsQuery = useQuery({
    queryKey: ["learning-material-target-units", target.courseId, target.levelId],
    enabled: Boolean(target.courseId && target.levelId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("course_units")
        .select("id,title,code,level_id")
        .eq("course_id", target.courseId)
        .order("sort_order");
      if (error) throw error;
      return data.filter((unit) => unit.level_id === null || unit.level_id === target.levelId);
    },
  });
  const selectClass = "h-10 w-full rounded-md border border-input bg-background px-3 text-sm";

  return (
    <section className="space-y-3 rounded-xl border bg-background p-4 sm:col-span-2">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-brand">{title}</h3>
        {onRemove && (
          <Button type="button" variant="ghost" size="sm" onClick={onRemove}>
            Remove
          </Button>
        )}
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="space-y-1 text-xs font-medium">
          Course
          <select
            required
            className={selectClass}
            value={target.courseId}
            onChange={(event) =>
              onChange({ courseId: event.target.value, levelId: "", unitId: "" })
            }
          >
            <option value="">Select course</option>
            {courses.map((course) => (
              <option key={course.id} value={course.id}>
                {course.title}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-xs font-medium">
          Course level
          <select
            required
            className={selectClass}
            value={target.levelId}
            onChange={(event) => onChange({ ...target, levelId: event.target.value, unitId: "" })}
            disabled={!target.courseId || levelsQuery.isLoading}
          >
            <option value="">{levelsQuery.isLoading ? "Loading levels…" : "Select level"}</option>
            {levelsQuery.data?.map((level) => (
              <option key={level.id} value={level.id}>
                {level.name}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-xs font-medium">
          Unit
          <select
            required
            className={selectClass}
            value={target.unitId}
            onChange={(event) => onChange({ ...target, unitId: event.target.value })}
            disabled={!target.levelId || unitsQuery.isLoading}
          >
            <option value="">{unitsQuery.isLoading ? "Loading units…" : "Select unit"}</option>
            {unitsQuery.data?.map((unit) => (
              <option key={unit.id} value={unit.id}>
                {unit.code ? `${unit.code} · ` : ""}
                {unit.title}
              </option>
            ))}
          </select>
        </label>
      </div>
      {levelsQuery.error && (
        <p role="alert" className="text-sm text-destructive">
          Could not load course levels: {levelsQuery.error.message}
        </p>
      )}
      {target.courseId && !levelsQuery.isLoading && levelsQuery.data?.length === 0 && (
        <p className="text-sm text-muted-foreground">
          This course has no levels yet. Add a course level before targeting materials.
        </p>
      )}
      {unitsQuery.error && (
        <p role="alert" className="text-sm text-destructive">
          Could not load course units: {unitsQuery.error.message}
        </p>
      )}
      {target.levelId && !unitsQuery.isLoading && unitsQuery.data?.length === 0 && (
        <p className="text-sm text-muted-foreground">No units are assigned to this level.</p>
      )}
    </section>
  );
}
