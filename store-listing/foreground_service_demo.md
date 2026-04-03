# Foreground Service Demo Video

Use this script to record the Google Play review video showing why the app needs `FOREGROUND_SERVICE_LOCATION`.

## Goal

Demonstrate that:
- The user explicitly starts Trip Logger.
- The app begins continuous ride tracking.
- Android shows a persistent foreground-service notification.
- Tracking continues while the device is locked or the app is backgrounded.
- The service stops when the user ends the recording.

## Recommended Length

30 to 45 seconds.

## Recording Script

1. Start on the Trip Logger tab with GPS enabled.
2. Show the idle state before recording starts.
3. Tap the Start button.
4. If prompted, grant foreground and background location permissions.
5. Wait until the Trip Logger UI shows that recording is active.
6. Pull down the Android notification shade.
7. Keep the notification visible long enough to read:
   - `Where Am I Trip Logger`
   - `Recording your ride in the background.`
8. Return to the app and briefly show that ride stats are updating.
9. Press the power button to lock the phone, or press Home to background the app.
10. Wake the phone and show that the foreground-service notification is still present.
11. Re-open the app and show that trip recording is still active.
12. Tap Stop to end the recording.
13. Pull down the notification shade again to show the notification has disappeared.

## What Reviewers Need To See

- Recording starts only after a clear user action.
- The foreground-service notification is persistent while background tracking is active.
- The app uses the service only for active trip recording.
- The service ends when the trip ends.

## Suggested Spoken Caption Or Submission Notes

"This video shows the user starting Trip Logger. When recording begins, the app starts Android background location updates and displays a persistent foreground-service notification. Tracking continues while the phone is locked or the app is in the background, and the service stops immediately when the user ends the trip."

## Android Capture Commands

If you want to record directly from a connected Android device with adb:

```powershell
adb devices
adb shell screenrecord /sdcard/whereami-foreground-service-demo.mp4
```

Record the flow above, then stop recording with `Ctrl+C` and pull the file:

```powershell
adb pull /sdcard/whereami-foreground-service-demo.mp4 .\store-listing\whereami-foreground-service-demo.mp4
```

## Submission Checklist For The Video

- The Trip Logger screen is visible before recording starts.
- The Start action is visible.
- The foreground-service notification text is readable.
- The device is locked or the app is backgrounded while tracking remains active.
- The Stop action is visible.
- The notification is gone after recording stops.