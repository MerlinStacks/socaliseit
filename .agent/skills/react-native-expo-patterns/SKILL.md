---
name: react-native-expo-patterns
description: Master React Native and Expo development including native modules, navigation, gestures, and EAS Build. Use when building mobile apps or integrating native functionality.
---

# React Native & Expo Patterns

Expert guide for building production mobile apps with React Native and Expo.

## When to Use This Skill

- Building cross-platform mobile apps
- Integrating native modules
- Setting up EAS Build and Submit
- Implementing navigation patterns
- Adding gestures and animations

## Project Setup

```bash
# Create new Expo project
npx create-expo-app@latest my-app --template expo-template-blank-typescript

# Install common dependencies
npx expo install expo-router react-native-reanimated react-native-gesture-handler
npx expo install @react-native-async-storage/async-storage expo-secure-store
```

## App Configuration

```typescript
// app.config.ts
import { ExpoConfig, ConfigContext } from 'expo/config';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'My App',
  slug: 'my-app',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  splash: {
    image: './assets/splash.png',
    resizeMode: 'contain',
    backgroundColor: '#0a0a0a',
  },
  ios: {
    bundleIdentifier: 'com.mycompany.myapp',
    supportsTablet: true,
  },
  android: {
    package: 'com.mycompany.myapp',
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      backgroundColor: '#0a0a0a',
    },
  },
  plugins: [
    'expo-router',
    ['expo-build-properties', {
      android: { kotlinVersion: '1.9.0' },
    }],
  ],
});
```

## Expo Router Navigation

```typescript
// app/_layout.tsx
import { Stack } from 'expo-router';
import { ThemeProvider } from '@/providers/theme';

export default function RootLayout() {
  return (
    <ThemeProvider>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="modal" options={{ presentation: 'modal' }} />
      </Stack>
    </ThemeProvider>
  );
}

// app/(tabs)/_layout.tsx
import { Tabs } from 'expo-router';
import { Home, Settings } from 'lucide-react-native';

export default function TabLayout() {
  return (
    <Tabs>
      <Tabs.Screen
        name="index"
        options={{ title: 'Home', tabBarIcon: ({ color }) => <Home color={color} /> }}
      />
      <Tabs.Screen
        name="settings"
        options={{ title: 'Settings', tabBarIcon: ({ color }) => <Settings color={color} /> }}
      />
    </Tabs>
  );
}
```

## Secure Storage

```typescript
// lib/storage.ts
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const secureStorage = {
  async getItem(key: string): Promise<string | null> {
    return SecureStore.getItemAsync(key);
  },
  async setItem(key: string, value: string): Promise<void> {
    await SecureStore.setItemAsync(key, value);
  },
  async removeItem(key: string): Promise<void> {
    await SecureStore.deleteItemAsync(key);
  },
};

// For non-sensitive data
export const storage = {
  async getItem<T>(key: string): Promise<T | null> {
    const data = await AsyncStorage.getItem(key);
    return data ? JSON.parse(data) : null;
  },
  async setItem<T>(key: string, value: T): Promise<void> {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  },
};
```

## Reanimated Animations

```typescript
// components/animated-card.tsx
import Animated, { useAnimatedStyle, withSpring, useSharedValue } from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

export function AnimatedCard({ children }: { children: React.ReactNode }) {
  const scale = useSharedValue(1);
  const translateY = useSharedValue(0);

  const gesture = Gesture.Pan()
    .onBegin(() => { scale.value = withSpring(0.95); })
    .onUpdate((e) => { translateY.value = e.translationY; })
    .onEnd(() => {
      scale.value = withSpring(1);
      translateY.value = withSpring(0);
    });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }, { translateY: translateY.value }],
  }));

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View style={animatedStyle}>{children}</Animated.View>
    </GestureDetector>
  );
}
```

## EAS Build Configuration

```json
// eas.json
{
  "cli": { "version": ">= 5.0.0" },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal"
    },
    "preview": {
      "distribution": "internal",
      "android": { "buildType": "apk" }
    },
    "production": {
      "autoIncrement": true
    }
  },
  "submit": {
    "production": {
      "android": { "track": "internal" },
      "ios": { "appleId": "your@email.com" }
    }
  }
}
```

```bash
# Build commands
eas build --platform android --profile preview
eas build --platform ios --profile production
eas submit --platform ios --latest
```

## Platform-Specific Code

```typescript
// components/button.tsx
import { Platform, Pressable, Text, StyleSheet } from 'react-native';

export function Button({ title, onPress }: { title: string; onPress: () => void }) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.button,
        Platform.select({
          ios: pressed && styles.pressedIOS,
          android: {}, // Android has ripple
        }),
      ]}
      android_ripple={{ color: 'rgba(255,255,255,0.2)' }}
      onPress={onPress}
    >
      <Text style={styles.text}>{title}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { backgroundColor: '#8b5cf6', padding: 16, borderRadius: 12 },
  pressedIOS: { opacity: 0.8 },
  text: { color: 'white', textAlign: 'center', fontWeight: '600' },
});
```

## Push Notifications

```typescript
// lib/notifications.ts
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export async function registerForPushNotifications(): Promise<string | null> {
  const { status } = await Notifications.requestPermissionsAsync();
  if (status !== 'granted') return null;

  const token = await Notifications.getExpoPushTokenAsync({
    projectId: 'your-project-id',
  });

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Default',
      importance: Notifications.AndroidImportance.MAX,
    });
  }

  return token.data;
}
```

## Best Practices

1. **Use Expo SDK** - Leverage managed workflow when possible
2. **Lazy load screens** - Improve startup time
3. **Memoize components** - Prevent unnecessary re-renders
4. **Use Reanimated** - Run animations on UI thread
5. **Test on devices** - Simulators miss real-world issues
6. **Handle safe areas** - Account for notches and home indicators
