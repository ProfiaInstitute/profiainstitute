import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearSessionActivity,
  SESSION_IDLE_TIMEOUT_MS,
  watchSessionInactivity,
} from "@/lib/session-security";

describe("session inactivity guard", () => {
  const storage = new Map<string, string>();

  beforeEach(() => {
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: {
        get length() {
          return storage.size;
        },
        clear: () => storage.clear(),
        getItem: (key: string) => storage.get(key) ?? null,
        key: (index: number) => [...storage.keys()][index] ?? null,
        removeItem: (key: string) => storage.delete(key),
        setItem: (key: string, value: string) => storage.set(key, String(value)),
      } satisfies Storage,
    });
  });

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-14T12:00:00.000Z"));
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
    window.localStorage.clear();
  });

  it("ends a session after five minutes without activity", async () => {
    const onIdle = vi.fn().mockResolvedValue(true);
    const stop = watchSessionInactivity("student-1", onIdle);

    await vi.advanceTimersByTimeAsync(SESSION_IDLE_TIMEOUT_MS - 1);
    expect(onIdle).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(onIdle).toHaveBeenCalledOnce();
    stop();
  });

  it("resets the timeout when the user interacts", async () => {
    const onIdle = vi.fn().mockResolvedValue(true);
    const stop = watchSessionInactivity("student-2", onIdle);

    await vi.advanceTimersByTimeAsync(SESSION_IDLE_TIMEOUT_MS - 1_000);
    window.dispatchEvent(new Event("keydown"));
    await vi.advanceTimersByTimeAsync(SESSION_IDLE_TIMEOUT_MS - 1);
    expect(onIdle).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(onIdle).toHaveBeenCalledOnce();
    stop();
  });

  it("honors activity synchronized from another browser tab", async () => {
    const onIdle = vi.fn().mockResolvedValue(true);
    const stop = watchSessionInactivity("student-3", onIdle);

    await vi.advanceTimersByTimeAsync(SESSION_IDLE_TIMEOUT_MS - 2_000);
    const sharedActivity = Date.now();
    window.localStorage.setItem("profia:last-activity:v1:student-3", String(sharedActivity));
    window.dispatchEvent(
      new StorageEvent("storage", {
        key: "profia:last-activity:v1:student-3",
        newValue: String(sharedActivity),
      }),
    );

    await vi.advanceTimersByTimeAsync(SESSION_IDLE_TIMEOUT_MS - 1);
    expect(onIdle).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(onIdle).toHaveBeenCalledOnce();
    stop();
  });

  it("clears the persisted activity marker on sign out", () => {
    const key = "profia:last-activity:v1:student-4";
    window.localStorage.setItem(key, "123");

    clearSessionActivity("student-4");

    expect(window.localStorage.getItem(key)).toBeNull();
  });

  it("retries sign-out if the first request fails", async () => {
    const onIdle = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    const stop = watchSessionInactivity("student-5", onIdle);

    await vi.advanceTimersByTimeAsync(SESSION_IDLE_TIMEOUT_MS);
    expect(onIdle).toHaveBeenCalledOnce();

    await vi.advanceTimersByTimeAsync(15_000);
    expect(onIdle).toHaveBeenCalledTimes(2);
    stop();
  });
});
