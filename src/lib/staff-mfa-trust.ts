export const STAFF_MFA_TRUST_DAYS = 45;
export const STAFF_MFA_TRUST_MS = STAFF_MFA_TRUST_DAYS * 24 * 60 * 60_000;

function trustedMfaStorageKey(userId: string) {
  return `profia:staff-mfa-trusted:v1:${userId}`;
}

export function readTrustedMfa(userId: string) {
  try {
    const verifiedAt = Number(window.localStorage.getItem(trustedMfaStorageKey(userId)));
    return Number.isFinite(verifiedAt) && Date.now() - verifiedAt < STAFF_MFA_TRUST_MS;
  } catch {
    return false;
  }
}

export function markMfaTrusted(userId: string) {
  try {
    window.localStorage.setItem(trustedMfaStorageKey(userId), String(Date.now()));
  } catch (error) {
    console.error("Could not save trusted staff MFA verification:", error);
  }
}

export function clearTrustedMfa(userId: string) {
  try {
    window.localStorage.removeItem(trustedMfaStorageKey(userId));
  } catch (error) {
    console.error("Could not clear trusted staff MFA verification:", error);
  }
}
