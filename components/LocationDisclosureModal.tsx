import { Linking, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { PRIVACY_POLICY_URL } from "../lib/config";

interface Props {
  visible: boolean;
  onAllow: () => void;
  onDeny: () => void;
}

export function LocationDisclosureModal({ visible, onAllow, onDeny }: Props) {
  const { t } = useTranslation();
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onDeny}
    >
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Text style={styles.icon}>📍</Text>
          <Text style={styles.title}>{t("locationDisclosure.title")}</Text>
          <Text style={styles.body}>{t("locationDisclosure.body")}</Text>
          <Pressable
            onPress={() => Linking.openURL(PRIVACY_POLICY_URL).catch(() => null)}
            accessibilityRole="link"
            accessibilityLabel={t("locationDisclosure.privacyPolicy")}
          >
            <Text style={styles.privacyLink}>{t("locationDisclosure.privacyPolicy")}</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.allowBtn, pressed && styles.allowBtnPressed]}
            onPress={onAllow}
            accessibilityRole="button"
            accessibilityLabel={t("locationDisclosure.allow")}
          >
            <Text style={styles.allowBtnText}>{t("locationDisclosure.allow")}</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.denyBtn, pressed && styles.denyBtnPressed]}
            onPress={onDeny}
            accessibilityRole="button"
            accessibilityLabel={t("locationDisclosure.deny")}
          >
            <Text style={styles.denyBtnText}>{t("locationDisclosure.deny")}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.80)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  card: {
    backgroundColor: "#1a1a1a",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,102,0,0.4)",
    padding: 24,
    width: "100%",
    maxWidth: 420,
    alignItems: "center",
  },
  icon: {
    fontSize: 40,
    marginBottom: 12,
  },
  title: {
    color: "#ff6600",
    fontSize: 18,
    fontWeight: "800",
    letterSpacing: 0.5,
    textAlign: "center",
    marginBottom: 16,
  },
  body: {
    color: "#c8c8c8",
    fontSize: 15,
    lineHeight: 22,
    textAlign: "center",
    marginBottom: 12,
  },
  privacyLink: {
    color: "#ff6600",
    fontSize: 13,
    textDecorationLine: "underline",
    textAlign: "center",
    marginBottom: 20,
  },
  allowBtn: {
    backgroundColor: "#ff6600",
    paddingVertical: 13,
    borderRadius: 10,
    alignItems: "center",
    width: "100%",
    marginBottom: 10,
    shadowColor: "#ff6600",
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  allowBtnPressed: { backgroundColor: "#e05500" },
  allowBtnText: {
    color: "#000000",
    fontSize: 16,
    fontWeight: "800",
    letterSpacing: 0.8,
  },
  denyBtn: {
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
    width: "100%",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
  },
  denyBtnPressed: { backgroundColor: "rgba(255,255,255,0.08)" },
  denyBtnText: {
    color: "#888888",
    fontSize: 15,
    fontWeight: "600",
  },
});
