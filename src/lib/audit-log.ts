function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function label(value: string) {
  return value
    .replaceAll("_", " ")
    .replaceAll(".", " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

const ignoredFields = new Set(["id", "created_at", "updated_at"]);

export function summarizeAuditChange(action: string, entity: string | null, details: unknown) {
  const entityLabel =
    entity === "auth.users"
      ? "staff account"
      : entity === "user_roles"
        ? "staff role"
        : label(entity || "record").replace(/s$/, "");
  const recordDetails = asRecord(details);
  const before = asRecord(recordDetails?.["before"]);
  const after = asRecord(recordDetails?.["after"]);

  if (before && after) {
    const changedFields = [...new Set([...Object.keys(before), ...Object.keys(after)])]
      .filter((field) => !ignoredFields.has(field))
      .filter((field) => JSON.stringify(before[field]) !== JSON.stringify(after[field]))
      .map(label);
    return changedFields.length
      ? `Updated ${entityLabel}: ${changedFields.join(", ")}`
      : `Updated ${entityLabel}`;
  }

  if (action === "application_status_change") {
    const from = recordDetails?.["from"];
    const to = recordDetails?.["to"];
    return typeof from === "string" && typeof to === "string"
      ? `Application status changed: ${label(from)} → ${label(to)}`
      : "Application status changed";
  }

  if (action === "grant_role" || action === "revoke_role") {
    const role = recordDetails?.["role"];
    return typeof role === "string"
      ? `${action === "grant_role" ? "Granted" : "Revoked"} ${label(role)} role`
      : `${action === "grant_role" ? "Granted" : "Revoked"} a role`;
  }

  if (action === "invite_staff") {
    const role = recordDetails?.["role"];
    return typeof role === "string"
      ? `Invited staff member with ${label(role)} role`
      : "Invited a staff member";
  }

  if (action === "payhero_settings_updated") return "Updated PayHero settings";
  if (action === "bootstrap_super_admin") return "Initialized Super Admin access";

  const operation =
    action === "insert" || action.startsWith("create")
      ? "Created"
      : action === "delete" || action.startsWith("delete")
        ? "Deleted"
        : action.startsWith("staff_suspend")
          ? "Suspended"
          : action.startsWith("staff_unsuspend")
            ? "Reactivated"
            : action.startsWith("update") || action === "staff_update"
              ? "Updated"
              : label(action);

  if (action.startsWith("staff_suspend")) return "Suspended staff account";
  if (action.startsWith("staff_unsuspend")) return "Reactivated staff account";
  return `${operation} ${entityLabel}`;
}

export function formatAuditTime(value: string) {
  return new Intl.DateTimeFormat("en-KE", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Nairobi",
  }).format(new Date(value));
}
