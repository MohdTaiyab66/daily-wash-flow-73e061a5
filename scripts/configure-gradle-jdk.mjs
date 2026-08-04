import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const javaHome = process.env.JAVA_HOME;

if (!javaHome) {
  console.error("[android-build] JAVA_HOME is not set; Gradle cannot find a JDK");
  process.exit(1);
}

const javacPath = join(javaHome, "bin", process.platform === "win32" ? "javac.exe" : "javac");
if (!existsSync(javacPath)) {
  console.error(`[android-build] JAVA_HOME does not point to a full JDK: ${javaHome}`);
  process.exit(1);
}

const androidDir = "android";
if (!existsSync(androidDir)) {
  console.error("[android-build] missing android/ folder; run Capacitor sync before configuring Gradle JDK");
  process.exit(1);
}

// Never persist machine-specific paths into project files.
// Gradle picks up the JDK from JAVA_HOME in this process; Java 21 toolchain
// selection stays declared in android/build.gradle.
const gradlePropertiesPath = join(androidDir, "gradle.properties");
if (existsSync(gradlePropertiesPath)) {
  const original = await readFile(gradlePropertiesPath, "utf8");
  const cleaned = original
    .split(/\r?\n/)
    .filter((line) => !/^\s*org\.gradle\.java\.home\s*=/.test(line))
    .join("\n");
  if (cleaned !== original) {
    await writeFile(gradlePropertiesPath, `${cleaned.replace(/\n+$/, "")}\n`, "utf8");
    console.log("[android-build] removed machine-specific org.gradle.java.home from android/gradle.properties");
  }
}

console.log(`[android-build] using JDK from JAVA_HOME (process only): ${javaHome}`);
