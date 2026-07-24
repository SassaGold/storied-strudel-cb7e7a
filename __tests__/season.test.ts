// Covers the multi-bike garage model (add/select/remove/update, migration) and
// the weather-aware nudge logic.

import {
  addBike,
  checklistProgress,
  defaultSeasonState,
  parseSeasonState,
  removeBike,
  selectBike,
  selectedBike,
  toggleChecklistItem,
  updateBike,
  updateInspection,
  weatherSeasonNudge,
  type SeasonState,
} from "../lib/season";

describe("weatherSeasonNudge", () => {
  const cold = [{ minTempC: -3, maxTempC: 2 }];
  const warm = [{ minTempC: 8, maxTempC: 15 }];

  it("returns null without forecast data", () => {
    expect(weatherSeasonNudge("riding", null)).toBeNull();
    expect(weatherSeasonNudge("riding", [])).toBeNull();
  });

  it("warns about frost while the bike is still out (riding/winterize)", () => {
    expect(weatherSeasonNudge("riding", cold)).toEqual({ key: "frostSoon", tempC: -3 });
    expect(weatherSeasonNudge("winterize", cold)).toEqual({ key: "frostSoon", tempC: -3 });
  });

  it("does NOT warn about frost once the bike is away (offSeason/springPrep)", () => {
    expect(weatherSeasonNudge("offSeason", cold)).toBeNull();
    // springPrep + cold → no spring-warm signal either
    expect(weatherSeasonNudge("springPrep", cold)).toBeNull();
  });

  it("nudges spring prep on a warm spell", () => {
    expect(weatherSeasonNudge("springPrep", warm)).toEqual({ key: "springWarming", tempC: 15 });
  });

  it("stays quiet when there's no strong signal", () => {
    expect(weatherSeasonNudge("riding", warm)).toBeNull();
  });
});

describe("garage model", () => {
  it("defaults to one selected bike", () => {
    const s = defaultSeasonState();
    expect(s.bikes).toHaveLength(1);
    expect(s.selectedBikeId).toBe(s.bikes[0].id);
    expect(selectedBike(s)?.id).toBe(s.bikes[0].id);
  });

  it("adds a bike and selects it", () => {
    const s0 = defaultSeasonState();
    const s1 = addBike(s0);
    expect(s1.bikes).toHaveLength(2);
    expect(s1.selectedBikeId).toBe(s1.bikes[1].id);
  });

  it("selects a specific bike", () => {
    const s = addBike(defaultSeasonState());
    const firstId = s.bikes[0].id;
    expect(selectBike(s, firstId).selectedBikeId).toBe(firstId);
  });

  it("removes the selected bike and reselects a remaining one", () => {
    const s = addBike(defaultSeasonState()); // 2 bikes, 2nd selected
    const removedId = s.selectedBikeId!;
    const after = removeBike(s, removedId);
    expect(after.bikes).toHaveLength(1);
    expect(after.selectedBikeId).toBe(after.bikes[0].id);
    expect(after.bikes.find((b) => b.id === removedId)).toBeUndefined();
  });

  it("removing the last bike leaves an empty garage", () => {
    const s = defaultSeasonState();
    const after = removeBike(s, s.bikes[0].id);
    expect(after.bikes).toHaveLength(0);
    expect(after.selectedBikeId).toBeNull();
    expect(selectedBike(after)).toBeNull();
  });

  it("updates bike info and inspection on the right bike only", () => {
    const s = addBike(defaultSeasonState());
    const [a, b] = s.bikes;
    let next = updateBike(s, a.id, { name: "MT-07", country: "SE" });
    next = updateInspection(next, a.id, { reminderId: "r1" });
    const na = next.bikes.find((x) => x.id === a.id)!;
    const nb = next.bikes.find((x) => x.id === b.id)!;
    expect(na.bike.name).toBe("MT-07");
    expect(na.bike.country).toBe("SE");
    expect(na.inspection.reminderId).toBe("r1");
    expect(nb.bike.name).toBe(""); // untouched
    expect(nb.inspection.reminderId).toBeUndefined();
  });

  it("toggles a checklist item on the right bike and tracks progress", () => {
    const s = addBike(defaultSeasonState());
    const id = s.bikes[0].id;
    const next = toggleChecklistItem(s, id, "winter", "fuelStabilizer");
    const entry = next.bikes.find((b) => b.id === id)!;
    expect(entry.checklists.winter.fuelStabilizer.done).toBe(true);
    expect(entry.checklists.winter.fuelStabilizer.completedAt).toBeTruthy();
    expect(checklistProgress(entry, "winter")).toEqual({ done: 1, total: 7 });
    // other bike unaffected
    const other = next.bikes.find((b) => b.id !== id)!;
    expect(checklistProgress(other, "winter")).toEqual({ done: 0, total: 7 });
  });
});

describe("parseSeasonState migration", () => {
  it("returns a default for empty/corrupt input", () => {
    expect(parseSeasonState(null).bikes).toHaveLength(1);
    expect(parseSeasonState("not json").bikes).toHaveLength(1);
  });

  it("migrates the legacy single-bike shape into a garage", () => {
    const legacy = JSON.stringify({
      bike: { name: "Old Bike", country: "SE", firstRegistration: "2020-06-15" },
      checklists: { winter: { cover: { done: true, completedAt: "2026-01-01T00:00:00Z" } }, spring: {} },
      inspection: { source: "entered", reminderId: "keep-me" },
    });
    const s = parseSeasonState(legacy);
    expect(s.bikes).toHaveLength(1);
    const e = s.bikes[0];
    expect(s.selectedBikeId).toBe(e.id);
    // Registration is normalized to the dd-mm-yyyy the UI uses everywhere.
    expect(e.bike).toEqual({ name: "Old Bike", country: "SE", firstRegistration: "15-06-2020" });
    expect(e.checklists.winter.cover.done).toBe(true);
    expect(e.inspection.reminderId).toBe("keep-me");
  });

  it("loads the current multi-bike shape and repairs a dangling selection", () => {
    const state: SeasonState = addBike(defaultSeasonState());
    // Point selectedBikeId at a non-existent bike; parse should fall back to first.
    const broken = JSON.stringify({ ...state, selectedBikeId: "ghost" });
    const s = parseSeasonState(broken);
    expect(s.bikes).toHaveLength(2);
    expect(s.selectedBikeId).toBe(s.bikes[0].id);
  });
});
