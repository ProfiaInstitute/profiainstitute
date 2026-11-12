import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { useUser } from "@/lib/auth";

type FacilitatorAssignment = Pick<
  Tables<"facilitator_unit_assignments">,
  | "id"
  | "facilitator_id"
  | "unit_id"
  | "active"
  | "can_manage_materials"
  | "can_manage_assignments"
  | "can_manage_cats"
  | "can_manage_results"
>;

type Permissions = {
  active: boolean;
  can_manage_materials: boolean;
  can_manage_assignments: boolean;
  can_manage_cats: boolean;
  can_manage_results: boolean;
};

const noPermissions: Permissions = {
  active: true,
  can_manage_materials: false,
  can_manage_assignments: false,
  can_manage_cats: false,
  can_manage_results: false,
};
const noLevelValue = "no-level";

async function getInvitationErrorMessage(error: unknown): Promise<string> {
  if (error instanceof FunctionsHttpError && error.context instanceof Response) {
    try {
      const payload: unknown = await error.context.clone().json();
      if (
        typeof payload === "object" &&
        payload !== null &&
        "error" in payload &&
        typeof payload.error === "string"
      ) {
        return payload.error;
      }
    } catch {
      return error.message;
    }
  }
  return error instanceof Error
    ? error.message
    : "The invitation service returned no confirmation.";
}

export function FacilitatorManager() {
  const { user } = useUser();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [selectedCourse, setSelectedCourse] = useState("");
  const [selectedLevel, setSelectedLevel] = useState("");
  const [selectedFacilitator, setSelectedFacilitator] = useState("");
  const [selectedUnit, setSelectedUnit] = useState("");
  const [permissions, setPermissions] = useState(noPermissions);
  const [busy, setBusy] = useState(false);
  const directoryQuery = useQuery({
    queryKey: ["admin", "facilitator-management"],
    queryFn: async () => {
      const [roles, units, levels, assignments] = await Promise.all([
        supabase.from("user_roles").select("user_id").eq("role", "facilitator"),
        supabase.from("course_units").select("id,course_id,title,level_id").order("title"),
        supabase.from("course_levels").select("id,course_id,name").order("name"),
        supabase
          .from("facilitator_unit_assignments")
          .select(
            "id,facilitator_id,unit_id,active,can_manage_materials,can_manage_assignments,can_manage_cats,can_manage_results",
          ),
      ]);
      if (roles.error) throw roles.error;
      if (units.error) throw units.error;
      if (levels.error) throw levels.error;
      if (assignments.error) throw assignments.error;
      const userIds = [...new Set(roles.data.map((role) => role.user_id))];
      const courseIds = [...new Set(units.data.map((unit) => unit.course_id))];
      const [profiles, courses] = await Promise.all([
        userIds.length
          ? supabase.from("profiles").select("id,full_name,email").in("id", userIds)
          : Promise.resolve({ data: [], error: null }),
        courseIds.length
          ? supabase.from("courses").select("id,title").in("id", courseIds)
          : Promise.resolve({ data: [], error: null }),
      ]);
      if (profiles.error) throw profiles.error;
      if (courses.error) throw courses.error;
      return {
        facilitators: profiles.data ?? [],
        units: units.data,
        levels: levels.data,
        assignments: assignments.data,
        courses: courses.data ?? [],
      };
    },
  });
  const assignment = directoryQuery.data?.assignments.find(
    (row) => row.facilitator_id === selectedFacilitator && row.unit_id === selectedUnit,
  );
  useEffect(() => {
    if (assignment) {
      setPermissions({
        active: assignment.active,
        can_manage_materials: assignment.can_manage_materials,
        can_manage_assignments: assignment.can_manage_assignments,
        can_manage_cats: assignment.can_manage_cats,
        can_manage_results: assignment.can_manage_results,
      });
    } else {
      setPermissions(noPermissions);
    }
  }, [assignment]);
  const courseById = useMemo(
    () => new Map(directoryQuery.data?.courses.map((course) => [course.id, course.title]) ?? []),
    [directoryQuery.data?.courses],
  );
  const availableLevels =
    directoryQuery.data?.levels?.filter((level) => level.course_id === selectedCourse) ?? [];
  const availableUnits =
    directoryQuery.data?.units?.filter(
      (unit) =>
        unit.course_id === selectedCourse &&
        (selectedLevel === noLevelValue ? unit.level_id === null : unit.level_id === selectedLevel),
    ) ?? [];

  function editAssignment(row: FacilitatorAssignment) {
    const unit = directoryQuery.data?.units.find((item) => item.id === row.unit_id);
    if (!unit) {
      toast.error("Could not find the course unit for this assignment.");
      return;
    }
    setSelectedCourse(unit.course_id);
    setSelectedLevel(unit.level_id ?? noLevelValue);
    setSelectedUnit(unit.id);
    setSelectedFacilitator(row.facilitator_id);
    setPermissions({
      active: row.active,
      can_manage_materials: row.can_manage_materials,
      can_manage_assignments: row.can_manage_assignments,
      can_manage_cats: row.can_manage_cats,
      can_manage_results: row.can_manage_results,
    });
    document.getElementById("facilitator-unit-assignment")?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }

  async function invite() {
    const normalizedEmail = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      toast.error("Enter a valid facilitator email address.");
      return;
    }
    setBusy(true);
    const { data, error } = await supabase.functions.invoke("invite-staff", {
      body: { email: normalizedEmail, role: "facilitator" },
    });
    setBusy(false);
    if (error || !data?.success) {
      toast.error("Could not invite facilitator", {
        description:
          data?.error ??
          (error
            ? await getInvitationErrorMessage(error)
            : "The invitation service returned no confirmation."),
      });
      return;
    }
    toast.success("Facilitator invitation sent", {
      description: "The invite link opens directly on the facilitator password setup page.",
    });
    setEmail("");
    await queryClient.invalidateQueries({ queryKey: ["admin", "facilitator-management"] });
  }

  async function saveAssignment() {
    if (!user?.id || !selectedFacilitator || !selectedUnit) {
      toast.error("Select a facilitator and course unit first.");
      return;
    }
    setBusy(true);
    const { error } = await supabase.from("facilitator_unit_assignments").upsert(
      {
        facilitator_id: selectedFacilitator,
        unit_id: selectedUnit,
        created_by: user.id,
        ...permissions,
      },
      { onConflict: "facilitator_id,unit_id" },
    );
    setBusy(false);
    if (error) {
      toast.error("Could not save unit assignment", { description: error.message });
      return;
    }
    toast.success("Facilitator unit access updated");
    await queryClient.invalidateQueries({ queryKey: ["admin", "facilitator-management"] });
  }

  if (directoryQuery.isLoading)
    return <p className="rounded-xl border bg-card p-5 text-sm">Loading facilitator directory…</p>;
  if (directoryQuery.error)
    return (
      <section className="rounded-xl border border-destructive/30 bg-destructive/5 p-5">
        <p role="alert" className="text-sm text-destructive">
          Could not load facilitator settings: {directoryQuery.error.message}
        </p>
        <Button className="mt-3" variant="outline" onClick={() => void directoryQuery.refetch()}>
          Retry
        </Button>
      </section>
    );
  if (!directoryQuery.data)
    return <p className="rounded-xl border bg-card p-5 text-sm">Loading facilitator directory…</p>;
  return (
    <div className="space-y-5">
      <section className="space-y-3 rounded-xl border bg-card p-5 shadow-card">
        <div>
          <h2 className="font-semibold text-brand">Invite facilitator</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            An invitation is emailed. Its link opens the facilitator portal password setup screen.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Input
            type="email"
            autoComplete="email"
            placeholder="Facilitator email address"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="min-w-60 flex-1"
          />
          <Button disabled={busy} loading={busy} onClick={() => void invite()}>
            {busy ? "Sending…" : "Send facilitator invite"}
          </Button>
        </div>
      </section>
      <section className="space-y-4 rounded-xl border bg-card p-5 shadow-card">
        <div>
          <h2 className="font-semibold text-brand">Assign or edit a facilitator unit</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Choose a course, level, unit, and facilitator. Existing assignments can be edited here.
            Facilitators only see students enrolled in the level of their assigned unit.
          </p>
        </div>
        <div id="facilitator-unit-assignment" className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1.5 text-sm font-medium">
            Course
            <select
              className="h-10 rounded-md border bg-background px-3"
              value={selectedCourse}
              onChange={(event) => {
                setSelectedCourse(event.target.value);
                setSelectedLevel("");
                setSelectedUnit("");
              }}
            >
              <option value="">Select course</option>
              {directoryQuery.data.courses
                .slice()
                .sort((left, right) => left.title.localeCompare(right.title))
                .map((course) => (
                  <option key={course.id} value={course.id}>
                    {course.title}
                  </option>
                ))}
            </select>
          </label>
          <label className="grid gap-1.5 text-sm font-medium">
            Level
            <select
              className="h-10 rounded-md border bg-background px-3"
              value={selectedLevel}
              disabled={!selectedCourse}
              onChange={(event) => {
                setSelectedLevel(event.target.value);
                setSelectedUnit("");
              }}
            >
              <option value="">Select level</option>
              {availableLevels.map((level) => (
                <option key={level.id} value={level.id}>
                  {level.name}
                </option>
              ))}
              {directoryQuery.data.units.some(
                (unit) => unit.course_id === selectedCourse && unit.level_id === null,
              ) && <option value={noLevelValue}>Units without a level</option>}
            </select>
          </label>
          <label className="grid gap-1.5 text-sm font-medium">
            Course unit
            <select
              className="h-10 rounded-md border bg-background px-3"
              value={selectedUnit}
              disabled={!selectedCourse || !selectedLevel}
              onChange={(event) => setSelectedUnit(event.target.value)}
            >
              <option value="">Select unit</option>
              {availableUnits.map((unit) => (
                <option key={unit.id} value={unit.id}>
                  {unit.title}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1.5 text-sm font-medium">
            Facilitator
            <select
              className="h-10 rounded-md border bg-background px-3"
              value={selectedFacilitator}
              disabled={!selectedUnit}
              onChange={(event) => setSelectedFacilitator(event.target.value)}
            >
              <option value="">Select facilitator</option>
              {directoryQuery.data.facilitators.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.full_name || item.email || item.id}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <PermissionSwitch
            label="Allow learning materials and videos"
            checked={permissions.can_manage_materials}
            onChange={(checked) =>
              setPermissions({ ...permissions, can_manage_materials: checked })
            }
          />
          <PermissionSwitch
            label="Allow assignments and marking"
            checked={permissions.can_manage_assignments}
            onChange={(checked) =>
              setPermissions({ ...permissions, can_manage_assignments: checked })
            }
          />
          <PermissionSwitch
            label="Allow CAT creation"
            checked={permissions.can_manage_cats}
            onChange={(checked) => setPermissions({ ...permissions, can_manage_cats: checked })}
          />
          <PermissionSwitch
            label="Allow results posting"
            checked={permissions.can_manage_results}
            onChange={(checked) => setPermissions({ ...permissions, can_manage_results: checked })}
          />
          <PermissionSwitch
            label="Assignment active"
            checked={permissions.active}
            onChange={(checked) => setPermissions({ ...permissions, active: checked })}
          />
        </div>
        <Button
          disabled={busy || !selectedFacilitator || !selectedUnit}
          loading={busy}
          onClick={() => void saveAssignment()}
        >
          {busy ? "Saving…" : assignment ? "Update unit access" : "Assign unit"}
        </Button>
      </section>
      <section className="rounded-xl border bg-card p-5 shadow-card">
        <h2 className="font-semibold text-brand">Edit facilitator unit assignments</h2>
        <div className="mt-3 overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[700px] text-left text-sm">
            <thead className="bg-muted/40">
              <tr>
                <th className="border-b px-3 py-2">Facilitator</th>
                <th className="border-b px-3 py-2">Course</th>
                <th className="border-b px-3 py-2">Level</th>
                <th className="border-b px-3 py-2">Unit</th>
                <th className="border-b px-3 py-2">Status</th>
                <th className="border-b px-3 py-2">Action</th>
              </tr>
            </thead>
            <tbody>
              {directoryQuery.data.assignments.map((row) => {
                const facilitator = directoryQuery.data.facilitators.find(
                  (item) => item.id === row.facilitator_id,
                );
                const unit = directoryQuery.data.units.find((item) => item.id === row.unit_id);
                const levelName = directoryQuery.data.levels.find(
                  (level) => level.id === unit?.level_id,
                )?.name;
                return (
                  <tr key={row.id} className="border-b last:border-0">
                    <td className="px-3 py-2">
                      {facilitator?.full_name || facilitator?.email || "Facilitator"}
                    </td>
                    <td className="px-3 py-2">
                      {courseById.get(unit?.course_id ?? "") ?? "Course"}
                    </td>
                    <td className="px-3 py-2">{levelName ?? "No level"}</td>
                    <td className="px-3 py-2">{unit?.title ?? "Unit"}</td>
                    <td
                      className={`px-3 py-2 ${row.active ? "text-success" : "text-muted-foreground"}`}
                    >
                      {row.active ? "Active" : "Disabled"}
                    </td>
                    <td className="px-3 py-2">
                      <Button size="sm" variant="outline" onClick={() => editAssignment(row)}>
                        Edit
                      </Button>
                    </td>
                  </tr>
                );
              })}
              {!directoryQuery.data.assignments.length && (
                <tr>
                  <td colSpan={6} className="px-3 py-4 text-muted-foreground">
                    No units assigned yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function PermissionSwitch({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 rounded-md border p-3 text-sm">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      {label}
    </label>
  );
}
