// ── components/SunCard.tsx ────────────────────────────────────────────────────
// Sunrise / sunset / daylight card for the RIDER HQ screen.

import { memo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { type SunTimes, type PolarState, formatTime, formatDuration } from "../lib/sun";

import { COLORS } from "../lib/theme";
type Props = {
  sunTimes: SunTimes;
  polarState?: PolarState | null;
};

/** Renders the sunrise, sunset and total daylight duration card. */
// memo: HQ screen re-renders on unrelated state; props only change on refresh.
export const SunCard = memo(function SunCard({ sunTimes, polarState }: Props) {
  const { t } = useTranslation();

  // Polar day/night: no sunrise/sunset to show — explain why instead of hiding.
  if (!sunTimes) {
    if (!polarState) return null;
    return (
      <View style={styles.card}>
        <Text style={styles.cardTitle}>{t("home.sunriseSunset")}</Text>
        <Text style={styles.polarText}>
          {polarState === "polar-day" ? t("home.polarDay") : t("home.polarNight")}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{t("home.sunriseSunset")}</Text>
      <View style={styles.sunTimesRow}>
        <View style={styles.sunTimesItem}>
          <Text style={styles.sunTimesEmoji}>🌅</Text>
          <Text style={styles.sunTimesValue}>{formatTime(sunTimes.sunrise)}</Text>
          <Text style={styles.sunTimesLabel}>{t("home.sunrise")}</Text>
        </View>
        <View style={styles.sunTimesDivider} />
        <View style={styles.sunTimesItem}>
          <Text style={styles.sunTimesEmoji}>🌇</Text>
          <Text style={styles.sunTimesValue}>{formatTime(sunTimes.sunset)}</Text>
          <Text style={styles.sunTimesLabel}>{t("home.sunset")}</Text>
        </View>
        <View style={styles.sunTimesDivider} />
        <View style={styles.sunTimesItem}>
          <Text style={styles.sunTimesEmoji}>☀️</Text>
          <Text style={styles.sunTimesValue}>{formatDuration(sunTimes.daylightMinutes)}</Text>
          <Text style={styles.sunTimesLabel}>{t("home.daylight")}</Text>
        </View>
      </View>
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
  cardTitle: {
    color: COLORS.white,
    fontSize: 16,
    fontWeight: "800",
    marginBottom: 8,
    letterSpacing: 1,
  },
  sunTimesRow: {
    flexDirection: "row",
    backgroundColor: COLORS.bg,
    borderRadius: 10,
    paddingVertical: 12,
    marginTop: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  sunTimesItem: { flex: 1, alignItems: "center" },
  sunTimesDivider: {
    width: 1,
    backgroundColor: COLORS.border,
    marginVertical: 4,
  },
  sunTimesEmoji: { fontSize: 22, marginBottom: 4 },
  sunTimesValue: { color: COLORS.brand, fontSize: 16, fontWeight: "800" },
  sunTimesLabel: { color: COLORS.muted, fontSize: 12, marginTop: 2 },
  polarText: { color: COLORS.body, fontSize: 14, marginTop: 10, lineHeight: 20 },
});
