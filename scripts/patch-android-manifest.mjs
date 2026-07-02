import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";

const file = "android/app/src/main/AndroidManifest.xml";
if (!existsSync(file)) {
  console.log(`[android-manifest] skipped: ${file} not found`);
  process.exit(0);
}

let xml = await readFile(file, "utf8");

const permissions = [
  "android.permission.ACCESS_FINE_LOCATION",
  "android.permission.ACCESS_COARSE_LOCATION",
  "android.permission.CAMERA",
  "android.permission.POST_NOTIFICATIONS",
];

for (const name of permissions) {
  if (!xml.includes(`android:name=\"${name}\"`)) {
    xml = xml.replace(/(<manifest\b[^>]*>)/, `$1\n    <uses-permission android:name=\"${name}\" />`);
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

await writeFile(file, xml);
console.log("[android-manifest] native permissions and maps intents verified");