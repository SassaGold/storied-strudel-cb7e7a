import { useState, useCallback } from "react";
import {
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Location from "expo-location";

const Haptics = (() => {
  try { return require("expo-haptics"); } catch { return null; }
})();

export default function EmergencyScreen() {
  const insets = useSafeAreaInsets();
  const [torchOn, setTorchOn] = useState(false);
  const [instructionsVisible, setInstructionsVisible] = useState(false);
  const [locationText, setLocationText] = useState<string | null>(null);

  const callSOS = useCallback(() => {
    Haptics?.impactAsync?.(Haptics?.ImpactFeedbackStyle?.Heavy);
    Linking.openURL("tel:112").catch(() => null);
  }, []);

  const shareLocation = useCallback(async () => {
    Haptics?.impactAsync?.(Haptics?.ImpactFeedbackStyle?.Medium);
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (perm.status === "denied") {
        setLocationText("Location permission denied.");
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const { latitude, longitude } = pos.coords;
      const mapsUrl = `https://www.google.com/maps?q=${latitude},${longitude}`;
      setLocationText(`📍 ${latitude.toFixed(5)}, ${longitude.toFixed(5)}`);
      Linking.openURL(mapsUrl).catch(() => null);
    } catch {
      setLocationText("Unable to get location.");
    }
  }, []);

  const toggleTorch = useCallback(() => {
    Haptics?.impactAsync?.(Haptics?.ImpactFeedbackStyle?.Light);
    setTorchOn((v) => !v);
  }, []);

  const showInstructions = useCallback(() => {
    Haptics?.impactAsync?.(Haptics?.ImpactFeedbackStyle?.Light);
    setInstructionsVisible(true);
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: "#0f0a1a" }}>
      {/* Torch overlay */}
      {torchOn && (
        <Pressable style={styles.torchOverlay} onPress={toggleTorch}>
          <Text style={styles.torchText}>TAP TO DISMISS</Text>
        </Pressable>
      )}

      <ScrollView contentContainerStyle={[styles.container, { paddingTop: insets.top + 20 }]}>
        {/* Header */}
        <View style={styles.headerBanner}>
          <View style={styles.headerGlow} />
          <Text style={styles.headerBadge}>Emergency</Text>
          <Text style={styles.headerTitle}>🆘 SOS</Text>
          <Text style={styles.headerSub}>Quick access to emergency resources</Text>
        </View>

        {/* Big SOS button */}
        <Pressable style={styles.sosButton} onPress={callSOS}>
          <Text style={styles.sosButtonText}>🆘  CALL 112</Text>
          <Text style={styles.sosButtonSub}>Tap to call emergency services</Text>
        </Pressable>

        {/* Location text */}
        {locationText && (
          <View style={styles.locationBadge}>
            <Text style={styles.locationText}>{locationText}</Text>
          </View>
        )}

        {/* Quick actions grid */}
        <Text style={styles.sectionLabel}>Quick Actions</Text>
        <View style={styles.quickActionsGrid}>
          <Pressable style={[styles.quickBtn, { backgroundColor: "#7f1d1d" }]} onPress={callSOS}>
            <Text style={styles.quickBtnIcon}>📞</Text>
            <Text style={styles.quickBtnText}>Call 112</Text>
          </Pressable>
          <Pressable style={[styles.quickBtn, { backgroundColor: "#164e63" }]} onPress={shareLocation}>
            <Text style={styles.quickBtnIcon}>📍</Text>
            <Text style={styles.quickBtnText}>Share Location</Text>
          </Pressable>
          <Pressable style={[styles.quickBtn, { backgroundColor: "#1e3a5f" }]} onPress={toggleTorch}>
            <Text style={styles.quickBtnIcon}>🔦</Text>
            <Text style={styles.quickBtnText}>Torch Screen</Text>
          </Pressable>
          <Pressable style={[styles.quickBtn, { backgroundColor: "#3b1f5e" }]} onPress={showInstructions}>
            <Text style={styles.quickBtnIcon}>📋</Text>
            <Text style={styles.quickBtnText}>Instructions</Text>
          </Pressable>
        </View>

        {/* Info card */}
        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>Emergency Tips</Text>
          <Text style={styles.infoText}>• Stay calm and assess the situation</Text>
          <Text style={styles.infoText}>• Call 112 for police, fire, or ambulance</Text>
          <Text style={styles.infoText}>• Share your exact GPS location</Text>
          <Text style={styles.infoText}>• Use torch screen to signal for help</Text>
          <Text style={styles.infoText}>• Keep your phone charged on long rides</Text>
        </View>
      </ScrollView>

      {/* Instructions modal */}
      <Modal
        visible={instructionsVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setInstructionsVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>First Aid & Emergency Instructions</Text>
            <ScrollView style={{ maxHeight: 400 }}>
              <Text style={styles.modalSection}>🏍️ Motorcycle Accident</Text>
              <Text style={styles.modalText}>1. Do NOT remove the rider's helmet unless breathing is obstructed.</Text>
              <Text style={styles.modalText}>2. Call 112 immediately.</Text>
              <Text style={styles.modalText}>3. Keep the rider still — do not move them unless in immediate danger.</Text>
              <Text style={styles.modalText}>4. Apply pressure to any bleeding wounds using a clean cloth.</Text>

              <Text style={styles.modalSection}>💓 CPR (Basic)</Text>
              <Text style={styles.modalText}>1. Tilt head back, lift chin, check breathing.</Text>
              <Text style={styles.modalText}>2. Give 30 chest compressions (hard and fast).</Text>
              <Text style={styles.modalText}>3. Give 2 rescue breaths.</Text>
              <Text style={styles.modalText}>4. Repeat until help arrives.</Text>

              <Text style={styles.modalSection}>🩸 Severe Bleeding</Text>
              <Text style={styles.modalText}>1. Apply direct pressure with a cloth or bandage.</Text>
              <Text style={styles.modalText}>2. Elevate the injured limb if possible.</Text>
              <Text style={styles.modalText}>3. Do not remove embedded objects.</Text>
            </ScrollView>
            <Pressable style={styles.modalClose} onPress={() => setInstructionsVisible(false)}>
              <Text style={styles.modalCloseText}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 20,
    paddingBottom: 40,
  },
  headerBanner: {
    backgroundColor: "#450a0a",
    borderRadius: 18,
    padding: 16,
    marginBottom: 20,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(239,68,68,0.3)",
  },
  headerGlow: {
    position: "absolute",
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: "rgba(239,68,68,0.4)",
    top: -80,
    right: -60,
  },
  headerBadge: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(15,10,26,0.4)",
    color: "#fca5a5",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    fontSize: 12,
    fontWeight: "600",
    marginBottom: 8,
    letterSpacing: 0.5,
  },
  headerTitle: {
    color: "#f8fafc",
    fontSize: 32,
    fontWeight: "800",
    letterSpacing: 0.3,
  },
  headerSub: {
    color: "#fca5a5",
    fontSize: 14,
    marginTop: 4,
  },
  sosButton: {
    backgroundColor: "#dc2626",
    borderRadius: 20,
    paddingVertical: 22,
    alignItems: "center",
    marginBottom: 16,
    shadowColor: "#ef4444",
    shadowOpacity: 0.5,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.15)",
  },
  sosButtonText: {
    color: "#fff",
    fontSize: 26,
    fontWeight: "800",
    letterSpacing: 2,
  },
  sosButtonSub: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 13,
    marginTop: 4,
  },
  locationBadge: {
    backgroundColor: "#1e293b",
    borderRadius: 10,
    padding: 10,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#334155",
  },
  locationText: {
    color: "#94a3b8",
    fontSize: 13,
  },
  sectionLabel: {
    color: "#94a3b8",
    fontSize: 13,
    fontWeight: "600",
    letterSpacing: 1,
    textTransform: "uppercase",
    marginBottom: 10,
  },
  quickActionsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginBottom: 20,
  },
  quickBtn: {
    width: "47%",
    borderRadius: 14,
    padding: 16,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  quickBtnIcon: {
    fontSize: 28,
    marginBottom: 6,
  },
  quickBtnText: {
    color: "#f8fafc",
    fontSize: 14,
    fontWeight: "600",
    textAlign: "center",
  },
  infoCard: {
    backgroundColor: "#1b1030",
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: "#2d1b4d",
  },
  infoTitle: {
    color: "#f8fafc",
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 10,
  },
  infoText: {
    color: "#cbd5e1",
    fontSize: 14,
    marginBottom: 6,
    lineHeight: 20,
  },
  torchOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#ffffff",
    zIndex: 1000,
    justifyContent: "flex-end",
    alignItems: "center",
    paddingBottom: 60,
  },
  torchText: {
    color: "#1e293b",
    fontSize: 14,
    fontWeight: "600",
    letterSpacing: 2,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "flex-end",
  },
  modalSheet: {
    backgroundColor: "#1b1030",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingBottom: 40,
    borderTopWidth: 1,
    borderColor: "#2d1b4d",
  },
  modalHandle: {
    width: 40,
    height: 4,
    backgroundColor: "#4b5563",
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 16,
  },
  modalTitle: {
    color: "#f8fafc",
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 16,
  },
  modalSection: {
    color: "#f59e0b",
    fontSize: 15,
    fontWeight: "700",
    marginTop: 14,
    marginBottom: 6,
  },
  modalText: {
    color: "#cbd5e1",
    fontSize: 14,
    marginBottom: 4,
    lineHeight: 20,
  },
  modalClose: {
    backgroundColor: "#374151",
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
    marginTop: 20,
  },
  modalCloseText: {
    color: "#f8fafc",
    fontSize: 16,
    fontWeight: "600",
  },
});
