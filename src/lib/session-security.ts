export const SESSION_IDLE_TIMEOUT_MS = 5 * 60_000;

const STORAGE_KEY_PREFIX = "profia:last-activity:v1:";
const STORAGE_SYNC_INTERVAL_MS = 5_000;
const ACTIVITY_EVENT_THROTTLE_MS = 1_000;
const SIGN_OUT_RETRY_INTERVAL_MS = 15_000;
const MAX_TIMEOUT_DELAY_MS = 2_147_000_000;

function activityStorageKey(userId: string) {
  return `${STORAGE_KEY_PREFIX}${userId}`;
}

function readLastActivity(key: string) {
  try {
    const stored = window.localStorage.getItem(key);
    if (stored === null) return null;
    const timestamp = Number(stored);
    return Number.isFinite(timestamp) && timestamp > 0 ? timestamp : null;
  } catch (error) {
    console.error("Could not read the session activity timestamp:", error);
    return null;
  }
}

function writeLastActivity(key: string, timestamp: number) {
  try {
    window.localStorage.setItem(key, String(timestamp));
  } catch (error) {
    console.error("Could not save the session activity timestamp:", error);
  }
}

export function clearSessionActivity(userId: string) {
  try {
    window.localStorage.removeItem(activityStorageKey(userId));
  } catch (error) {
    console.error("Could not clear the session activity timestamp:", error);
  }
}

export function watchSessionInactivity(
  userId: string,
  onIdle: () => Promise<boolean>,
  timeoutMs = SESSION_IDLE_TIMEOUT_MS,
) {
  const key = activityStorageKey(userId);
  let lastActivity = readLastActivity(key) ?? Date.now();
  let lastPersisted = 0;
  let lastHandledActivity = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopping = false;
  let idleExpired = false;
  let signingOut = false;

  const schedule = (delay: number) => {
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(() => void checkIdle(), Math.min(Math.max(0, delay), MAX_TIMEOUT_DELAY_MS));
  };

  const checkIdle = async () => {
    const sharedActivity = readLastActivity(key);
    if (sharedActivity && sharedActivity > lastActivity) lastActivity = sharedActivity;

    const remaining = lastActivity + timeoutMs - Date.now();
    if (remaining > 0) {
      schedule(remaining);
      return;
    }
    if (signingOut || stopping) return;

    idleExpired = true;
    signingOut = true;
    try {
      if (await onIdle()) {
        stopping = true;
        return;
      }
    } catch (error) {
      console.error("Could not end the inactive session:", error);
    } finally {
      signingOut = false;
    }

    if (!stopping) schedule(SIGN_OUT_RETRY_INTERVAL_MS);
  };

  const recordActivity = () => {
    if (stopping || idleExpired) return;
    const now = Date.now();
    if (now - lastHandledActivity < ACTIVITY_EVENT_THROTTLE_MS) return;
    lastHandledActivity = now;
    lastActivity = now;
    if (now - lastPersisted >= STORAGE_SYNC_INTERVAL_MS) {
      writeLastActivity(key, now);
      lastPersisted = now;
    }
    schedule(timeoutMs);
  };

  const onStorage = (event: StorageEvent) => {
    if (event.key !== key || !event.newValue) return;
    const sharedActivity = Number(event.newValue);
    if (!Number.isFinite(sharedActivity) || sharedActivity <= lastActivity) return;
    lastActivity = sharedActivity;
    schedule(Math.max(0, lastActivity + timeoutMs - Date.now()));
  };

  const onVisibilityChange = () => {
    if (document.visibilityState === "visible") void checkIdle();
  };

  if (readLastActivity(key) === null) {
    writeLastActivity(key, lastActivity);
    lastPersisted = Date.now();
  }
  window.addEventListener("pointerdown", recordActivity, { passive: true });
  window.addEventListener("pointermove", recordActivity, { passive: true });
  window.addEventListener("keydown", recordActivity);
  window.addEventListener("touchstart", recordActivity, { passive: true });
  window.addEventListener("wheel", recordActivity, { passive: true });
  window.addEventListener("storage", onStorage);
  document.addEventListener("visibilitychange", onVisibilityChange);
  schedule(Math.max(0, lastActivity + timeoutMs - Date.now()));

  return () => {
    stopping = true;
    if (timer !== undefined) clearTimeout(timer);
    window.removeEventListener("pointerdown", recordActivity);
    window.removeEventListener("pointermove", recordActivity);
    window.removeEventListener("keydown", recordActivity);
    window.removeEventListener("touchstart", recordActivity);
    window.removeEventListener("wheel", recordActivity);
    window.removeEventListener("storage", onStorage);
    document.removeEventListener("visibilitychange", onVisibilityChange);
  };
}
