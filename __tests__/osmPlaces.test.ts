// Tests for lib/osmPlaces.ts — pure utility functions and key-guard behaviour.

import {
  fetchOsmPlaces,
  osmItemEmail,
  osmItemFuelTypes,
  osmItemIsFreeParking,
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

// ── osmItemFuelTypes ──────────────────────────────────────────────────────────

describe("osmItemFuelTypes", () => {
  it("extracts available fuel types with friendly labels", () => {
    const item: OsmPlaceItem = {
      tags: {
        amenity: "fuel",
        "fuel:diesel": "yes",
        "fuel:octane_95": "yes",
        "fuel:octane_98": "yes",
        "fuel:e85": "yes",
        "fuel:lpg": "yes",
      },
    };
    expect(osmItemFuelTypes(item)).toEqual(["Diesel", "95", "98", "E85", "LPG"]);
  });

  it("ignores fuel tags that are not available", () => {
    const item: OsmPlaceItem = {
      tags: { "fuel:diesel": "yes", "fuel:lpg": "no" },
    };
    expect(osmItemFuelTypes(item)).toEqual(["Diesel"]);
  });

  it("title-cases unknown fuel suffixes", () => {
    const item: OsmPlaceItem = { tags: { "fuel:some_new_fuel": "yes" } };
    expect(osmItemFuelTypes(item)).toEqual(["Some New Fuel"]);
  });

  it("returns undefined when there are no fuel tags", () => {
    expect(osmItemFuelTypes({ tags: { amenity: "fuel" } })).toBeUndefined();
    expect(osmItemFuelTypes({})).toBeUndefined();
  });
});

// ── osmItemIsFreeParking ──────────────────────────────────────────────────────

describe("osmItemIsFreeParking", () => {
  it("is true when fee=no", () => {
    expect(osmItemIsFreeParking({ tags: { amenity: "parking", fee: "no" } })).toBe(true);
  });

  it("is false when fee=yes or fee is absent", () => {
    expect(osmItemIsFreeParking({ tags: { amenity: "parking", fee: "yes" } })).toBe(false);
    expect(osmItemIsFreeParking({ tags: { amenity: "parking" } })).toBe(false);
    expect(osmItemIsFreeParking({})).toBe(false);
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

  it("queries amenity, tourism, shop, historic and leisure keys", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: async () => ({ elements: [] }),
    }) as unknown as typeof fetch;

    await fetchOsmPlaces("car_repair", 51.5, 0.0, 5000, 50, 10000);

    const capturedBody = (global.fetch as jest.Mock).mock.calls[0][1].body as string;
    const query = decodeURIComponent(capturedBody.replace(/^data=/, ""));

    for (const key of ["amenity", "tourism", "shop", "historic", "leisure"]) {
      expect(query).toContain(`["${key}"~"^(car_repair)$"]`);
    }
  });

  it("matches key=value tokens against that exact key only", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: async () => ({ elements: [] }),
    }) as unknown as typeof fetch;

    await fetchOsmPlaces("club=motorcycle|highway=raceway", 51.5, 0.0, 5000, 50, 10000);

    const capturedBody = (global.fetch as jest.Mock).mock.calls[0][1].body as string;
    const query = decodeURIComponent(capturedBody.replace(/^data=/, ""));

    expect(query).toContain(`["club"~"^(motorcycle)$"]`);
    expect(query).toContain(`["highway"~"^(raceway)$"]`);
    // key=value tokens must NOT be matched against the generic keys
    expect(query).not.toContain(`["amenity"~"^(motorcycle`);
  });

  it("escapes regex metacharacters in values and rejects unsafe keys", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: async () => ({ elements: [] }),
    }) as unknown as typeof fetch;

    await fetchOsmPlaces('fast.food|bad"key=x', 51.5, 0.0, 5000, 50, 10000);

    const capturedBody = (global.fetch as jest.Mock).mock.calls[0][1].body as string;
    const query = decodeURIComponent(capturedBody.replace(/^data=/, ""));

    // Dot escaped for the Overpass regex (double backslash survives QL unescaping)
    expect(query).toContain("fast\\\\.food");
    // A key containing a quote must not reach the query
    expect(query).not.toContain('bad"key');
  });

  it("maps addr:* namespace tags into the item address (bare keys don't exist in OSM)", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: async () => ({
        elements: [
          {
            type: "node",
            id: 42,
            lat: 51.5,
            lon: 0.0,
            tags: {
              name: "Café Test",
              amenity: "cafe",
              "addr:street": "Karl Johans gate",
              "addr:housenumber": "12B",
              "addr:city": "Oslo",
              "addr:country": "NO",
            },
          },
        ],
      }),
    }) as unknown as typeof fetch;

    const items = await fetchOsmPlaces("cafe", 51.5, 0.0, 5000, 50, 10000);
    expect(items).toHaveLength(1);
    expect(items[0].address).toEqual({
      label: "Karl Johans gate 12B",
      street: "Karl Johans gate",
      houseNumber: "12B",
      city: "Oslo",
      countryName: "NO",
    });
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
