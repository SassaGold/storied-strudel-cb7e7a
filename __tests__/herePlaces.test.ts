// Tests for lib/herePlaces.ts — pure utility functions and key-guard behaviour.

import {
  hereItemPrimaryCategory,
  hereItemPhone,
  hereItemWebsite,
  hereItemEmail,
  hereItemOpeningHours,
  fetchHereDiscover,
  type HerePlaceItem,
} from "../lib/herePlaces";

// ── hereItemPrimaryCategory ───────────────────────────────────────────────────

describe("hereItemPrimaryCategory", () => {
  it("returns the first category id when present", () => {
    const item: HerePlaceItem = { categories: [{ id: "700-7600-0116", name: "Restaurant" }] };
    expect(hereItemPrimaryCategory(item)).toBe("700-7600-0116");
  });

  it("falls back to name when id is absent", () => {
    const item: HerePlaceItem = { categories: [{ name: "Hotel" }] };
    expect(hereItemPrimaryCategory(item)).toBe("Hotel");
  });

  it("returns undefined when categories is empty", () => {
    expect(hereItemPrimaryCategory({ categories: [] })).toBeUndefined();
  });

  it("returns undefined when categories is missing", () => {
    expect(hereItemPrimaryCategory({})).toBeUndefined();
  });
});

// ── hereItemPhone ─────────────────────────────────────────────────────────────

describe("hereItemPhone", () => {
  it("returns the first phone value", () => {
    const item: HerePlaceItem = { contacts: [{ phone: [{ value: "+1-555-0100" }] }] };
    expect(hereItemPhone(item)).toBe("+1-555-0100");
  });

  it("returns undefined when no phone is present", () => {
    expect(hereItemPhone({ contacts: [{}] })).toBeUndefined();
    expect(hereItemPhone({})).toBeUndefined();
  });
});

// ── hereItemWebsite ───────────────────────────────────────────────────────────

describe("hereItemWebsite", () => {
  it("returns the first www value", () => {
    const item: HerePlaceItem = { contacts: [{ www: [{ value: "https://example.com" }] }] };
    expect(hereItemWebsite(item)).toBe("https://example.com");
  });

  it("returns undefined when no website is present", () => {
    expect(hereItemWebsite({})).toBeUndefined();
  });
});

// ── hereItemEmail ─────────────────────────────────────────────────────────────

describe("hereItemEmail", () => {
  it("returns the first email value", () => {
    const item: HerePlaceItem = { contacts: [{ email: [{ value: "info@example.com" }] }] };
    expect(hereItemEmail(item)).toBe("info@example.com");
  });

  it("returns undefined when no email is present", () => {
    expect(hereItemEmail({})).toBeUndefined();
  });
});

// ── hereItemOpeningHours ──────────────────────────────────────────────────────

describe("hereItemOpeningHours", () => {
  it("joins multiple text lines with ' · '", () => {
    const item: HerePlaceItem = { openingHours: [{ text: ["Mon-Fri 9-17", "Sat 10-14"] }] };
    expect(hereItemOpeningHours(item)).toBe("Mon-Fri 9-17 · Sat 10-14");
  });

  it("returns a single line without separator", () => {
    const item: HerePlaceItem = { openingHours: [{ text: ["24/7"] }] };
    expect(hereItemOpeningHours(item)).toBe("24/7");
  });

  it("returns undefined when openingHours is empty", () => {
    expect(hereItemOpeningHours({ openingHours: [] })).toBeUndefined();
    expect(hereItemOpeningHours({})).toBeUndefined();
  });
});

// ── fetchHereDiscover — missing API key ───────────────────────────────────────

describe("fetchHereDiscover", () => {
  const originalEnv = process.env.EXPO_PUBLIC_HERE_API_KEY;
  const originalFetch = global.fetch;

  afterEach(() => {
    // Restore the original value after each test.
    if (originalEnv === undefined) {
      delete process.env.EXPO_PUBLIC_HERE_API_KEY;
    } else {
      process.env.EXPO_PUBLIC_HERE_API_KEY = originalEnv;
    }
    global.fetch = originalFetch;
  });

  it("throws 'Missing HERE API key' when EXPO_PUBLIC_HERE_API_KEY is not set", async () => {
    delete process.env.EXPO_PUBLIC_HERE_API_KEY;
    await expect(
      fetchHereDiscover("restaurant", 0, 0, 5000, 10, 5000)
    ).rejects.toThrow("Missing HERE API key");
  });

  it("throws 'Missing HERE API key' when EXPO_PUBLIC_HERE_API_KEY is an empty string", async () => {
    process.env.EXPO_PUBLIC_HERE_API_KEY = "";
    await expect(
      fetchHereDiscover("restaurant", 0, 0, 5000, 10, 5000)
    ).rejects.toThrow("Missing HERE API key");
  });

  it("throws 'Missing HERE API key' when EXPO_PUBLIC_HERE_API_KEY is whitespace only", async () => {
    process.env.EXPO_PUBLIC_HERE_API_KEY = "   ";
    await expect(
      fetchHereDiscover("restaurant", 0, 0, 5000, 10, 5000)
    ).rejects.toThrow("Missing HERE API key");
  });

  it("surfaces invalid key failures with HERE 401 classification", async () => {
    process.env.EXPO_PUBLIC_HERE_API_KEY = "fake-key";
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: jest.fn(),
    } as Response);

    await expect(
      fetchHereDiscover("restaurant", 0, 0, 5000, 10, 5000)
    ).rejects.toThrow("HERE Places 401 invalid API key");
  });

  it("surfaces restricted key failures with HERE 403 classification", async () => {
    process.env.EXPO_PUBLIC_HERE_API_KEY = "fake-key";
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 403,
      json: jest.fn(),
    } as Response);

    await expect(
      fetchHereDiscover("restaurant", 0, 0, 5000, 10, 5000)
    ).rejects.toThrow("HERE Places 403 Discover API blocked for this key");
  });
});
