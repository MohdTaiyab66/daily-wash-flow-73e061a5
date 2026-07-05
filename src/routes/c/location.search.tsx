import { createFileRoute, useNavigate, redirect } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { ArrowLeft, ChevronRight, MapPin, Navigation, Search, Loader2, BellRing, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getCurrentGps } from "@/lib/native";
import { loadGoogleMaps } from "@/lib/google-maps-loader";
import { useServerFn } from "@tanstack/react-start";
import { reverseGeocode } from "@/lib/geo.functions";

export const Route = createFileRoute("/c/location/search")({
  ssr: false,
  head: () => ({ meta: [{ title: "Search location — Urban Wash" }] }),
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user?.email?.endsWith("@customer.urbanwash.app")) {
      throw redirect({ to: "/c/auth" });
    }
  },
  component: LocationSearch,
});

type Suggestion = {
  placeId: string;
  primary: string;
  secondary: string;
};

// Lucknow bias — 40km radius circle around city center.
const LUCKNOW_CENTER = { lat: 26.8467, lng: 80.9462 };
const BIAS_RADIUS_M = 40000;

function LocationSearch() {
  const navigate = useNavigate();
  const reverse = useServerFn(reverseGeocode);
  const [q, setQ] = useState("");
  const [locating, setLocating] = useState(false);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [selecting, setSelecting] = useState(false);
  const [notifyPhone, setNotifyPhone] = useState("");
  const [notified, setNotified] = useState(false);

  const sessionTokenRef = useRef<any>(null);
  const placesLibRef = useRef<any>(null);
  const debounceRef = useRef<number | null>(null);
  const reqIdRef = useRef(0);

  // Preload the Google Maps + Places library on mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await loadGoogleMaps();
        if (cancelled) return;
        const lib = await window.google.maps.importLibrary("places");
        placesLibRef.current = lib;
        sessionTokenRef.current = new lib.AutocompleteSessionToken();
      } catch (e) {
        console.warn("[location.search] Places API load failed", e);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Debounced autocomplete fetch.
  useEffect(() => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    const term = q.trim();
    if (term.length < 2) {
      setSuggestions([]);
      setLoadingSuggestions(false);
      return;
    }
    setLoadingSuggestions(true);
    debounceRef.current = window.setTimeout(async () => {
      const lib = placesLibRef.current;
      if (!lib) return;
      const myReq = ++reqIdRef.current;
      try {
        const { suggestions: rawSuggestions } =
          await lib.AutocompleteSuggestion.fetchAutocompleteSuggestions({
            input: term,
            sessionToken: sessionTokenRef.current,
            includedRegionCodes: ["in"],
            locationBias: {
              center: LUCKNOW_CENTER,
              radius: BIAS_RADIUS_M,
            },
          });
        if (myReq !== reqIdRef.current) return; // stale
        const mapped: Suggestion[] = (rawSuggestions ?? [])
          .filter((s: any) => s.placePrediction)
          .map((s: any) => {
            const p = s.placePrediction;
            return {
              placeId: p.placeId,
              primary: p.mainText?.text ?? p.text?.text ?? "",
              secondary: p.secondaryText?.text ?? "",
            };
          });
        setSuggestions(mapped);
      } catch (e) {
        console.warn("[location.search] autocomplete failed", e);
        setSuggestions([]);
      } finally {
        if (myReq === reqIdRef.current) setLoadingSuggestions(false);
      }
    }, 250);
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [q]);

  const persistAndGo = async (lat: number, lng: number, fallbackLabel?: string) => {
    try {
      const loc = await reverse({ data: { lat, lng } });
      localStorage.setItem("uw_customer_area", loc.area || loc.city || fallbackLabel || "Your area");
      localStorage.setItem("uw_customer_full_address", loc.formatted_address);
      localStorage.setItem(
        "uw_customer_geo",
        JSON.stringify({ lat, lng, pincode: loc.pincode, state: loc.state, city: loc.city }),
      );
      toast.success(`Location set: ${loc.area || loc.city || fallbackLabel || "your area"}`);
      // Also persist on customer_addresses (best-effort).
      try {
        const { data: u } = await supabase.auth.getUser();
        const uid = u.user?.id;
        if (uid) {
          const { data: existing } = await supabase
            .from("customer_addresses")
            .select("id")
            .eq("user_id", uid)
            .eq("is_default", true)
            .maybeSingle();
          const payload = {
            user_id: uid,
            label: "Home",
            address_line: loc.address_line || loc.formatted_address,
            area: loc.area,
            pincode: loc.pincode,
            latitude: lat,
            longitude: lng,
            is_default: true,
          };
          existing?.id
            ? await supabase.from("customer_addresses").update(payload).eq("id", existing.id)
            : await supabase.from("customer_addresses").insert(payload);
        }
      } catch { /* non-fatal */ }
      navigate({ to: "/c/home" });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save that location");
    }
  };

  const chooseSuggestion = async (s: Suggestion) => {
    const lib = placesLibRef.current;
    if (!lib) { toast.error("Maps not ready yet"); return; }
    setSelecting(true);
    try {
      const place = new lib.Place({ id: s.placeId });
      await place.fetchFields({ fields: ["location", "formattedAddress", "displayName"] });
      const loc = place.location;
      const lat = typeof loc?.lat === "function" ? loc.lat() : loc?.lat;
      const lng = typeof loc?.lng === "function" ? loc.lng() : loc?.lng;
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        throw new Error("Location details missing");
      }
      await persistAndGo(Number(lat), Number(lng), s.primary);
      // Start a fresh autocomplete session after selection.
      sessionTokenRef.current = new lib.AutocompleteSessionToken();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not load that location");
    } finally {
      setSelecting(false);
    }
  };

  const useGPS = async () => {
    setLocating(true);
    const p = await getCurrentGps({ enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
    if (!p) {
      setLocating(false);
      toast.error("Couldn't read your location. Enable location permission and try again.");
      return;
    }
    await persistAndGo(p.lat, p.lng);
    setLocating(false);
  };

  const submitWaitlist = async () => {
    if (!/^\d{10}$/.test(notifyPhone)) { toast.error("Enter a valid 10-digit phone"); return; }
    const { error } = await (supabase as any).from("expansion_requests").insert({
      phone: notifyPhone,
      area_name: q.trim() || "Unknown",
      interested_service: "general",
    });
    if (error) { toast.error(error.message); return; }
    setNotified(true);
  };

  const showEmpty = q.trim().length >= 2 && !loadingSuggestions && suggestions.length === 0;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <div className="px-5 pt-8 pb-4 flex items-center gap-4">
        <button onClick={() => navigate({ to: "/c/location" })} className="p-1 -ml-1" aria-label="Back">
          <ArrowLeft className="h-6 w-6" />
        </button>
        <h1 className="text-lg font-semibold tracking-tight">Address Selection</h1>
      </div>

      {/* Search box */}
      <div className="px-5">
        <div className="flex items-center gap-2 rounded-xl border border-input bg-card px-4 py-3">
          <Search className="h-5 w-5 text-muted-foreground" />
          <Input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search area, landmark, colony…"
            className="border-0 bg-transparent shadow-none focus-visible:ring-0 p-0 h-auto text-base"
          />
          {q && (
            <button onClick={() => setQ("")} aria-label="Clear" className="p-1 -mr-1">
              <X className="h-4 w-4 text-muted-foreground" />
            </button>
          )}
        </div>
      </div>

      {/* Use current location — always visible just below the search box */}
      <div className="px-5 pt-3">
        <button
          onClick={useGPS}
          disabled={locating || selecting}
          className="w-full flex items-center gap-3 py-3 text-left"
        >
          {locating ? (
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          ) : (
            <Navigation className="h-5 w-5 text-primary" />
          )}
          <span className="font-semibold text-primary">Use current location</span>
        </button>
        <div className="border-t border-dashed border-border" />
      </div>

      {/* Suggestions / list */}
      <div className="flex-1 px-5 pt-2 pb-6 overflow-y-auto">
        {loadingSuggestions && (
          <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Searching…
          </div>
        )}

        {suggestions.map((s) => (
          <button
            key={s.placeId}
            onClick={() => chooseSuggestion(s)}
            disabled={selecting}
            className="w-full flex items-start gap-3 py-3.5 border-b border-border/60 text-left hover:bg-accent/40 disabled:opacity-60"
          >
            <MapPin className="h-5 w-5 text-muted-foreground mt-0.5 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-[15px] truncate">{s.primary}</div>
              {s.secondary && (
                <div className="text-xs text-muted-foreground truncate mt-0.5">{s.secondary}</div>
              )}
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground mt-1" />
          </button>
        ))}

        {showEmpty && (
          <div className="mt-6 rounded-2xl bg-muted/50 ring-1 ring-border p-6 text-center">
            <div className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-accent">
              <MapPin className="h-5 w-5 text-primary" />
            </div>
            <h3 className="mt-3 text-base font-semibold">No matches for "{q}"</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Drop your number — we'll text you when we launch service in your area.
            </p>
            {!notified ? (
              <div className="mt-4 flex gap-2">
                <div className="flex flex-1">
                  <span className="inline-flex items-center rounded-l-lg border border-r-0 border-input bg-card px-2.5 text-xs text-muted-foreground">+91</span>
                  <Input
                    value={notifyPhone}
                    onChange={(e) => setNotifyPhone(e.target.value.replace(/\D/g, ""))}
                    placeholder="98765 43210"
                    inputMode="numeric"
                    maxLength={10}
                    className="rounded-l-none rounded-r-lg"
                  />
                </div>
                <Button onClick={submitWaitlist}><BellRing className="mr-1 h-4 w-4" />Notify</Button>
              </div>
            ) : (
              <p className="mt-3 text-sm font-semibold text-primary">You're on the list ✓</p>
            )}
          </div>
        )}

        {q.trim().length < 2 && !loadingSuggestions && (
          <p className="pt-6 text-center text-xs text-muted-foreground">
            Type at least 2 characters to search for your area or landmark.
          </p>
        )}
      </div>

      {selecting && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-background/60 backdrop-blur-sm">
          <div className="flex items-center gap-2 rounded-xl bg-card px-4 py-3 shadow-lg ring-1 ring-border">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm font-medium">Loading location…</span>
          </div>
        </div>
      )}
    </div>
  );
}
