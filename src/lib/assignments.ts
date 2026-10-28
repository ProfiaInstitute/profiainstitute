export function isAssignmentOpenForSubmission(dueDate: string | null, now = Date.now()) {
  if (!dueDate) return false;
  const deadline = Date.parse(dueDate);
  return Number.isFinite(deadline) && deadline > now;
}

export function submissionFilePaths(submission: {
  file_path?: string | null;
  file_paths?: string[] | null;
}): string[] {
  const paths = Array.isArray(submission.file_paths) ? submission.file_paths : [];
  return paths.length ? paths : submission.file_path ? [submission.file_path] : [];
}
