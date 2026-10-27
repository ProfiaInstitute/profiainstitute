import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useUser } from "@/lib/auth";

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

export function FacilitatorManager() {
  const { user } = useUser();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [selectedFacilitator, setSelectedFacilitator] = useState("");
  const [selectedUnit, setSelectedUnit] = useState("");
  const [permissions, setPermissions] = useState(noPermissions);
  const [busy, setBusy] = useState(false);
  const directoryQuery = useQuery({
    queryKey: ["admin", "facilitator-management"],
    queryFn: async () => {
      const [roles, units, assignments] = await Promise.all([
        supabase.from("user_roles").select("user_id").eq("role", "facilitator"),
        supabase.from("course_units").select("id,course_id,title,level_id").order("title"),
        supabase
          .from("facilitator_unit_assignments")
          .select(
            "id,facilitator_id,unit_id,active,can_manage_materials,can_manage_assignments,can_manage_cats,can_manage_results",
          ),
      ]);
      if (roles.error) throw roles.error;
      if (units.error) throw units.error;
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
          data?.error ?? error?.message ?? "The invitation service returned no confirmation.",
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
          <Button disabled={busy} onClick={() => void invite()}>
            {busy ? "Sending…" : "Send facilitator invite"}
          </Button>
        </div>
      </section>
      <section className="space-y-4 rounded-xl border bg-card p-5 shadow-card">
        <div>
          <h2 className="font-semibold text-brand">Assign units and enable teaching tools</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Facilitators only see students enrolled in the level of their assigned unit. Enable each
            activity separately.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1.5 text-sm font-medium">
            Facilitator
            <select
              className="h-10 rounded-md border bg-background px-3"
              value={selectedFacilitator}
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
          <label className="grid gap-1.5 text-sm font-medium">
            Course unit
            <select
              className="h-10 rounded-md border bg-background px-3"
              value={selectedUnit}
              onChange={(event) => setSelectedUnit(event.target.value)}
            >
              <option value="">Select unit</option>
              {directoryQuery.data.units.map((unit) => (
                <option key={unit.id} value={unit.id}>
                  {courseById.get(unit.course_id) ?? "Course"} · {unit.title}
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
          onClick={() => void saveAssignment()}
        >
          {busy ? "Saving…" : assignment ? "Update unit access" : "Assign unit"}
        </Button>
      </section>
      <section className="rounded-xl border bg-card p-5 shadow-card">
        <h2 className="font-semibold text-brand">Current unit assignments</h2>
        <ul className="mt-3 divide-y">
          {directoryQuery.data.assignments.map((row) => {
            const facilitator = directoryQuery.data.facilitators.find(
              (item) => item.id === row.facilitator_id,
            );
            const unit = directoryQuery.data.units.find((item) => item.id === row.unit_id);
            return (
              <li key={row.id} className="flex flex-wrap justify-between gap-2 py-3 text-sm">
                <span>
                  {facilitator?.full_name || facilitator?.email || "Facilitator"} ·{" "}
                  {courseById.get(unit?.course_id ?? "") ?? "Course"} · {unit?.title ?? "Unit"}
                </span>
                <span className={row.active ? "text-success" : "text-muted-foreground"}>
                  {row.active ? "Active" : "Disabled"}
                </span>
              </li>
            );
          })}
          {!directoryQuery.data.assignments.length && (
            <li className="py-3 text-sm text-muted-foreground">No units assigned yet.</li>
          )}
        </ul>
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
