import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { View } from "react-native";

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: "#60a5fa",
        tabBarInactiveTintColor: "#475569",
        tabBarStyle: {
          backgroundColor: "#060f1b",
          borderTopColor: "#162035",
          borderTopWidth: 1,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: "600" },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="compass" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="restaurants"
        options={{
          title: "Restaurants",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="restaurant" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="hotels"
        options={{
          title: "Hotels",
          tabBarIcon: ({ color, size }) => (
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Ionicons name="bed" size={size * 0.7} color={color} />
              <Ionicons name="star" size={size * 0.5} color={color} style={{ marginLeft: -4 }} />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="attractions"
        options={{
          title: "Attractions",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="camera" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="mc"
        options={{
          title: "MC",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="bicycle" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
