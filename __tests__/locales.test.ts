// Guards against translation drift: every locale must expose exactly the same
// set of keys as en.json (the source of truth). A missing/extra key fails CI.

import en from "../lib/locales/en.json";
import es from "../lib/locales/es.json";
import de from "../lib/locales/de.json";
import fr from "../lib/locales/fr.json";
import is from "../lib/locales/is.json";
import no from "../lib/locales/no.json";
import sv from "../lib/locales/sv.json";
import da from "../lib/locales/da.json";
import nl from "../lib/locales/nl.json";

type Json = Record<string, unknown>;

/** Flatten a nested object into a sorted list of dotted key paths. */
function flattenKeys(obj: Json, prefix = ""): string[] {
  const keys: string[] = [];
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      keys.push(...flattenKeys(value as Json, path));
    } else {
      keys.push(path);
    }
  }
  return keys.sort();
}

const locales: Record<string, Json> = { es, de, fr, is, no, sv, da, nl };
const enKeys = flattenKeys(en as Json);

describe("locale key parity with en.json", () => {
  it.each(Object.keys(locales))("%s has exactly the same keys as en", (name) => {
    const localeKeys = flattenKeys(locales[name]);
    const missing = enKeys.filter((k) => !localeKeys.includes(k));
    const extra = localeKeys.filter((k) => !enKeys.includes(k));
    expect({ missing, extra }).toEqual({ missing: [], extra: [] });
  });
});
