// ── Shared place-info modal ───────────────────────────────────────────────────
// The details popup shown when a user taps ⓘ on a POI row. Used by POIScreen
// (restaurants / hotels / attractions) and the MC garage screen so the modal
// markup and its styles live in one place instead of being duplicated per screen.

import { type ReactNode } from "react";
import { Linking, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { parseWikiTag } from "../lib/overpass";
import { type Place } from "../lib/usePOIFetch";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const Haptics: typeof import("expo-haptics") | null = (() => { try { return require("expo-haptics"); } catch { return null; } })();

const hapticLight = () =>
  Haptics?.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => null);

export interface PlaceInfoModalProps {
  /** The place to show, or null to hide the modal. */
  place: Place | null;
  /** Wikipedia extract text (null when unavailable / not loaded). */
  wikiExtract: string | null;
  /** Whether the Wikipedia extract is still loading. */
  wikiLoading: boolean;
  /** Called when the user dismisses the modal. */
  onClose: () => void;
  /** Label for the primary maps action button. Defaults to "Reviews on Google". */
  mapsButtonLabel?: string;
  /** Formats the category value shown in the category row. Defaults to the raw string. */
  formatCategoryLabel?: (category: string) => string;
  /** Formats the note value (e.g. MC "FREE_PARKING" → localized text). Defaults to the raw string. */
  formatNote?: (note: string) => string;
  /** Extra rows rendered after the category/note rows (e.g. hotel stars). */
  renderExtraRows?: (place: Place) => ReactNode;
}

export default function PlaceInfoModal({
  place,
  wikiExtract,
  wikiLoading,
  onClose,
  mapsButtonLabel,
  formatCategoryLabel,
  formatNote,
  renderExtraRows,
}: PlaceInfoModalProps) {
  const { t } = useTranslation();

  const close = () => { hapticLight(); onClose(); };
  const categoryLabel = place && (formatCategoryLabel ? formatCategoryLabel(place.category) : place.category);

  const hasContactInfo =
    !!place?.phone || !!place?.website || !!place?.openingHours ||
    !!place?.email || !!place?.address || !!place?.fuelTypes?.length;

  return (
    <Modal
      visible={place !== null}
      transparent
      animationType="fade"
      onRequestClose={close}
    >
      <Pressable style={styles.modalOverlay} onPress={close}>
        <Pressable style={styles.modalCard} onPress={() => {}}>
          <Text style={styles.modalTitle}>{place?.name}</Text>

          <View style={styles.modalRow}>
            <Text style={styles.modalLabel}>{t("common.category")}</Text>
            <Text style={styles.modalValue}>{categoryLabel}</Text>
          </View>

          {place?.note && (
            <View style={styles.modalRow}>
              <Text style={styles.modalLabel}>{t("common.note")}</Text>
              <Text style={styles.modalValue}>{formatNote ? formatNote(place.note) : place.note}</Text>
            </View>
          )}

          {renderExtraRows && place ? renderExtraRows(place) : null}

          {place?.phone && (
            <View style={styles.modalRow}>
              <Text style={styles.modalLabel}>{t("common.phone")}</Text>
              <Text
                style={styles.modalLink}
                onPress={() => { hapticLight(); Linking.openURL(`tel:${place.phone}`).catch(() => null); }}
              >
                {place.phone}
              </Text>
            </View>
          )}

          {place?.email && (
            <View style={styles.modalRow}>
              <Text style={styles.modalLabel}>{t("common.email")}</Text>
              <Text
                style={styles.modalLink}
                onPress={() => { hapticLight(); Linking.openURL(`mailto:${place.email}`).catch(() => null); }}
                numberOfLines={1}
              >
                {place.email}
              </Text>
            </View>
          )}

          {place?.address && (
            <View style={styles.modalRow}>
              <Text style={styles.modalLabel}>{t("common.address")}</Text>
              <Text style={styles.modalValue}>{place.address}</Text>
            </View>
          )}

          {place?.website && (
            <View style={styles.modalRow}>
              <Text style={styles.modalLabel}>{t("common.website")}</Text>
              <Text
                style={styles.modalLink}
                onPress={() => { hapticLight(); Linking.openURL(place.website!).catch(() => null); }}
                numberOfLines={1}
              >
                {place.website.replace(/^https?:\/\/(www\.)?/, "")}
              </Text>
            </View>
          )}

          {place?.openingHours && (
            <View style={styles.modalRow}>
              <Text style={styles.modalLabel}>{t("common.hours")}</Text>
              <Text style={styles.modalValue}>{place.openingHours}</Text>
            </View>
          )}

          {place?.fuelTypes && place.fuelTypes.length > 0 && (
            <View style={styles.modalRow}>
              <Text style={styles.modalLabel}>{t("common.fuelTypes")}</Text>
              <View style={styles.fuelTypesRow}>
                {place.fuelTypes.map((ft) => (
                  <View key={ft} style={styles.fuelTypeBadge}>
                    <Text style={styles.fuelTypeBadgeText}>{ft}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {!hasContactInfo && (
            <Text style={styles.modalNoInfo}>{t("common.noContactInfo")}</Text>
          )}

          {place?.wikipedia && wikiLoading && (
            <Text style={styles.modalLoadingText}>{t("common.wikiLoading")}</Text>
          )}

          {wikiExtract && (
            <View style={styles.modalWikiSection}>
              <Text style={styles.modalWikiLabel}>{t("common.wikiLabel")}</Text>
              <Text style={styles.modalWikiExtract} numberOfLines={5}>{wikiExtract}</Text>
            </View>
          )}

          <View style={styles.modalActions}>
            <Pressable
              style={styles.modalActionButton}
              onPress={() => { hapticLight(); Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place?.name ?? "")}`).catch(() => null); }}
            >
              <Text style={styles.modalActionButtonText}>{mapsButtonLabel ?? t("common.reviewsGoogle")}</Text>
            </Pressable>
            {place?.wikipedia && (
              <Pressable
                style={[styles.modalActionButton, styles.modalActionButtonWiki]}
                onPress={() => {
                  hapticLight();
                  const { lang, title } = parseWikiTag(place.wikipedia!);
                  Linking.openURL(`https://${lang}.wikipedia.org/wiki/${encodeURIComponent(title)}`).catch(() => null);
                }}
              >
                <Text style={[styles.modalActionButtonText, styles.modalActionButtonTextWiki]}>{t("common.readWikipedia")}</Text>
              </Pressable>
            )}
          </View>

          <Pressable style={styles.modalClose} onPress={close}>
            <Text style={styles.modalCloseText}>{t("common.close")}</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  modalCard: {
    backgroundColor: "#141414",
    borderRadius: 10,
    padding: 22,
    width: "100%",
    borderWidth: 1,
    borderColor: "#2a2a2a",
    gap: 12,
  },
  modalTitle: {
    color: "#ffffff",
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 4,
  },
  modalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },
  modalLabel: {
    color: "#666666",
    fontSize: 13,
  },
  modalValue: {
    color: "#c8c8c8",
    fontSize: 13,
    fontWeight: "500",
    flexShrink: 1,
    textAlign: "right",
  },
  modalLink: {
    color: "#ff6600",
    fontSize: 13,
    fontWeight: "500",
    flexShrink: 1,
    textAlign: "right",
    textDecorationLine: "underline",
  },
  modalNoInfo: {
    color: "#555555",
    fontSize: 13,
    fontStyle: "italic",
  },
  modalLoadingText: {
    color: "#666666",
    fontSize: 13,
    fontStyle: "italic",
  },
  modalWikiSection: {
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 8,
    padding: 10,
    gap: 4,
  },
  modalWikiLabel: {
    color: "#94a3b8",
    fontSize: 12,
    fontWeight: "600",
  },
  modalWikiExtract: {
    color: "#94a3b8",
    fontSize: 12,
    lineHeight: 18,
    fontStyle: "italic",
  },
  modalActions: {
    gap: 8,
  },
  modalActionButton: {
    backgroundColor: "rgba(255,102,0,0.12)",
    borderRadius: 6,
    paddingVertical: 10,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255,102,0,0.4)",
  },
  modalActionButtonWiki: {
    backgroundColor: "rgba(250,204,21,0.1)",
    borderColor: "rgba(250,204,21,0.3)",
  },
  modalActionButtonText: {
    color: "#ff6600",
    fontSize: 14,
    fontWeight: "600",
  },
  modalActionButtonTextWiki: {
    color: "#fbbf24",
  },
  fuelTypesRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
    marginTop: 4,
  },
  fuelTypeBadge: {
    backgroundColor: "rgba(34,197,94,0.12)",
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: "rgba(34,197,94,0.35)",
  },
  fuelTypeBadgeText: {
    color: "#22c55e",
    fontSize: 11,
    fontWeight: "700",
  },
  modalClose: {
    marginTop: 8,
    backgroundColor: "#ff6600",
    borderRadius: 6,
    paddingVertical: 10,
    alignItems: "center",
  },
  modalCloseText: {
    color: "#000000",
    fontWeight: "800",
    fontSize: 15,
  },
});
