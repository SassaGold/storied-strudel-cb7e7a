// ── components/RoadConditionsCard.tsx ────────────────────────────────────────
// Road construction / conditions card for the RIDER HQ screen.

import { memo, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import type * as Location from "expo-location";
import { type RoadAlert, humanizeConstructionType } from "../lib/roads";
import { fmtDistShort, type UnitSystem } from "../lib/settings";
import { KM_TO_MILES } from "../lib/config";

import { COLORS } from "../lib/theme";
const Haptics: typeof import("expo-haptics") | null = (() => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("expo-haptics");
  } catch {
    return null;
  }
})();

type Props = {
  loading: boolean;
  roadAlerts: RoadAlert[];
  searchRadiusKm: number;
  unitSystem: UnitSystem;
  location?: Location.LocationObject | null;
};

/** Rows shown before the list collapses behind a "show all" toggle. */
const MAX_COLLAPSED_ALERTS = 5;

/** Renders a card listing nearby road-construction alerts sourced from Overpass. */
// memo: HQ screen re-renders on unrelated state; props only change on refresh.
export const RoadConditionsCard = memo(function RoadConditionsCard({
  loading,
  roadAlerts,
  searchRadiusKm,
  unitSystem,
  location,
}: Props) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);

  // Overpass often returns one alert per way-segment of the same roadwork, so
  // a single street shows up 3–4 times. Merge rows that share type + street
  // (keeping the nearest) and show a ×N multiplier instead.
  const grouped = useMemo(() => {
    const byKey = new Map<string, { alert: RoadAlert; count: number }>();
    for (const alert of roadAlerts) {
      const key = `${alert.type}|${alert.name ?? alert.ref ?? alert.id}`;
      const entry = byKey.get(key);
      if (!entry) {
        byKey.set(key, { alert, count: 1 });
      } else {
        entry.count += 1;
        if ((alert.distance ?? Infinity) < (entry.alert.distance ?? Infinity)) {
          entry.alert = alert;
        }
      }
    }
    return [...byKey.values()];
  }, [roadAlerts]);

  const visible = expanded ? grouped : grouped.slice(0, MAX_COLLAPSED_ALERTS);

  // Radius label in the user's unit (e.g. "5 km" or "3.1 mi").
  const radiusLabel =
    unitSystem === "imperial"
      ? `${(searchRadiusKm * KM_TO_MILES).toFixed(1)} mi`
      : `${searchRadiusKm} km`;

  return (
    <View style={[styles.card, roadAlerts.length > 0 && styles.roadAlertCard]}>
      <Text style={styles.cardTitle}>{t("home.roadConditions")}</Text>

      {loading ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator size="small" color={COLORS.brand} />
          <Text style={styles.loadingText}>{t("home.roadConditionsLoading")}</Text>
        </View>
      ) : roadAlerts.length === 0 ? (
        <Text style={styles.roadConditionsAllClear}>
          {t("home.roadConditionsNone", { radius: radiusLabel })}
        </Text>
      ) : (
        <>
          <Text style={styles.roadConditionsCount}>
            {t("home.roadConditionsCount", {
              count: roadAlerts.length,
              radius: radiusLabel,
            })}
          </Text>
          {visible.map(({ alert, count }) => {
            const canOpen = alert.lat != null && alert.lon != null;
            const openInMaps = () => {
              if (!canOpen) return;
              Linking.openURL(
                `https://www.google.com/maps/search/?api=1&query=${alert.lat},${alert.lon}`
              ).catch(() => null);
            };
            return (
              <Pressable
                key={alert.id}
                style={({ pressed }) => [
                  styles.roadAlertRow,
                  canOpen && pressed && styles.roadAlertRowPressed,
                ]}
                onPress={() => {
                  Haptics?.impactAsync(Haptics.ImpactFeedbackStyle.Light)?.catch(
                    () => null
                  );
                  openInMaps();
                }}
                disabled={!canOpen}
              >
                <MaterialCommunityIcons
                  name="traffic-cone"
                  size={20}
                  color={COLORS.warning}
                  style={styles.roadAlertIcon}
                />
                <View style={styles.roadAlertInfo}>
                  <View style={styles.roadAlertHeader}>
                    <Text style={styles.roadAlertType}>
                      {humanizeConstructionType(alert.type, t)}
                      {count > 1 ? ` ×${count}` : ""}
                    </Text>
                    {alert.distance != null && (
                      <Text style={styles.roadAlertDistance}>
                        {fmtDistShort(alert.distance * 1000, unitSystem)}
                      </Text>
                    )}
                  </View>
                  {alert.name ? (
                    <Text style={styles.roadAlertName}>{alert.name}</Text>
                  ) : alert.ref ? (
                    <Text style={styles.roadAlertName}>{alert.ref}</Text>
                  ) : null}
                  {alert.description ? (
                    <Text style={styles.roadAlertDesc}>{alert.description}</Text>
                  ) : null}
                  {alert.operator ? (
                    <Text style={styles.roadAlertDesc}>{alert.operator}</Text>
                  ) : null}
                  {canOpen && (
                    <Text style={styles.roadAlertMapHint}>
                      {t("home.tapToOpenMaps")}
                    </Text>
                  )}
                </View>
              </Pressable>
            );
          })}
          {grouped.length > MAX_COLLAPSED_ALERTS && (
            <Pressable
              style={({ pressed }) => [
                styles.showMoreBtn,
                pressed && styles.showMoreBtnPressed,
              ]}
              onPress={() => {
                Haptics?.impactAsync(Haptics.ImpactFeedbackStyle.Light)?.catch(
                  () => null
                );
                setExpanded((e) => !e);
              }}
              accessibilityRole="button"
              accessibilityState={{ expanded }}
            >
              <Text style={styles.showMoreText}>
                {expanded
                  ? t("home.showFewerAlerts")
                  : t("home.showAllAlerts", { count: grouped.length })}
              </Text>
            </Pressable>
          )}
        </>
      )}

      {location && (
        <Pressable
          style={styles.secondaryButton}
          onPress={() => {
            Haptics?.impactAsync(Haptics.ImpactFeedbackStyle.Light)?.catch(
              () => null
            );
            const { latitude, longitude } = location.coords;
            Linking.openURL(
              `https://www.google.com/maps/@${latitude},${longitude},14z/data=!5m1!1e1`
            ).catch(() => null);
          }}
          accessibilityRole="link"
          accessibilityLabel={t("home.openTrafficMap")}
        >
          <Text style={styles.secondaryButtonText}>
            {t("home.openTrafficMap")}
          </Text>
        </Pressable>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.card,
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    shadowColor: "#000000",
    shadowOpacity: 0.4,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  roadAlertCard: { borderColor: COLORS.warning, borderWidth: 1 },
  cardTitle: {
    color: COLORS.white,
    fontSize: 16,
    fontWeight: "800",
    marginBottom: 8,
    letterSpacing: 1,
  },
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 10,
  },
  loadingText: { color: COLORS.body },
  roadConditionsAllClear: { color: COLORS.success, fontSize: 14, marginBottom: 4 },
  roadConditionsCount: {
    color: COLORS.warning,
    fontSize: 13,
    fontWeight: "700",
    marginBottom: 10,
  },
  roadAlertRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    marginBottom: 8,
    backgroundColor: "rgba(245,158,11,0.08)",
    borderRadius: 10,
    padding: 8,
  },
  roadAlertRowPressed: { backgroundColor: "rgba(245,158,11,0.22)" },
  roadAlertIcon: { marginTop: 1 },
  roadAlertInfo: { flex: 1 },
  roadAlertHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 6,
  },
  roadAlertType: {
    color: COLORS.warning,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.5,
    flexShrink: 1,
  },
  roadAlertDistance: {
    color: "#8A93A8",
    fontSize: 11,
    fontWeight: "600",
    flexShrink: 0,
  },
  roadAlertName: { color: COLORS.body, fontSize: 13, marginTop: 2 },
  roadAlertDesc: {
    color: "#8A93A8",
    fontSize: 12,
    marginTop: 2,
    fontStyle: "italic",
  },
  roadAlertMapHint: { color: COLORS.warning, fontSize: 11, marginTop: 4, opacity: 0.75 },
  showMoreBtn: {
    marginTop: 2,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(245,158,11,0.4)",
    alignItems: "center",
  },
  showMoreBtnPressed: { backgroundColor: "rgba(245,158,11,0.15)" },
  showMoreText: { color: COLORS.warning, fontSize: 13, fontWeight: "700" },
  secondaryButton: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: COLORS.brand,
    backgroundColor: "rgba(47,212,196,0.08)",
    paddingVertical: 8,
    borderRadius: 10,
    alignItems: "center",
  },
  secondaryButtonText: { color: COLORS.brand, fontSize: 14, fontWeight: "700" },
});
