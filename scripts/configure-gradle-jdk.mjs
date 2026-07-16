import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const javaHome = process.env.JAVA_HOME;

if (!javaHome) {
  console.error("[android-build] JAVA_HOME is not set; Gradle cannot be pinned to JDK 21");
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

const gradlePropertiesPath = join(androidDir, "gradle.properties");
const gradleJavaHome = javaHome.replaceAll("\\", "/");

let lines = [];
if (existsSync(gradlePropertiesPath)) {
  lines = (await readFile(gradlePropertiesPath, "utf8")).split(/\r?\n/);
}

const nextLines = lines.filter((line) => !/^\s*org\.gradle\.java\.home\s*=/.test(line));
nextLines.push(`org.gradle.java.home=${gradleJavaHome}`);

await mkdir(androidDir, { recursive: true });
await writeFile(gradlePropertiesPath, `${nextLines.filter(Boolean).join("\n")}\n`, "utf8");

console.log(`[android-build] Gradle pinned to JDK: ${gradleJavaHome}`);