// ── Inspection reminder notifications ─────────────────────────────────────────
// Schedules a local notification ahead of a motorcycle's next inspection
// deadline (the retention spine of the Season feature). Mirrors the resilient
// require-guard pattern used elsewhere (storage.ts, triplogger) so the module
// being unavailable never crashes a caller.
//
// The channel is HIGH importance on purpose — this is the year-round hook that
// keeps the app installed between the twice-a-year checklist spikes.

import { Platform } from "react-native";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const Notifications: typeof import("expo-notifications") | null = (() => { try { return require("expo-notifications"); } catch { return null; } })();

export const INSPECTION_CHANNEL_ID = "inspection";

/** How many days before the deadline the reminder fires. */
export const INSPECTION_LEAD_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

/** True when the native notifications module is present on this platform. */
export function notificationsAvailable(): boolean {
  return Notifications !== null;
}

/** Create the HIGH-importance inspection channel (Android). Never throws. */
export async function ensureInspectionChannel(): Promise<void> {
  if (Platform.OS !== "android" || !Notifications) return;
  try {
    await Notifications.setNotificationChannelAsync(INSPECTION_CHANNEL_ID, {
      name: "Inspection reminders",
      description: "Reminders before your motorcycle inspection is due",
      importance: Notifications.AndroidImportance.HIGH,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    });
  } catch {
    // Keep callers resilient if channel setup fails.
  }
}

/** Ask for notification permission, requesting it once if not yet decided. */
export async function requestNotificationPermission(): Promise<boolean> {
  if (!Notifications) return false;
  try {
    let perm = await Notifications.getPermissionsAsync();
    if (!perm.granted && perm.status !== "granted") {
      perm = await Notifications.requestPermissionsAsync();
    }
    return perm.granted || perm.status === "granted";
  } catch {
    return false;
  }
}

/**
 * When the reminder should fire for a given due date: INSPECTION_LEAD_DAYS
 * before the deadline. If that lead point is already past (deadline is within
 * the lead window), fire shortly from now so the rider still gets a heads-up.
 * Returns null when the due date is invalid or already in the past.
 */
export function reminderFireDate(dueDateISO: string, now: Date = new Date()): Date | null {
  const due = new Date(dueDateISO);
  if (isNaN(due.getTime()) || due.getTime() <= now.getTime()) return null;
  const lead = new Date(due.getTime() - INSPECTION_LEAD_DAYS * DAY_MS);
  if (lead.getTime() <= now.getTime()) return new Date(now.getTime() + 10_000);
  return lead;
}

export interface ScheduleReminderOpts {
  dueDateISO: string;
  title: string;
  body: string;
  /** An existing reminder id to cancel first (reschedule). */
  existingId?: string;
}

/**
 * Cancel any existing reminder, then schedule a new one for
 * INSPECTION_LEAD_DAYS before the due date. Returns the new notification id, or
 * null when it can't be scheduled (module unavailable, or date too close/past).
 */
export async function scheduleInspectionReminder(
  opts: ScheduleReminderOpts
): Promise<string | null> {
  if (!Notifications) return null;
  const fire = reminderFireDate(opts.dueDateISO);
  if (!fire) return null;
  try {
    if (opts.existingId) {
      await Notifications.cancelScheduledNotificationAsync(opts.existingId).catch(() => {});
    }
    await ensureInspectionChannel();
    return await Notifications.scheduleNotificationAsync({
      content: { title: opts.title, body: opts.body },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: fire,
        channelId: INSPECTION_CHANNEL_ID,
      },
    });
  } catch {
    return null;
  }
}

/** Cancel a scheduled reminder by id. Never throws. */
export async function cancelInspectionReminder(id: string | undefined): Promise<void> {
  if (!Notifications || !id) return;
  try {
    await Notifications.cancelScheduledNotificationAsync(id);
  } catch {
    // no-op
  }
}
