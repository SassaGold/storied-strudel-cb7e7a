// ── SunCard ───────────────────────────────────────────────────────────────────
// Renders the sunrise/sunset card on the RIDER HQ home screen.

import { StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { formatTime, formatDuration, type SunTimes } from "../lib/sun";

interface Props {
  sunTimes: NonNullable<SunTimes>;
}

export default function SunCard({ sunTimes }: Props) {
  const { t } = useTranslation("home");
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{t("sunriseSunset")}</Text>
      <View style={styles.sunTimesRowSpaced}>
        <View style={styles.sunTimesItem}>
          <Text style={styles.sunTimesEmoji}>🌅</Text>
          <Text style={styles.sunTimesValue}>{formatTime(sunTimes.sunrise)}</Text>
          <Text style={styles.sunTimesLabel}>{t("sunrise")}</Text>
        </View>
        <View style={styles.sunTimesDivider} />
        <View style={styles.sunTimesItem}>
          <Text style={styles.sunTimesEmoji}>🌇</Text>
          <Text style={styles.sunTimesValue}>{formatTime(sunTimes.sunset)}</Text>
          <Text style={styles.sunTimesLabel}>{t("sunset")}</Text>
        </View>
        <View style={styles.sunTimesDivider} />
        <View style={styles.sunTimesItem}>
          <Text style={styles.sunTimesEmoji}>☀️</Text>
          <Text style={styles.sunTimesValue}>{formatDuration(sunTimes.daylightMinutes)}</Text>
          <Text style={styles.sunTimesLabel}>{t("daylight")}</Text>
        </View>
      </View>
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
  cardTitle: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "800",
    marginBottom: 8,
    letterSpacing: 1,
  },
  sunTimesRowSpaced: {
    flexDirection: "row",
    backgroundColor: "#0a0a0a",
    borderRadius: 8,
    paddingVertical: 12,
    marginTop: 14,
    borderWidth: 1,
    borderColor: "#2a2a2a",
  },
  sunTimesItem: { flex: 1, alignItems: "center" },
  sunTimesDivider: { width: 1, backgroundColor: "#2a2a2a", marginVertical: 4 },
  sunTimesEmoji: { fontSize: 22, marginBottom: 4 },
  sunTimesValue: { color: "#ff6600", fontSize: 16, fontWeight: "800" },
  sunTimesLabel: { color: "#666666", fontSize: 12, marginTop: 2 },
});
