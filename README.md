# Welcome to your Expo app 👋

This is an [Expo](https://expo.dev) project created with [`create-expo-app`](https://www.npmjs.com/package/create-expo-app).

## Get started

1. Install dependencies

   ```bash
   npm install
   ```

2. Start the app

   ```bash
   npx expo start
   ```

In the output, you'll find options to open the app in a

- [development build](https://docs.expo.dev/develop/development-builds/introduction/)
- [Android emulator](https://docs.expo.dev/workflow/android-studio-emulator/)
- [iOS simulator](https://docs.expo.dev/workflow/ios-simulator/)
- [Expo Go](https://expo.dev/go), a limited sandbox for trying out app development with Expo

You can start developing by editing the files inside the **app** directory. This project uses [file-based routing](https://docs.expo.dev/router/introduction).

## Testing on iPhone Simulator

> **macOS only** — The iPhone Simulator is built into Xcode and runs exclusively on macOS.  
> It cannot run on Windows or Linux PCs. If you are on Windows/Linux, see the
> [EAS cloud build option](#eas-cloud-build-for-simulator) below.

This app uses native modules (`react-native-maps`, `expo-location`, background location)
that are **not** supported in the standard Expo Go sandbox.
You must use a **development build** to test on the simulator.

### Option A — local build (macOS + Xcode required)

1. Install [Xcode](https://developer.apple.com/xcode/) from the Mac App Store and open it once to accept the licence.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Build and launch the app directly on the iOS Simulator:
   ```bash
   npm run ios
   # or
   npx expo run:ios
   ```
   Expo will compile a debug build, install it in the simulator, and open it automatically.

4. **Simulating GPS location** — The simulator has no real GPS.  
   Set a simulated location from the Xcode menu:  
   `Simulator → Features → Location → Custom Location…`  
   (or choose one of the preset cities such as *Apple* or *San Francisco*).  
   All location-dependent features (restaurant search, trip logger, etc.) will then work normally.

### Option B — EAS cloud build for simulator

If you are on macOS but prefer not to install Xcode locally, or if you just want a
pre-built `.app` you can share with other Mac users:

```bash
npx eas build --profile development-simulator --platform ios
```

Once the build finishes, EAS will give you a download link for a `.tar.gz` containing
the `.app` bundle. Unzip it, then drag the `.app` file onto an open Simulator window
(or use `xcrun simctl install booted <path-to.app>`).

> **Windows / Linux users** — The iPhone Simulator cannot run on your operating system.
> Your options are:
> - Test on a **physical iPhone** using a development build distributed via EAS
>   (`npx eas build --profile development --platform ios`).
> - Test using the **Android emulator** (`npm run android`) — see the
>   [Android Studio emulator guide](https://docs.expo.dev/workflow/android-studio-emulator/).
> - Test in a **web browser** (`npm run web`) — most UI and logic works, but native
>   maps and GPS features are limited.

## Get a fresh project

When you're ready, run:

```bash
npm run reset-project
```

This command will move the starter code to the **app-example** directory and create a blank **app** directory where you can start developing.

## Learn more

To learn more about developing your project with Expo, look at the following resources:

- [Expo documentation](https://docs.expo.dev/): Learn fundamentals, or go into advanced topics with our [guides](https://docs.expo.dev/guides).
- [Learn Expo tutorial](https://docs.expo.dev/tutorial/introduction/): Follow a step-by-step tutorial where you'll create a project that runs on Android, iOS, and the web.

## Join the community

Join our community of developers creating universal apps.

- [Expo on GitHub](https://github.com/expo/expo): View our open source platform and contribute.
- [Discord community](https://chat.expo.dev): Chat with Expo users and ask questions.
