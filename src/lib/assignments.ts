export function isAssignmentOpenForSubmission(dueDate: string | null, now = Date.now()) {
  if (!dueDate) return false;
  const deadline = Date.parse(dueDate);
  return Number.isFinite(deadline) && deadline > now;
}
