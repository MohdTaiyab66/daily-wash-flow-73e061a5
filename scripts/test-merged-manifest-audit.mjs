/**
 * Unit test for merged-manifest FCM ownership detection.
 * Run: node scripts/test-merged-manifest-audit.mjs
 */
import { findMessagingEventServices } from "./lib/manifest-audit.mjs";

const el = (name, androidName) => ({ name, attrs: androidName ? { "android:name": androidName } : {} });

const cases = [
  {
    label: "single owner (expected shipping state)",
    elements: [
      el("manifest"),
      el("application"),
      el("service", "com.urbanwash.push.UrbanwashMessagingService"),
      el("intent-filter"),
      el("action", "com.google.firebase.MESSAGING_EVENT"),
      el("receiver", "com.urbanwash.push.OfferActionReceiver"),
    ],
    expect: ["com.urbanwash.push.UrbanwashMessagingService"],
  },
  {
    label: "capacitor plugin services still merged in (regression)",
    elements: [
      el("manifest"),
      el("application"),
      el("service", "com.urbanwash.push.UrbanwashMessagingService"),
      el("intent-filter"),
      el("action", "com.google.firebase.MESSAGING_EVENT"),
      el("service", "io.capawesome.capacitorjs.plugins.firebase.messaging.MessagingService"),
      el("intent-filter"),
      el("action", "com.google.firebase.MESSAGING_EVENT"),
      el("service", "com.capacitorjs.plugins.pushnotifications.MessagingService"),
      el("intent-filter"),
      el("action", "com.google.firebase.MESSAGING_EVENT"),
    ],
    expect: [
      "com.urbanwash.push.UrbanwashMessagingService",
      "io.capawesome.capacitorjs.plugins.firebase.messaging.MessagingService",
      "com.capacitorjs.plugins.pushnotifications.MessagingService",
    ],
  },
  {
    label: "activity actions must not be attributed to a preceding service",
    elements: [
      el("service", "com.urbanwash.push.UrbanwashMessagingService"),
      el("activity", ".MainActivity"),
      el("intent-filter"),
      el("action", "com.google.firebase.MESSAGING_EVENT"),
    ],
    expect: [],
  },
];

let failed = 0;
for (const c of cases) {
  const got = findMessagingEventServices(c.elements);
  const ok = JSON.stringify(got) === JSON.stringify(c.expect);
  if (!ok) failed++;
  console.log(`${ok ? "[PASS]" : "[FAIL]"} ${c.label} -> ${JSON.stringify(got)}`);
}
console.log(failed ? `RESULT: FAIL (${failed})` : "RESULT: PASS");
process.exit(failed ? 1 : 0);
