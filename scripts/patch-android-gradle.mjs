import { existsSync, readFileSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";

/**
 * Detect the Kotlin version the installed Capacitor plugins expect.
 * Each @capacitor/* Android module declares:
 *   ext.kotlin_version = project.hasProperty("kotlin_version") ? ... : '2.2.20'
 * We must load exactly that Kotlin Gradle plugin, otherwise their Kotlin
 * sources fail to compile.
 */
function readKotlinVersionFromPlugins() {
  const candidates = [
    "node_modules/@capacitor/geolocation/android/build.gradle",
    "node_modules/@capacitor/camera/android/build.gradle",
    "node_modules/@capacitor/filesystem/android/build.gradle",
    "node_modules/@capacitor/android/capacitor/build.gradle",
  ];
  for (const file of candidates) {
    if (!existsSync(file)) continue;
    const m = readFileSync(file, "utf8").match(/ext\.kotlin_version\s*=.*?'([\d.]+)'/);
    if (m) {
      console.log(`[android-gradle] detected Kotlin ${m[1]} from ${file}`);
      return m[1];
    }
  }
  console.log("[android-gradle] could not detect plugin Kotlin version; falling back to 2.2.20");
  return "2.2.20";
}

/**
 * Read the firebase-messaging version the installed @capacitor-firebase/messaging
 * plugin compiles against, so the app module links against the SAME SDK.
 */
function readFirebaseMessagingVersion() {
  const file = "node_modules/@capacitor-firebase/messaging/android/build.gradle";
  if (existsSync(file)) {
    const src = readFileSync(file, "utf8");
    const m =
      src.match(/firebaseMessagingVersion\s*=.*?:\s*'([\d.]+)'/) ||
      src.match(/com\.google\.firebase:firebase-messaging:([\d.]+)/);
    if (m) {
      console.log(`[android-gradle] detected firebase-messaging ${m[1]} from plugin`);
      return m[1];
    }
  }
  console.log("[android-gradle] could not detect firebase-messaging version; falling back to 25.0.1");
  return "25.0.1";
}

/**
 * Force-pin the resolved Razorpay Android Checkout SDK version and expose a
 * Gradle task that prints the actual resolved dependency version at build
 * time. This lets us prove the packaged SDK is the latest 1.6.x and not an
 * old transitive pin from the Capacitor plugin's dynamic `1.6.+` range.
 *
 * Usage: run after `cap sync android` so `android/app/build.gradle` exists.
 */
const APP_GRADLE = "android/app/build.gradle";
const PIN_VERSION = "1.6.41";
const MARKER_BEGIN = "// [uw-razorpay-pin BEGIN]";
const MARKER_END = "// [uw-razorpay-pin END]";

if (!existsSync(APP_GRADLE)) {
  console.log(`[android-gradle] skipped: ${APP_GRADLE} not found`);
  process.exit(0);
}

let gradle = await readFile(APP_GRADLE, "utf8");

// Remove any prior injection so we always write the current pin.
// Use plain string slicing instead of RegExp because the marker contains []
// and older exported copies failed under Node 24 when the marker was unescaped.
while (gradle.includes(MARKER_BEGIN) && gradle.includes(MARKER_END)) {
  const start = gradle.indexOf(MARKER_BEGIN);
  const end = gradle.indexOf(MARKER_END, start);
  if (start === -1 || end === -1) break;
  gradle = gradle.slice(0, start) + gradle.slice(end + MARKER_END.length).replace(/^\r?\n/, "");
}

const block = `
${MARKER_BEGIN}
configurations.all {
    resolutionStrategy {
        force 'com.razorpay:checkout:${PIN_VERSION}'
    }
}
dependencies {
    implementation 'com.razorpay:checkout:${PIN_VERSION}'
}
task printRazorpayResolved {
    doLast {
        configurations.findAll { it.canBeResolved }.each { cfg ->
            try {
                cfg.resolvedConfiguration.resolvedArtifacts.each { a ->
                    def id = a.moduleVersion.id
                    if (id.group == 'com.razorpay' && id.name == 'checkout') {
                        println "[uw-razorpay-resolved] " + cfg.name + " -> " + id.group + ":" + id.name + ":" + id.version
                    }
                }
            } catch (Exception ignored) {}
        }
    }
}
${MARKER_END}
`;

// Append to end of file (safest — cap-generated file has no stable anchor).
gradle = gradle.trimEnd() + "\n" + block + "\n";

// ─── Firebase Messaging SDK on the APP compile classpath ────────────────────
// Root cause of "Unresolved reference: FirebaseMessagingService":
// @capacitor-firebase/messaging declares
//   implementation "com.google.firebase:firebase-messaging:<v>"
// `implementation` (unlike `api`) is NOT exported to consumers, so the app
// module only sees `project(':capacitor-firebase-messaging')` and none of the
// Firebase classes. Our own UrbanwashMessagingService.kt imports those classes
// directly, therefore the app module must declare the dependency itself.
// We pin the exact same version the plugin compiles against to avoid a split.
const FIREBASE_MESSAGING_VERSION = readFirebaseMessagingVersion();
const FB_BEGIN = "// [uw-firebase BEGIN]";
const FB_END = "// [uw-firebase END]";
while (gradle.includes(FB_BEGIN) && gradle.includes(FB_END)) {
  const s = gradle.indexOf(FB_BEGIN);
  const e = gradle.indexOf(FB_END, s);
  if (s === -1 || e === -1) break;
  gradle = gradle.slice(0, s) + gradle.slice(e + FB_END.length).replace(/^\r?\n/, "");
}
const firebaseBlock = `
${FB_BEGIN}
dependencies {
    implementation "com.google.firebase:firebase-messaging:${FIREBASE_MESSAGING_VERSION}"
}
configurations.all {
    resolutionStrategy {
        force "com.google.firebase:firebase-messaging:${FIREBASE_MESSAGING_VERSION}"
    }
}
${FB_END}
`;
gradle = gradle.trimEnd() + "\n" + firebaseBlock + "\n";
console.log(`[android-gradle] injected Firebase Messaging dependency (${FIREBASE_MESSAGING_VERSION})`);

// ─── Kotlin support ─────────────────────────────────────────────────────────
// Capacitor's Android template is Java-only. Our FCM service + accept/decline
// receiver in android-native/kotlin/*.kt are copied into src/main/java, but
// without the Kotlin Gradle plugin they are silently ignored by javac and
// never land in classes.dex. Result: manifest declares
// com.urbanwash.push.UrbanwashMessagingService, FCM tries to instantiate it
// on boot, and Android throws ClassNotFoundException → app crash.
// Apply kotlin-android + stdlib so the .kt files actually compile.
// IMPORTANT: this must match the Kotlin version the bundled @capacitor/*
// plugins compile against (they default to ext.kotlin_version = '2.2.20').
// Only one Kotlin Gradle plugin can be loaded per build, so injecting an older
// version here (e.g. 1.9.24) makes :capacitor-geolocation / :capacitor-camera /
// :capacitor-filesystem fail with "compileDebugKotlin ... Compilation error".
const KOTLIN_VERSION = readKotlinVersionFromPlugins();
console.log("UW_DEBUG_PATCH_SCRIPT_2026");
const KOTLIN_APP_MARKER_BEGIN = "// [uw-kotlin BEGIN]";
const KOTLIN_APP_MARKER_END = "// [uw-kotlin END]";

while (gradle.includes(KOTLIN_APP_MARKER_BEGIN) && gradle.includes(KOTLIN_APP_MARKER_END)) {
  const s = gradle.indexOf(KOTLIN_APP_MARKER_BEGIN);
  const e = gradle.indexOf(KOTLIN_APP_MARKER_END, s);
  if (s === -1 || e === -1) break;
  gradle = gradle.slice(0, s) + gradle.slice(e + KOTLIN_APP_MARKER_END.length).replace(/^\r?\n/, "");
}

const kotlinAppBlock = `
${KOTLIN_APP_MARKER_BEGIN}
apply plugin: 'kotlin-android'
android {
    // Keep Kotlin's JVM target aligned with Java, otherwise AGP fails with
    // "Inconsistent JVM-target compatibility detected".
    kotlinOptions {
        jvmTarget = "21"
    }
}
dependencies {
    implementation "org.jetbrains.kotlin:kotlin-stdlib:${KOTLIN_VERSION}"
}
${KOTLIN_APP_MARKER_END}
`;
gradle = gradle.trimEnd() + "\n" + kotlinAppBlock + "\n";

await writeFile(APP_GRADLE, gradle, "utf8");
console.log(`[android-gradle] pinned com.razorpay:checkout to ${PIN_VERSION} in ${APP_GRADLE}`);
console.log(`[android-gradle] applied kotlin-android plugin + stdlib ${KOTLIN_VERSION}`);

// ─── Project-level buildscript: add Kotlin Gradle plugin classpath ──────────
const ROOT_GRADLE = "android/build.gradle";
if (existsSync(ROOT_GRADLE)) {
  let root = await readFile(ROOT_GRADLE, "utf8");
  const ROOT_BEGIN = "// [uw-kotlin-classpath BEGIN]";
  const ROOT_END = "// [uw-kotlin-classpath END]";
  while (root.includes(ROOT_BEGIN) && root.includes(ROOT_END)) {
    const s = root.indexOf(ROOT_BEGIN);
    const e = root.indexOf(ROOT_END, s);
    if (s === -1 || e === -1) break;
    root = root.slice(0, s) + root.slice(e + ROOT_END.length).replace(/^\r?\n/, "");
  }
  // Inject classpath inside buildscript { dependencies { ... } } and pin
  // rootProject.ext.kotlin_version so every @capacitor/* module resolves the
  // SAME Kotlin version as the app module (they read rootProject.ext first).
  const classpathLine = `        classpath "org.jetbrains.kotlin:kotlin-gradle-plugin:${KOTLIN_VERSION}"`;
  const injected = `${ROOT_BEGIN}\n${classpathLine}\n        ${ROOT_END}`;
  if (!/ext\.kotlin_version/.test(root)) {
    root = `ext.kotlin_version = '${KOTLIN_VERSION}'\n${root}`;
  } else {
    root = root.replace(/ext\.kotlin_version\s*=\s*['"][\d.]+['"]/g, `ext.kotlin_version = '${KOTLIN_VERSION}'`);
  }

  // Find `buildscript {` then its `dependencies {` and insert after the opening brace.
  const bsIdx = root.indexOf("buildscript");
  if (bsIdx !== -1) {
    const depIdx = root.indexOf("dependencies", bsIdx);
    if (depIdx !== -1) {
      const braceIdx = root.indexOf("{", depIdx);
      if (braceIdx !== -1) {
        root = root.slice(0, braceIdx + 1) + "\n" + injected + root.slice(braceIdx + 1);
        await writeFile(ROOT_GRADLE, root, "utf8");
        console.log(`[android-gradle] added Kotlin Gradle plugin classpath ${KOTLIN_VERSION} to ${ROOT_GRADLE}`);
      } else {
        console.error(`[android-gradle] could not locate buildscript.dependencies { in ${ROOT_GRADLE}`);
        process.exit(1);
      }
    } else {
      console.error(`[android-gradle] no dependencies block inside buildscript in ${ROOT_GRADLE}`);
      process.exit(1);
    }
  } else {
    console.error(`[android-gradle] no buildscript block in ${ROOT_GRADLE}`);
    process.exit(1);
  }
} else {
  console.log(`[android-gradle] skipped root gradle Kotlin classpath: ${ROOT_GRADLE} not found`);
}

