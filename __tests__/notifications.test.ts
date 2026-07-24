// Pins the reminder fire-date math: a reminder must land INSPECTION_LEAD_DAYS
// before the deadline, collapse to "soon" inside the lead window, and refuse to
// schedule for a past/invalid date.

import { reminderFireDate, INSPECTION_LEAD_DAYS } from "../lib/notifications";

const NOW = new Date("2026-07-23T12:00:00Z");
const DAY = 24 * 60 * 60 * 1000;

describe("reminderFireDate", () => {
  it("fires INSPECTION_LEAD_DAYS before a far-future deadline", () => {
    const due = new Date(NOW.getTime() + 100 * DAY);
    const fire = reminderFireDate(due.toISOString(), NOW);
    expect(fire).not.toBeNull();
    const expected = new Date(due.getTime() - INSPECTION_LEAD_DAYS * DAY);
    expect(fire!.getTime()).toBe(expected.getTime());
  });

  it("fires shortly from now when the deadline is inside the lead window", () => {
    const due = new Date(NOW.getTime() + 10 * DAY); // < 30-day lead
    const fire = reminderFireDate(due.toISOString(), NOW);
    expect(fire).not.toBeNull();
    expect(fire!.getTime()).toBeGreaterThan(NOW.getTime());
    expect(fire!.getTime()).toBeLessThan(NOW.getTime() + 60 * 1000);
  });

  it("returns null for a past deadline", () => {
    const due = new Date(NOW.getTime() - DAY);
    expect(reminderFireDate(due.toISOString(), NOW)).toBeNull();
  });

  it("returns null for an unparseable date", () => {
    expect(reminderFireDate("not-a-date", NOW)).toBeNull();
  });
});
