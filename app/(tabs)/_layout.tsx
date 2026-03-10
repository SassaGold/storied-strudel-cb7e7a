import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";

export default function TabLayout() {
  const { t } = useTranslation();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: "#38bdf8",
        tabBarStyle: { backgroundColor: "#0f172a", borderTopColor: "#1e293b" },
      }}
    >
      <Tabs.Screen name="index" options={{ title: t("home"), tabBarIcon: ({ color, size }) => <Ionicons name="compass" size={size} color={color} /> }} />
      <Tabs.Screen name="restaurants" options={{ title: t("restaurants"), tabBarIcon: ({ color, size }) => <Ionicons name="restaurant" size={size} color={color} /> }} />
      <Tabs.Screen name="hotels" options={{ title: t("hotels"), tabBarIcon: ({ color, size }) => <Ionicons name="bed" size={size} color={color} /> }} />
      <Tabs.Screen name="attractions" options={{ title: t("attractions"), tabBarIcon: ({ color, size }) => <Ionicons name="camera" size={size} color={color} /> }} />
      <Tabs.Screen name="mc" options={{ title: t("mc"), tabBarIcon: ({ color, size }) => <Ionicons name="bicycle" size={size} color={color} /> }} />
      <Tabs.Screen name="emergency" options={{ title: t("emergency"), tabBarIcon: ({ color, size }) => <Ionicons name="warning" size={size} color={color} /> }} />
      <Tabs.Screen name="triplogger" options={{ title: t("triplogger"), tabBarIcon: ({ color, size }) => <Ionicons name="navigate" size={size} color={color} /> }} />
      <Tabs.Screen name="settings" options={{ title: t("settings"), tabBarIcon: ({ color, size }) => <Ionicons name="settings" size={size} color={color} /> }} />
      <Tabs.Screen name="about" options={{ title: t("about"), tabBarIcon: ({ color, size }) => <Ionicons name="information-circle" size={size} color={color} /> }} />
    </Tabs>
  );
}
