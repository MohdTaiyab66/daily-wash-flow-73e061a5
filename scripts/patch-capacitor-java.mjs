import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";

const capacitorGradleFile = "node_modules/@capacitor/android/capacitor/build.gradle";

if (!existsSync(capacitorGradleFile)) {
  console.log("[capacitor-java] skipped: @capacitor/android is not installed yet");
  process.exit(0);
}

const source = await readFile(capacitorGradleFile, "utf8");
const patched = source
  .replace(/sourceCompatibility JavaVersion\.VERSION_21/g, "sourceCompatibility JavaVersion.VERSION_17")
  .replace(/targetCompatibility JavaVersion\.VERSION_21/g, "targetCompatibility JavaVersion.VERSION_17");

if (patched !== source) {
  await writeFile(capacitorGradleFile, patched, "utf8");
  console.log("[capacitor-java] patched @capacitor/android Java level: VERSION_21 → VERSION_17");
} else if (patched.includes("JavaVersion.VERSION_17")) {
  console.log("[capacitor-java] @capacitor/android Java level already VERSION_17");
} else {
  console.log("[capacitor-java] no Java 21 setting found in @capacitor/android");
}