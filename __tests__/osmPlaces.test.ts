// Tests for lib/osmPlaces.ts — pure utility functions and key-guard behaviour.

import {
  fetchOsmPlaces,
  osmItemEmail,
  osmItemOpeningHours,
  osmItemPhone,
  osmItemPrimaryCategory,
  osmItemWebsite,
  type OsmPlaceItem,
} from "../lib/osmPlaces";

// ── osmItemPrimaryCategory ────────────────────────────────────────────────────

describe("osmItemPrimaryCategory", () => {
  it("returns the first category id when present", () => {
    const item: OsmPlaceItem = { categories: [{ id: "700-7600-0116", name: "Restaurant" }] };
    expect(osmItemPrimaryCategory(item)).toBe("700-7600-0116");
  });

  it("falls back to name when id is absent", () => {
    const item: OsmPlaceItem = { categories: [{ name: "Hotel" }] };
    expect(osmItemPrimaryCategory(item)).toBe("Hotel");
  });

  it("returns undefined when categories is empty", () => {
    expect(osmItemPrimaryCategory({ categories: [] })).toBeUndefined();
  });

  it("returns undefined when categories is missing", () => {
    expect(osmItemPrimaryCategory({})).toBeUndefined();
  });
});

// ── osmItemPhone ──────────────────────────────────────────────────────────────

describe("osmItemPhone", () => {
  it("returns the first phone value", () => {
    const item: OsmPlaceItem = { contacts: [{ phone: [{ value: "+1-555-0100" }] }] };
    expect(osmItemPhone(item)).toBe("+1-555-0100");
  });

  it("returns undefined when no phone is present", () => {
    expect(osmItemPhone({ contacts: [{}] })).toBeUndefined();
    expect(osmItemPhone({})).toBeUndefined();
  });
});

// ── osmItemWebsite ────────────────────────────────────────────────────────────

describe("osmItemWebsite", () => {
  it("returns the first www value", () => {
    const item: OsmPlaceItem = { contacts: [{ www: [{ value: "https://example.com" }] }] };
    expect(osmItemWebsite(item)).toBe("https://example.com");
  });

  it("returns undefined when no website is present", () => {
    expect(osmItemWebsite({})).toBeUndefined();
  });
});

// ── osmItemEmail ──────────────────────────────────────────────────────────────

describe("osmItemEmail", () => {
  it("returns the first email value", () => {
    const item: OsmPlaceItem = { contacts: [{ email: [{ value: "info@example.com" }] }] };
    expect(osmItemEmail(item)).toBe("info@example.com");
  });

  it("returns undefined when no email is present", () => {
    expect(osmItemEmail({})).toBeUndefined();
  });
});

// ── osmItemOpeningHours ───────────────────────────────────────────────────────

describe("osmItemOpeningHours", () => {
  it("joins multiple text lines with ' · '", () => {
    const item: OsmPlaceItem = { openingHours: [{ text: ["Mon-Fri 9-17", "Sat 10-14"] }] };
    expect(osmItemOpeningHours(item)).toBe("Mon-Fri 9-17 · Sat 10-14");
  });

  it("returns a single line without separator", () => {
    const item: OsmPlaceItem = { openingHours: [{ text: ["24/7"] }] };
    expect(osmItemOpeningHours(item)).toBe("24/7");
  });

  it("returns undefined when openingHours is empty", () => {
    expect(osmItemOpeningHours({ openingHours: [] })).toBeUndefined();
    expect(osmItemOpeningHours({})).toBeUndefined();
  });
});

// ── fetchOsmPlaces — Overpass query syntax ────────────────────────────────────

describe("fetchOsmPlaces query syntax", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("generates a valid 'out center N;' statement without the word 'limit'", async () => {
    let capturedBody = "";
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: async () => ({ elements: [] }),
    }) as unknown as typeof fetch;

    await fetchOsmPlaces("restaurant", 51.5, 0.0, 5000, 50, 10000);

    capturedBody = (global.fetch as jest.Mock).mock.calls[0][1].body as string;
    const query = decodeURIComponent(capturedBody.replace(/^data=/, ""));

    // Must use "out center 50;" — the number directly, no "limit" keyword
    expect(query).toMatch(/out center 50;/);
    expect(query).not.toMatch(/out center limit/);
  });

  it("generates 'out center;' with no number when limit is 0", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: async () => ({ elements: [] }),
    }) as unknown as typeof fetch;

    await fetchOsmPlaces("restaurant", 51.5, 0.0, 5000, 0, 10000);

    const capturedBody = (global.fetch as jest.Mock).mock.calls[0][1].body as string;
    const query = decodeURIComponent(capturedBody.replace(/^data=/, ""));

    expect(query).toMatch(/out center;/);
    expect(query).not.toMatch(/out center limit/);
  });
});
