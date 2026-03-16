// ── WeatherCard ───────────────────────────────────────────────────────────────
// Renders the current-weather card on the RIDER HQ home screen.

import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import i18n from "../lib/i18n";
import { useSettings, fmtTemp } from "../lib/settings";
import {
  weatherEmoji,
  formatWeatherCode,
  windDegToKey,
  formatHourlyTime,
  formatForecastDate,
  type WeatherInfo,
} from "../lib/weather";
import { Haptics } from "../lib/safeRequire";

interface Props {
  weather: WeatherInfo;
  weatherUrl: string;
}

export default function WeatherCard({ weather, weatherUrl }: Props) {
  const { t } = useTranslation("home");
  const { settings } = useSettings();

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{t("localWeather")}</Text>

      {/* Main condition row */}
      <View style={styles.weatherMainRow}>
        <Text style={styles.weatherEmojiLarge}>{weatherEmoji(weather.weatherCode)}</Text>
        <View style={styles.weatherMainInfo}>
          <Text style={styles.weatherTempText}>
            {weather.temperatureC != null ? fmtTemp(weather.temperatureC, settings.unitSystem) : "—"}
          </Text>
          {weather.feelsLikeC != null && (
            <Text style={styles.weatherFeelsLike}>
              {t("feelsLike")}: {fmtTemp(weather.feelsLikeC, settings.unitSystem)}
            </Text>
          )}
          <Text style={styles.weatherConditionText}>
            {t(formatWeatherCode(weather.weatherCode), { defaultValue: formatWeatherCode(weather.weatherCode) })}
          </Text>
        </View>
      </View>

      {/* Stats grid — 2×2 */}
      <View style={styles.weatherStatsGrid}>
        <View style={styles.weatherStatsRow}>
          <View style={styles.weatherStatItem}>
            <Text style={styles.weatherStatValue}>
              {weather.windSpeed?.toFixed(1) ?? "0"}
              {weather.windDirection != null ? ` ${t(windDegToKey(weather.windDirection))}` : ""}
            </Text>
            <Text style={styles.weatherStatLabel}>{t("wind")}</Text>
          </View>
          <View style={styles.weatherStatDivider} />
          <View style={styles.weatherStatItem}>
            <Text style={styles.weatherStatValue}>{weather.precipitationProbability ?? 0}%</Text>
            <Text style={styles.weatherStatLabel}>{t("rainChance")}</Text>
          </View>
        </View>
        <View style={styles.weatherStatsRowDivider} />
        <View style={styles.weatherStatsRow}>
          <View style={styles.weatherStatItem}>
            <Text style={styles.weatherStatValue}>
              {weather.humidity != null ? `${weather.humidity}%` : "—"}
            </Text>
            <Text style={styles.weatherStatLabel}>{t("humidity")}</Text>
          </View>
          <View style={styles.weatherStatDivider} />
          <View style={styles.weatherStatItem}>
            <Text style={styles.weatherStatValue}>{weather.precipitation ?? 0}</Text>
            <Text style={styles.weatherStatLabel}>{t("precip")}</Text>
          </View>
        </View>
      </View>

      <Pressable
        style={styles.secondaryButton}
        onPress={() => { Haptics?.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => null); Linking.openURL(weatherUrl).catch(() => null); }}
      >
        <Text style={styles.secondaryButtonText}>{t("openWeather")}</Text>
      </Pressable>
    </View>
  );
}

// ── Hourly forecast card ───────────────────────────────────────────────────────

export function HourlyForecastCard({ weather }: { weather: WeatherInfo }) {
  const { t } = useTranslation("home");
  const { settings } = useSettings();
  if (!weather.hourly || weather.hourly.length === 0) return null;
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{t("hourlyForecast")}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} nestedScrollEnabled>
        <View style={styles.hourlyCardsRow}>
          {weather.hourly.map((hour) => (
            <View key={hour.time} style={styles.hourlyCard}>
              <Text style={styles.hourlyCardTime}>{formatHourlyTime(hour.time)}</Text>
              <Text style={styles.hourlyCardEmoji}>{weatherEmoji(hour.weatherCode)}</Text>
              <Text style={styles.hourlyCardTemp}>{fmtTemp(hour.temperatureC, settings.unitSystem, true)}</Text>
              <Text style={styles.hourlyCardRain}>💧 {hour.precipitationProbability}%</Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

// ── 3-day forecast card ────────────────────────────────────────────────────────

export function DailyForecastCard({ weather }: { weather: WeatherInfo }) {
  const { t } = useTranslation("home");
  const { settings } = useSettings();
  if (!weather.forecast || weather.forecast.length === 0) return null;
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{t("forecast")}</Text>
      <View style={styles.forecastCardsRow}>
        {weather.forecast.slice(0, 3).map((day) => (
          <View key={day.date} style={styles.forecastCard}>
            <Text style={styles.forecastCardDay}>
              {formatForecastDate(day.date, i18n.language).split(",")[0]}
            </Text>
            <Text style={styles.forecastCardDate}>
              {formatForecastDate(day.date, i18n.language).split(",")[1]?.trim() ?? ""}
            </Text>
            <Text style={styles.forecastCardEmoji}>{weatherEmoji(day.weatherCode)}</Text>
            <Text style={styles.forecastCardCondition}>
              {t(formatWeatherCode(day.weatherCode), { defaultValue: formatWeatherCode(day.weatherCode) })}
            </Text>
            <Text style={styles.forecastCardTemp}>
              {fmtTemp(day.maxTempC, settings.unitSystem, true)} / {fmtTemp(day.minTempC, settings.unitSystem, true)}
            </Text>
            <View style={styles.forecastCardRainRow}>
              <Text style={styles.forecastCardRain}>💧 {day.precipitationProbability}%</Text>
            </View>
          </View>
        ))}
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
  weatherMainRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    marginBottom: 16,
  },
  weatherEmojiLarge: { fontSize: 64 },
  weatherMainInfo: { flex: 1 },
  weatherTempText: {
    color: "#ff6600",
    fontSize: 42,
    fontWeight: "800",
    lineHeight: 46,
  },
  weatherConditionText: {
    color: "#c8c8c8",
    fontSize: 16,
    marginTop: 2,
  },
  weatherFeelsLike: {
    color: "#888888",
    fontSize: 13,
    marginTop: 2,
  },
  weatherStatsGrid: {
    backgroundColor: "#0a0a0a",
    borderRadius: 8,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "#2a2a2a",
    overflow: "hidden",
  },
  weatherStatsRow: { flexDirection: "row", paddingVertical: 12 },
  weatherStatsRowDivider: { height: 1, backgroundColor: "#2a2a2a" },
  weatherStatItem: { flex: 1, alignItems: "center" },
  weatherStatDivider: { width: 1, backgroundColor: "#2a2a2a", marginVertical: 4 },
  weatherStatValue: { color: "#ff6600", fontSize: 20, fontWeight: "800" },
  weatherStatLabel: { color: "#666666", fontSize: 12, marginTop: 2 },
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
  hourlyCardsRow: { flexDirection: "row", gap: 8, paddingVertical: 4 },
  hourlyCard: {
    backgroundColor: "#0a0a0a",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#2a2a2a",
    paddingVertical: 10,
    paddingHorizontal: 12,
    alignItems: "center",
    minWidth: 68,
  },
  hourlyCardTime: { color: "#ffffff", fontSize: 13, fontWeight: "700", marginBottom: 6 },
  hourlyCardEmoji: { fontSize: 22, marginBottom: 4 },
  hourlyCardTemp: { color: "#ff6600", fontSize: 13, fontWeight: "600", marginBottom: 4 },
  hourlyCardRain: { color: "#888888", fontSize: 11 },
  forecastCardsRow: { flexDirection: "row", gap: 8, marginTop: 8 },
  forecastCard: {
    flex: 1,
    backgroundColor: "#0a0a0a",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#2a2a2a",
    paddingVertical: 14,
    paddingHorizontal: 6,
    alignItems: "center",
    shadowColor: "#020617",
    shadowOpacity: 0.35,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  forecastCardDay: { color: "#ffffff", fontSize: 14, fontWeight: "700", letterSpacing: 0.3 },
  forecastCardDate: { color: "#666666", fontSize: 11, marginBottom: 8, marginTop: 1 },
  forecastCardEmoji: { fontSize: 30, marginBottom: 6 },
  forecastCardCondition: { color: "#c8c8c8", fontSize: 10, textAlign: "center", marginBottom: 6 },
  forecastCardTemp: { color: "#ff6600", fontSize: 13, fontWeight: "600", marginBottom: 6 },
  forecastCardRainRow: {
    backgroundColor: "rgba(255,102,0,0.12)",
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  forecastCardRain: { color: "#ff6600", fontSize: 11, fontWeight: "600" },
});
