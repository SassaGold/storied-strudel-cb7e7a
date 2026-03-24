import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";

/** Wraps each tab icon to add a coloured top-bar indicator when focused */
function TabIcon({
  name,
  color,
  focused,
}: {
  name: React.ComponentProps<typeof Ionicons>["name"];
  color: string;
  focused: boolean;
}) {
  return (
    <View style={{ alignItems: "center", justifyContent: "center", paddingTop: 2 }}>
      {focused && (
        <View
          style={{
            position: "absolute",
            top: -10,
            width: 26,
            height: 3,
            borderRadius: 2,
            backgroundColor: color,
            shadowColor: color,
            shadowOpacity: 0.9,
            shadowRadius: 6,
            elevation: 6,
          }}
        />
      )}
      <Ionicons name={name} size={26} color={color} />
    </View>
  );
}

export default function TabLayout() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: "#ff6600",
        tabBarInactiveTintColor: "#555555",
        tabBarStyle: {
          backgroundColor: "#0a0a0a",
          borderTopColor: "#ff6600",
          borderTopWidth: 2,
          height: 64 + insets.bottom,
          paddingBottom: 8 + insets.bottom,
          paddingTop: 4,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: "700",
          letterSpacing: 0.5,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t("tabs.home"),
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name="compass" color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="restaurants"
        options={{
          title: t("tabs.food"),
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name="restaurant" color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="hotels"
        options={{
          title: t("tabs.sleep"),
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name="bed" color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="attractions"
        options={{
          title: t("tabs.explore"),
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name="flag" color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="mc"
        options={{
          title: t("tabs.garage"),
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name="speedometer" color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="triplogger"
        options={{
          title: t("tabs.trip"),
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name="navigate" color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="about"
        options={{ href: null }}
      />
      <Tabs.Screen
        name="settings"
        options={{ href: null }}
      />
      <Tabs.Screen
        name="emergency"
        options={{
          title: t("tabs.sos"),
          tabBarActiveTintColor: "#ef4444",
          tabBarIcon: ({ focused }) => (
            <TabIcon
              name="alert-circle"
              color={focused ? "#ef4444" : "#555555"}
              focused={focused}
            />
          ),
        }}
      />
    </Tabs>
  );
}
