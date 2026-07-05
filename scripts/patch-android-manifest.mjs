import { readFile, writeFile, mkdir, copyFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";

const manifest = "android/app/src/main/AndroidManifest.xml";
if (!existsSync(manifest)) {
  console.log(`[android-manifest] skipped: ${manifest} not found`);
  process.exit(0);
}

let xml = await readFile(manifest, "utf8");

const permissions = [
  "android.permission.ACCESS_FINE_LOCATION",
  "android.permission.ACCESS_COARSE_LOCATION",
  "android.permission.CAMERA",
  "android.permission.POST_NOTIFICATIONS",
  "android.permission.USE_FULL_SCREEN_INTENT",
  "android.permission.WAKE_LOCK",
  "android.permission.VIBRATE",
  "android.permission.RECEIVE_BOOT_COMPLETED",
  "android.permission.INTERNET",
];

for (const name of permissions) {
  if (!xml.includes(`android:name="${name}"`)) {
    xml = xml.replace(/(<manifest\b[^>]*>)/, `$1\n    <uses-permission android:name="${name}" />`);
  }
}

if (!xml.includes("com.google.android.apps.maps")) {
  const queries = `
    <queries>
        <package android:name="com.google.android.apps.maps" />
        <intent>
            <action android:name="android.intent.action.VIEW" />
            <data android:scheme="geo" />
        </intent>
        <intent>
            <action android:name="android.intent.action.VIEW" />
            <data android:scheme="google.navigation" />
        </intent>
    </queries>
`;
  xml = xml.replace("<application", `${queries}\n    <application`);
}

// Register the marketplace FCM service + accept/decline receiver.
if (!xml.includes("com.urbanwash.push.UrbanwashMessagingService")) {
  const svc = `
        <service
            android:name="com.urbanwash.push.UrbanwashMessagingService"
            android:exported="false">
            <intent-filter>
                <action android:name="com.google.firebase.MESSAGING_EVENT" />
            </intent-filter>
        </service>
        <receiver
            android:name="com.urbanwash.push.OfferActionReceiver"
            android:exported="false" />
`;
  xml = xml.replace(/(<\/application>)/, `${svc}    $1`);
}

await writeFile(manifest, xml);
console.log("[android-manifest] permissions, maps intents and offer service verified");

// Copy Kotlin sources into the package directory.
const pkgDir = "android/app/src/main/java/com/urbanwash/push";
await mkdir(pkgDir, { recursive: true });
const kotlinSrc = "android-native/kotlin";
if (existsSync(kotlinSrc)) {
  for (const file of await readdir(kotlinSrc)) {
    if (!file.endsWith(".kt")) continue;
    await copyFile(join(kotlinSrc, file), join(pkgDir, file));
  }
  console.log(`[android-manifest] copied Kotlin sources → ${pkgDir}`);
}

// Copy custom sound if present.
const soundSrc = "android-native/res/raw/uw_offer.mp3";
if (existsSync(soundSrc)) {
  const dst = "android/app/src/main/res/raw/uw_offer.mp3";
  await mkdir(dirname(dst), { recursive: true });
  await copyFile(soundSrc, dst);
  console.log("[android-manifest] copied custom offer sound");
} else {
  console.log("[android-manifest] uw_offer.mp3 not found — channel will use default sound");
}
