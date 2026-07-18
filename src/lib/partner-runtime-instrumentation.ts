import type { QueryClient } from "@tanstack/react-query";
import {
  PARTNER_APP_VERSION,
  PARTNER_BUILD_ID,
  PARTNER_BUILD_NUMBER,
  PARTNER_BUILD_TIME,
  PARTNER_GIT_SHA,
} from "@/lib/buildInfo";
import { popupDebug } from "@/lib/offer-popup-debug";

let installed = false;

function safeText(value: unknown) {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function patchMethod(target: any, name: string, label: string) {
  if (!target || typeof target[name] !== "function" || target[name].__uwPopupPatched) return;
  const original = target[name];
  const patched = function patchedPopupMethod(this: unknown, ...args: unknown[]) {
    const entry = popupDebug(label, {
      component: "global_runtime_patch",
      function: name,
      reason: `${label} called`,
      args: args.map((arg) => safeText(arg).slice(0, 500)),
    });
    // eslint-disable-next-line no-console
    console.trace(label, entry);
    return original.apply(this, args);
  };
  patched.__uwPopupPatched = true;
  target[name] = patched;
}

function installDomPopupObserver() {
  if (typeof window === "undefined" || typeof MutationObserver === "undefined") return;
  const seen = new WeakSet<Element>();
  const isOfferNode = (node: Element) => {
    const text = node.textContent?.replace(/\s+/g, " ").trim() ?? "";
    return /Incoming Customer|New Daily Shine Customer|Accept|Decline|Nearby area|₹17\/day|working days assignment/i.test(text);
  };

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const added of Array.from(mutation.addedNodes)) {
        if (!(added instanceof Element) || seen.has(added) || !isOfferNode(added)) continue;
        seen.add(added);
        const entry = popupDebug("GLOBAL_POPUP_DOM_DETECTED", {
          component: "MutationObserver",
          opened_by: "dom_node_inserted",
          timestamp: new Date().toISOString(),
          role: added.getAttribute("role"),
          data_state: added.getAttribute("data-state"),
          class_name: added.getAttribute("class"),
          text: added.textContent?.replace(/\s+/g, " ").trim().slice(0, 1500) ?? "",
        });
        // eslint-disable-next-line no-console
        console.trace("Popup opened", entry);
      }
    }
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
}

function installWindowPatches() {
  if (typeof window === "undefined") return;
  patchMethod((window as any).HTMLDialogElement?.prototype, "showModal", "showModal");
  patchMethod((window as any).HTMLDialogElement?.prototype, "show", "Dialog.show");
  patchMethod((window as any).HTMLDialogElement?.prototype, "close", "Dialog.close");
  patchMethod((window as any).Modal?.prototype, "open", "Modal.open");
  patchMethod((window as any).Dialog?.prototype, "show", "Dialog.show");
  patchMethod((window as any).BottomSheet?.prototype, "present", "BottomSheet.present");
  patchMethod((window as any).BottomSheetDialog?.prototype, "present", "BottomSheetDialog.present");
}

export function installPartnerRuntimeInstrumentation(queryClient: QueryClient) {
  if (installed) return;
  installed = true;

  // eslint-disable-next-line no-console
  console.info("PARTNER_BUILD", {
    PARTNER_BUILD: "partner",
    BUILD_NUMBER: PARTNER_BUILD_NUMBER,
    BUILD_VERSION: PARTNER_APP_VERSION,
    BUILD_ID: PARTNER_BUILD_ID,
    GIT_SHA: PARTNER_GIT_SHA,
    BUILD_TIME: PARTNER_BUILD_TIME,
    timestamp: new Date().toISOString(),
  });

  installWindowPatches();
  installDomPopupObserver();

  const patchedClient = queryClient as QueryClient & { __uwInvalidatePatched?: boolean };
  if (!patchedClient.__uwInvalidatePatched) {
    const originalInvalidate = queryClient.invalidateQueries.bind(queryClient);
    patchedClient.invalidateQueries = ((filters?: unknown, options?: unknown) => {
      const queryKey = (filters as { queryKey?: unknown } | undefined)?.queryKey ?? null;
      const entry = popupDebug("invalidateQueries", {
        component: "ReactQuery",
        function: "queryClient.invalidateQueries",
        reason: "global invalidateQueries patch",
        query_key: queryKey,
        timestamp: new Date().toISOString(),
      });
      // eslint-disable-next-line no-console
      console.trace("invalidateQueries", entry);
      return originalInvalidate(filters as never, options as never);
    }) as QueryClient["invalidateQueries"];
    patchedClient.__uwInvalidatePatched = true;
  }

  popupDebug("GLOBAL_REACT_PATCH_STATUS", {
    component: "global_runtime_patch",
    setState: "not globally patchable for compiled React named imports; offer state setters are instrumented at call sites",
    setOffer: "instrumented at offer UI call sites",
    setPopup: "instrumented at offer UI call sites",
    present: "native/browser present/open/show methods patched when present on window prototypes",
  });
}