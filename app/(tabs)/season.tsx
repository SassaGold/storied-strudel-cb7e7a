import { MaterialCommunityIcons, Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useState, type ComponentProps } from "react";
import { useTranslation } from "react-i18next";
import {
  Alert,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import HeaderBackdrop from "../../components/HeaderBackdrop";
import { COLORS, FONTS } from "../../lib/theme";
import { computeNextDue, inspectionRule } from "../../lib/inspectionRules";
import {
  cancelInspectionReminder,
  reminderFireDate,
  requestNotificationPermission,
  scheduleInspectionReminder,
} from "../../lib/notifications";
import {
  CHECKLIST_ITEMS,
  COUNTRIES,
  COUNTRY_FLAG,
  checklistProgress,
  currentSeasonPhase,
  defaultSeasonState,
  loadSeasonState,
  saveSeasonState,
  toggleChecklistItem,
  type ChecklistType,
  type Country,
  type SeasonState,
} from "../../lib/season";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const Haptics: typeof import("expo-haptics") | null = (() => { try { return require("expo-haptics"); } catch { return null; } })();

type IconName = ComponentProps<typeof MaterialCommunityIcons>["name"];

// The Season screen has three panels; checklists share one renderer.
type Panel = ChecklistType | "inspection";
const PANELS: { key: Panel; icon: IconName }[] = [
  { key: "winter", icon: "snowflake" },
  { key: "spring", icon: "flower" },
  { key: "inspection", icon: "clipboard-check" },
];

/** Format a date (Date or ISO string) as dd-mm-yyyy. Empty string if invalid. */
function fmtDate(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  if (isNaN(date.getTime())) return "";
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  return `${dd}-${mm}-${date.getFullYear()}`;
}

export default function SeasonScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [state, setState] = useState<SeasonState>(defaultSeasonState);
  const [panel, setPanel] = useState<Panel>(() =>
    currentSeasonPhase() === "springPrep" ? "spring" : "winter"
  );

  // Hydrate persisted state on mount.
  useEffect(() => {
    let alive = true;
    loadSeasonState().then((s) => { if (alive) setState(s); });
    return () => { alive = false; };
  }, []);

  const hapticLight = () =>
    Haptics?.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => null);

  // Persist on every mutation via a single helper so the screen never forgets.
  const update = useCallback((next: SeasonState) => {
    setState(next);
    saveSeasonState(next);
  }, []);

  const onToggle = useCallback((type: ChecklistType, itemId: string) => {
    hapticLight();
    setState((prev) => {
      const next = toggleChecklistItem(prev, type, itemId);
      saveSeasonState(next);
      return next;
    });
  }, []);

  const setCountry = (country: Country) => {
    hapticLight();
    update({ ...state, bike: { ...state.bike, country } });
  };

  const phase = currentSeasonPhase();
  const rule = inspectionRule(state.bike.country);

  return (
    <ScrollView
      style={styles.scrollView}
      contentContainerStyle={[styles.container, { paddingTop: insets.top + 20 }]}
    >
      {/* ── Header ── */}
      <View style={styles.header}>
        <HeaderBackdrop />
        <Text style={styles.headerBadge}>{t("season.badge")}</Text>
        <Text style={styles.title}>{t("season.title")}</Text>
        <Text style={styles.subtitle}>{t("season.subtitle")}</Text>
        <Pressable
          style={({ pressed }) => [styles.backBtn, pressed && styles.backBtnPressed]}
          onPress={() => { hapticLight(); router.back(); }}
          accessibilityRole="button"
          accessibilityLabel={t("common.back")}
          hitSlop={8}
        >
          <Ionicons name="arrow-back" size={18} color={COLORS.brand} />
          <Text style={styles.backBtnLabel}>{t("common.back")}</Text>
        </Pressable>
      </View>

      {/* ── Season nudge ── */}
      <View style={styles.nudge}>
        <MaterialCommunityIcons name="calendar-clock" size={20} color={COLORS.brand} />
        <Text style={styles.nudgeText}>{t(`season.nudge.${phase}`)}</Text>
      </View>

      {/* ── Bike / country ── */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>{t("season.bike.title")}</Text>
        <TextInput
          style={styles.input}
          value={state.bike.name}
          onChangeText={(name) => update({ ...state, bike: { ...state.bike, name } })}
          placeholder={t("season.bike.namePlaceholder")}
          placeholderTextColor="#555555"
          returnKeyType="done"
          accessibilityLabel={t("season.bike.namePlaceholder")}
        />
        <Text style={styles.fieldLabel}>{t("season.bike.firstRegistration")}</Text>
        <TextInput
          style={styles.input}
          value={state.bike.firstRegistration ?? ""}
          onChangeText={(v) =>
            update({ ...state, bike: { ...state.bike, firstRegistration: v || undefined } })
          }
          placeholder="YYYY-MM-DD"
          placeholderTextColor="#555555"
          keyboardType="numbers-and-punctuation"
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="done"
          accessibilityLabel={t("season.bike.firstRegistration")}
        />
        <Text style={styles.fieldLabel}>{t("season.bike.country")}</Text>
        <View style={styles.chipRow}>
          {COUNTRIES.map((c) => {
            const active = state.bike.country === c;
            return (
              <Pressable
                key={c}
                style={[styles.chip, active && styles.chipActive]}
                onPress={() => setCountry(c)}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                accessibilityLabel={t(`season.country.${c}`)}
              >
                <Text style={styles.chipFlag}>{COUNTRY_FLAG[c]}</Text>
                <Text
                  style={[styles.chipText, active && styles.chipTextActive]}
                  numberOfLines={1}
                >
                  {t(`season.country.${c}`)}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* ── Panel selector ── */}
      <View style={styles.segmentRow}>
        {PANELS.map(({ key, icon }) => {
          const active = panel === key;
          return (
            <Pressable
              key={key}
              style={[styles.segmentTile, active && styles.segmentTileActive]}
              onPress={() => { hapticLight(); setPanel(key); }}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              accessibilityLabel={t(`season.panels.${key}`)}
            >
              <MaterialCommunityIcons
                name={icon}
                size={24}
                color={active ? COLORS.brand : COLORS.muted}
              />
              <Text style={[styles.segmentText, active && styles.segmentTextActive]}>
                {t(`season.panels.${key}`)}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {panel === "inspection" ? (
        <InspectionPanel rule={rule} state={state} update={update} />
      ) : (
        <ChecklistPanel state={state} type={panel} onToggle={onToggle} />
      )}
    </ScrollView>
  );
}

// ── Checklist panel ───────────────────────────────────────────────────────────

function ChecklistPanel({
  state,
  type,
  onToggle,
}: {
  state: SeasonState;
  type: ChecklistType;
  onToggle: (type: ChecklistType, itemId: string) => void;
}) {
  const { t } = useTranslation();
  const items = CHECKLIST_ITEMS[type];
  const { done, total } = checklistProgress(state, type);

  return (
    <View style={styles.card}>
      <View style={styles.progressRow}>
        <Text style={styles.cardTitle}>{t(`season.checklist.${type}Title`)}</Text>
        <Text style={styles.progressCount}>{done}/{total}</Text>
      </View>
      <Text style={styles.cardDescription}>{t(`season.checklist.${type}Desc`)}</Text>

      {items.map((item) => {
        const st = state.checklists[type][item.id];
        const checked = !!st?.done;
        return (
          <Pressable
            key={item.id}
            style={styles.itemRow}
            onPress={() => onToggle(type, item.id)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked }}
            accessibilityLabel={t(`season.items.${item.id}`)}
          >
            <MaterialCommunityIcons
              name={checked ? "checkbox-marked" : "checkbox-blank-outline"}
              size={24}
              color={checked ? COLORS.success : COLORS.muted}
            />
            <View style={styles.itemBody}>
              <Text style={[styles.itemText, checked && styles.itemTextDone]}>
                {t(`season.items.${item.id}`)}
              </Text>
              {checked && st?.completedAt && (
                <Text style={styles.itemMeta}>
                  {t("season.checklist.completedOn", { date: fmtDate(st.completedAt) })}
                </Text>
              )}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

// ── Inspection panel ──────────────────────────────────────────────────────────

function InspectionPanel({
  rule,
  state,
  update,
}: {
  rule: ReturnType<typeof inspectionRule>;
  state: SeasonState;
  update: (next: SeasonState) => void;
}) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const nextDue = rule.required ? computeNextDue(rule, state.bike.firstRegistration) : null;
  const reminderId = state.inspection.reminderId;
  // What the currently-scheduled reminder was actually set for (persisted at
  // schedule time) — NOT recomputed from the live deadline, so the label always
  // reflects the real notification even after the bike's country/date change.
  const scheduledFire = state.inspection.reminderFireDate;
  const scheduledFor = state.inspection.nextDueDate;
  // The scheduled reminder no longer matches the current computed deadline.
  const isStale = !!reminderId && !!scheduledFor && scheduledFor !== nextDue;

  const hapticLight = () =>
    Haptics?.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => null);

  const onSetReminder = async () => {
    if (!nextDue || busy) return;
    hapticLight();
    setBusy(true);
    try {
      const granted = await requestNotificationPermission();
      if (!granted) {
        Alert.alert(t("season.inspection.permTitle"), t("season.inspection.permBody"), [
          { text: t("common.ok") },
          {
            text: t("triplog.openSettings"),
            onPress: () => Linking.openSettings().catch(() => null),
          },
        ]);
        return;
      }
      const fire = reminderFireDate(nextDue);
      const id = await scheduleInspectionReminder({
        dueDateISO: nextDue,
        title: t("season.inspection.notifTitle"),
        body: t("season.inspection.notifBody", { term: rule.nativeTerm, date: fmtDate(nextDue) }),
        existingId: reminderId,
      });
      if (id) {
        update({
          ...state,
          inspection: {
            ...state.inspection,
            reminderId: id,
            nextDueDate: nextDue,
            reminderFireDate: fire ? fire.toISOString() : undefined,
          },
        });
        Alert.alert(
          t("season.inspection.reminderSetTitle"),
          t("season.inspection.reminderSetBody", { date: fire ? fmtDate(fire) : "" })
        );
      } else {
        Alert.alert(
          t("season.inspection.reminderFailTitle"),
          t("season.inspection.reminderFailBody")
        );
      }
    } finally {
      setBusy(false);
    }
  };

  const onCancelReminder = async () => {
    hapticLight();
    await cancelInspectionReminder(reminderId);
    update({
      ...state,
      inspection: {
        ...state.inspection,
        reminderId: undefined,
        nextDueDate: undefined,
        reminderFireDate: undefined,
      },
    });
  };

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{t("season.inspection.title")}</Text>
      <Text style={styles.cardDescription}>
        {rule.required
          ? t("season.inspection.requiredIn", { term: rule.nativeTerm })
          : t("season.inspection.notRequired")}
      </Text>

      {/* Defensive: if a country's rule is ever added before it's verified, we
          must not show a computed date or offer a reminder for it. */}
      {rule.required && !rule.verified && (
        <View style={styles.warnBanner}>
          <MaterialCommunityIcons name="alert" size={18} color={COLORS.warning} />
          <Text style={styles.warnText}>{t("season.inspection.unverified")}</Text>
        </View>
      )}

      {/* Computed deadline — only for verified, required countries. */}
      {rule.required && rule.verified && (
        <>
          {nextDue ? (
            <View style={styles.dueBanner}>
              <MaterialCommunityIcons name="calendar-check" size={20} color={COLORS.brand} />
              <View style={{ flex: 1 }}>
                <Text style={styles.dueText}>
                  {t("season.inspection.nextDue", { date: fmtDate(nextDue) })}
                </Text>
                <Text style={styles.dueEstimate}>{t("season.inspection.estimateNote")}</Text>
              </View>
            </View>
          ) : (
            <Text style={styles.cardDescription}>{t("season.inspection.enterDate")}</Text>
          )}
        </>
      )}

      <Pressable
        style={styles.sourceRow}
        onPress={() => Linking.openURL(rule.sourceUrl).catch(() => null)}
        accessibilityRole="link"
        accessibilityLabel={t("season.inspection.source")}
      >
        <Text style={styles.fieldLabel}>{t("season.inspection.source")}</Text>
        <Text style={styles.sourceLink}>{rule.source} ↗</Text>
      </Pressable>

      {/* Reminder status — shown whenever a reminder is actually scheduled, even
          if the bike's country was later switched to one without inspection. */}
      {reminderId && (
        <View style={styles.reminderSetRow}>
          <MaterialCommunityIcons name="bell-check" size={18} color={COLORS.success} />
          <Text style={styles.reminderSetText}>
            {scheduledFire
              ? t("season.inspection.reminderSetLabel", { date: fmtDate(scheduledFire) })
              : t("season.inspection.reminderSetLabelNoDate")}
          </Text>
        </View>
      )}

      {/* Staleness hint — the scheduled reminder no longer matches the current
          deadline (e.g. the country or registration date changed). */}
      {isStale && nextDue && (
        <View style={styles.warnBanner}>
          <MaterialCommunityIcons name="alert" size={18} color={COLORS.warning} />
          <Text style={styles.warnText}>{t("season.inspection.reminderStale")}</Text>
        </View>
      )}

      {/* Set / Update — only when there's a current computable deadline. */}
      {rule.required && rule.verified && nextDue && (
        <Pressable
          style={[styles.reminderBtn, busy && styles.reminderBtnDisabled]}
          onPress={onSetReminder}
          disabled={busy}
          accessibilityRole="button"
          accessibilityState={{ disabled: busy }}
          accessibilityLabel={
            reminderId ? t("season.inspection.updateReminder") : t("season.inspection.setReminder")
          }
        >
          <Text style={styles.reminderBtnText}>
            {reminderId
              ? t("season.inspection.updateReminder")
              : t("season.inspection.setReminder")}
          </Text>
        </Pressable>
      )}

      {/* Cancel — available whenever a reminder exists. */}
      {reminderId && (
        <Pressable
          onPress={onCancelReminder}
          accessibilityRole="button"
          accessibilityLabel={t("season.inspection.cancelReminder")}
        >
          <Text style={styles.reminderCancel}>{t("season.inspection.cancelReminder")}</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  scrollView: { flex: 1, backgroundColor: COLORS.bg },
  container: { padding: 20, paddingBottom: 40, backgroundColor: COLORS.bg },
  header: {
    marginTop: 18,
    marginBottom: 16,
    padding: 20,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(255,102,0,0.4)",
    overflow: "hidden",
    backgroundColor: "#1a0900",
  },
  headerBadge: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(255,102,0,0.18)",
    color: COLORS.brand,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 999,
    fontSize: 12,
    fontWeight: "700",
    marginBottom: 10,
    letterSpacing: 0.6,
    borderWidth: 1,
    borderColor: "rgba(255,102,0,0.5)",
  },
  title: { color: COLORS.white, fontSize: 30, fontFamily: FONTS.display, letterSpacing: 1.5 },
  subtitle: { color: COLORS.body, marginTop: 6, fontSize: 15 },
  backBtn: {
    alignSelf: "flex-end",
    marginTop: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: "rgba(255,102,0,0.15)",
    borderWidth: 1,
    borderColor: "rgba(255,102,0,0.4)",
  },
  backBtnPressed: { backgroundColor: "rgba(255,102,0,0.35)" },
  backBtnLabel: { color: COLORS.brand, fontSize: 13, fontWeight: "600", letterSpacing: 0.5 },
  nudge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 14,
    marginBottom: 16,
    borderRadius: 12,
    backgroundColor: "rgba(255,102,0,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,102,0,0.25)",
  },
  nudgeText: { color: COLORS.body, fontSize: 14, flex: 1 },
  card: {
    backgroundColor: COLORS.card,
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cardTitle: { color: COLORS.white, fontSize: 16, fontWeight: "800", letterSpacing: 0.5 },
  cardDescription: { color: COLORS.muted, fontSize: 13, marginTop: 4, marginBottom: 14, lineHeight: 18 },
  input: {
    backgroundColor: "#1e1e1e",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(255,102,0,0.35)",
    color: COLORS.white,
    fontSize: 14,
    paddingHorizontal: 12,
    paddingVertical: 9,
    marginTop: 12,
    marginBottom: 12,
  },
  fieldLabel: {
    color: COLORS.brand,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1,
    textTransform: "uppercase",
    marginBottom: 8,
  },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  chip: {
    width: "47%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(255,102,0,0.35)",
    backgroundColor: "rgba(255,102,0,0.08)",
  },
  chipActive: { backgroundColor: COLORS.brand, borderColor: COLORS.brand },
  chipFlag: { fontSize: 15 },
  chipText: { color: "#dddddd", fontSize: 13, fontWeight: "600" },
  chipTextActive: { color: COLORS.white },
  segmentRow: { flexDirection: "row", gap: 10, marginBottom: 16 },
  segmentTile: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    gap: 6,
    backgroundColor: COLORS.card,
    borderWidth: 1.5,
    borderColor: COLORS.border,
  },
  segmentTileActive: { borderColor: COLORS.brand, backgroundColor: "rgba(255,102,0,0.10)" },
  segmentText: { color: COLORS.muted, fontSize: 13, fontWeight: "700" },
  segmentTextActive: { color: COLORS.brand },
  progressRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  progressCount: { color: COLORS.brand, fontSize: 15, fontWeight: "800" },
  itemRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  itemBody: { flex: 1 },
  itemText: { color: COLORS.body, fontSize: 15 },
  itemTextDone: { color: COLORS.muted, textDecorationLine: "line-through" },
  itemMeta: { color: COLORS.muted, fontSize: 12, marginTop: 2 },
  warnBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 12,
    borderRadius: 10,
    marginBottom: 14,
    backgroundColor: "rgba(245,158,11,0.12)",
    borderWidth: 1,
    borderColor: "rgba(245,158,11,0.35)",
  },
  warnText: { color: COLORS.warning, fontSize: 13, flex: 1, lineHeight: 18 },
  dueBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    borderRadius: 10,
    marginBottom: 14,
    backgroundColor: "rgba(255,102,0,0.10)",
    borderWidth: 1,
    borderColor: "rgba(255,102,0,0.30)",
  },
  dueText: { color: COLORS.white, fontSize: 15, fontWeight: "700" },
  dueEstimate: { color: COLORS.muted, fontSize: 12, marginTop: 2, lineHeight: 16 },
  sourceRow: { marginBottom: 16 },
  sourceLink: { color: COLORS.brand, fontSize: 13, fontWeight: "600" },
  reminderBtn: {
    backgroundColor: COLORS.brand,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
  },
  reminderBtnDisabled: { opacity: 0.4 },
  reminderBtnText: { color: "#000000", fontSize: 15, fontWeight: "800", letterSpacing: 0.5 },
  reminderSetRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
  },
  reminderSetText: { color: COLORS.body, fontSize: 13, flex: 1 },
  reminderCancel: {
    color: COLORS.muted,
    fontSize: 13,
    fontWeight: "600",
    textAlign: "center",
    marginTop: 10,
    textDecorationLine: "underline",
  },
});
