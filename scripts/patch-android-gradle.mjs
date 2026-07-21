import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";

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
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const priorRe = new RegExp(`${escapeRe(MARKER_BEGIN)}[\\s\\S]*?${escapeRe(MARKER_END)}\\n?`, "g");
gradle = gradle.replace(priorRe, "");

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
await writeFile(APP_GRADLE, gradle, "utf8");
console.log(`[android-gradle] pinned com.razorpay:checkout to ${PIN_VERSION} in ${APP_GRADLE}`);
