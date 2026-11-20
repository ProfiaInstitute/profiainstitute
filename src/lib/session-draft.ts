const SESSION_DRAFT_PREFIX = "profia:session-draft:v1";

export function createSessionDraftKey(userId: string, name: string, scope?: string) {
  return [SESSION_DRAFT_PREFIX, userId, name, scope].filter(Boolean).join(":");
}

export function readSessionDraft<T>(
  key: string,
  isValid: (value: unknown) => value is T,
): T | null {
  if (typeof window === "undefined") return null;
  try {
    const stored = localStorage.getItem(key) ?? sessionStorage.getItem(key);
    if (!stored) return null;
    const parsed: unknown = JSON.parse(stored);
    return isValid(parsed) ? parsed : null;
  } catch (error) {
    console.error("Could not restore a saved form draft.", error);
    return null;
  }
}

export function writeSessionDraft(key: string, value: unknown) {
  if (typeof window === "undefined") return false;
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (error) {
    console.error("Could not save the form draft in this browser session.", error);
    return false;
  }
}

export function clearSessionDraft(key: string) {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(key);
    sessionStorage.removeItem(key);
  } catch (error) {
    console.error("Could not clear the saved form draft.", error);
  }
}
