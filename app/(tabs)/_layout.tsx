import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { View, StyleSheet } from "react-native";

type TabIconProps = {
  name: React.ComponentProps<typeof Ionicons>["name"];
  color: string;
  size: number;
  focused: boolean;
};

function TabIcon({ name, color, size, focused }: TabIconProps) {
  return (
    <View style={tabIconStyles.wrapper}>
      {focused && <View style={tabIconStyles.indicator} />}
      <Ionicons name={name} size={size} color={color} />
    </View>
  );
}

const tabIconStyles = StyleSheet.create({
  wrapper: {
    alignItems: "center",
    justifyContent: "center",
    width: 40,
    height: 40,
  },
  indicator: {
    position: "absolute",
    top: -10,
    width: 3,
    height: 14,
    backgroundColor: "#f97316",
    borderRadius: 2,
  },
});

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: "#f97316",
        tabBarInactiveTintColor: "#475569",
        tabBarStyle: {
          backgroundColor: "#0f0a1a",
          borderTopColor: "#1e293b",
          height: 64,
          paddingBottom: 8,
        },
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: "600",
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ color, size, focused }) => (
            <TabIcon name="compass" color={color} size={size} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="restaurants"
        options={{
          title: "Eat",
          tabBarIcon: ({ color, size, focused }) => (
            <TabIcon name="restaurant" color={color} size={size} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="hotels"
        options={{
          title: "Sleep",
          tabBarIcon: ({ color, size, focused }) => (
            <TabIcon name="bed" color={color} size={size} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="attractions"
        options={{
          title: "Explore",
          tabBarIcon: ({ color, size, focused }) => (
            <TabIcon name="camera" color={color} size={size} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="mc"
        options={{
          title: "MC",
          tabBarIcon: ({ color, size, focused }) => (
            <TabIcon name="bicycle" color={color} size={size} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="emergency"
        options={{
          title: "SOS",
          tabBarIcon: ({ color, size, focused }) => (
            <TabIcon name="alert-circle" color={color} size={size} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="triplogger"
        options={{
          title: "Trips",
          tabBarIcon: ({ color, size, focused }) => (
            <TabIcon name="speedometer" color={color} size={size} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: "Settings",
          tabBarIcon: ({ color, size, focused }) => (
            <TabIcon name="settings-sharp" color={color} size={size} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="about"
        options={{
          title: "About",
          tabBarIcon: ({ color, size, focused }) => (
            <TabIcon name="information-circle" color={color} size={size} focused={focused} />
          ),
        }}
      />
    </Tabs>
  );
}
