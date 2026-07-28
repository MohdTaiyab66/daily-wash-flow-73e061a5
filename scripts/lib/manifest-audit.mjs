/**
 * Pure helpers for auditing a decoded (merged) AndroidManifest.
 */

/**
 * Returns every <service> in the merged manifest that owns an intent-filter
 * action of com.google.firebase.MESSAGING_EVENT. FCM dispatches a message to
 * exactly one such service, so more than one entry here is a delivery bug.
 */
export function findMessagingEventServices(elements) {
  const owners = [];
  let current = null;
  for (const el of elements) {
    if (el.name === "service") {
      current = { name: el.attrs["android:name"] ?? "(unnamed)", messagingEvent: false };
      owners.push(current);
    } else if (["application", "activity", "activity-alias", "receiver", "provider"].includes(el.name)) {
      current = null;
    } else if (el.name === "action" && current) {
      if (el.attrs["android:name"] === "com.google.firebase.MESSAGING_EVENT") current.messagingEvent = true;
    }
  }
  return owners.filter((s) => s.messagingEvent).map((s) => s.name);
}
