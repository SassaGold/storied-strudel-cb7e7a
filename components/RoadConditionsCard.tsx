// ── RoadConditionsCard ────────────────────────────────────────────────────────
// Renders the road conditions / construction alerts card on the RIDER HQ screen.

import { ActivityIndicator, Linking, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import * as Location from "expo-location";
import { type RoadAlert, humanizeConstructionType } from "../lib/roads";
import { Haptics } from "../lib/safeRequire";

interface Props {
  loading: boolean;
  roadAlerts: RoadAlert[];
  location: Location.LocationObject | null;
}

export default function RoadConditionsCard({ loading, roadAlerts, location }: Props) {
  const { t } = useTranslation("home");

  return (
    <View style={[styles.card, roadAlerts.length > 0 && styles.roadAlertCard]}>
      <Text style={styles.cardTitle}>{t("roadConditions")}</Text>

      {loading ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator size="small" color="#ff6600" />
          <Text style={styles.loadingText}>{t("roadConditionsLoading")}</Text>
        </View>
      ) : roadAlerts.length === 0 ? (
        <Text style={styles.roadConditionsAllClear}>{t("roadConditionsNone")}</Text>
      ) : (
        <>
          <Text style={styles.roadConditionsCount}>
            {t("roadConditionsCount", { count: roadAlerts.length })}
          </Text>
          {roadAlerts.map((alert) => {
            const canOpen = alert.lat != null && alert.lon != null;
            const openAlertInMaps = () => {
              if (!canOpen) return;
              const url =
                Platform.OS === "ios"
                  ? `maps://?ll=${alert.lat},${alert.lon}&q=${alert.lat},${alert.lon}`
                  : `https://www.google.com/maps/search/?api=1&query=${alert.lat},${alert.lon}`;
              Linking.openURL(url).catch(() => null);
            };
            return (
              <Pressable
                key={alert.id}
                style={({ pressed }) => [
                  styles.roadAlertRow,
                  canOpen && pressed && styles.roadAlertRowPressed,
                ]}
                onPress={() => { Haptics?.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => null); openAlertInMaps(); }}
                disabled={!canOpen}
              >
                <Text style={styles.roadAlertEmoji}>🚧</Text>
                <View style={styles.roadAlertInfo}>
                  <View style={styles.roadAlertHeader}>
                    <Text style={styles.roadAlertType}>
                      {humanizeConstructionType(alert.type)}
                    </Text>
                    {alert.distance != null && (
                      <Text style={styles.roadAlertDistance}>
                        {alert.distance < 1
                          ? `${Math.round(alert.distance * 1000)} m`
                          : `${alert.distance.toFixed(1)} km`}
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
                    <Text style={styles.roadAlertDesc}>🏗️ {alert.operator}</Text>
                  ) : null}
                  {canOpen && (
                    <Text style={styles.roadAlertMapHint}>📍 Tap to open in Maps</Text>
                  )}
                </View>
              </Pressable>
            );
          })}
        </>
      )}

      {location && (
        <Pressable
          style={styles.secondaryButton}
          onPress={() => {
            Haptics?.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => null);
            const { latitude, longitude } = location.coords;
            Linking.openURL(
              `https://www.google.com/maps/@${latitude},${longitude},14z/data=!5m1!1e1`
            ).catch(() => null);
          }}
        >
          <Text style={styles.secondaryButtonText}>{t("openTrafficMap")}</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#141414",
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#2a2a2a",
    shadowColor: "#000000",
    shadowOpacity: 0.4,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  roadAlertCard: { borderColor: "#f59e0b", borderWidth: 1 },
  cardTitle: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "800",
    marginBottom: 8,
    letterSpacing: 1,
  },
  loadingRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 },
  loadingText: { color: "#c8c8c8" },
  roadConditionsAllClear: { color: "#22c55e", fontSize: 14, marginBottom: 4 },
  roadConditionsCount: { color: "#f59e0b", fontSize: 13, fontWeight: "700", marginBottom: 10 },
  roadAlertRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    marginBottom: 8,
    backgroundColor: "rgba(245,158,11,0.08)",
    borderRadius: 8,
    padding: 8,
  },
  roadAlertRowPressed: { backgroundColor: "rgba(245,158,11,0.22)" },
  roadAlertEmoji: { fontSize: 20, marginTop: 1 },
  roadAlertInfo: { flex: 1 },
  roadAlertHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 6,
  },
  roadAlertType: { color: "#f59e0b", fontSize: 12, fontWeight: "700", letterSpacing: 0.5, flexShrink: 1 },
  roadAlertDistance: { color: "#a3a3a3", fontSize: 11, fontWeight: "600", flexShrink: 0 },
  roadAlertName: { color: "#c8c8c8", fontSize: 13, marginTop: 2 },
  roadAlertDesc: { color: "#a3a3a3", fontSize: 12, marginTop: 2, fontStyle: "italic" },
  roadAlertMapHint: { color: "#f59e0b", fontSize: 11, marginTop: 4, opacity: 0.75 },
  secondaryButton: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: "#ff6600",
    backgroundColor: "rgba(255,102,0,0.08)",
    paddingVertical: 8,
    borderRadius: 10,
    alignItems: "center",
  },
  secondaryButtonText: { color: "#ff6600", fontSize: 14, fontWeight: "700" },
});
