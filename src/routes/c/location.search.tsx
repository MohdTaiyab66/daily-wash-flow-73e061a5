import { createFileRoute, useNavigate, redirect } from "@tanstack/react-router";
import { z } from "zod";
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
  validateSearch: (search: Record<string, unknown>) => ({
    returnTo: z.string().optional().parse(search.returnTo),
  }),
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
  const searchParams = Route.useSearch();
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
      if (searchParams.returnTo) {
        window.location.href = searchParams.returnTo;
      } else {
        navigate({ to: "/c/home" });
      }
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
    <div className="min-h-screen bg-[#FFF9F3] flex flex-col">
      {/* Header */}
      <div className="px-5 pt-8 pb-4 flex items-center gap-4">
        <button 
           onClick={() => {
             if (searchParams.returnTo) {
               window.location.href = searchParams.returnTo;
             } else {
               navigate({ to: "/c/location" });
             }
           }} 
           className="grid h-10 w-10 place-items-center rounded-2xl bg-white shadow-sm border border-black/5 transition-transform active:scale-90"
        >
          <ArrowLeft className="h-5 w-5 text-[#1a1a1a]" />
        </button>
        <h1 className="text-[22px] font-black tracking-tight text-[#1a1a1a]">Location</h1>
      </div>

      {/* Search box */}
      <div className="px-5">
        <div className="flex items-center gap-3 rounded-2xl border border-black/5 bg-white px-5 py-4 shadow-sm focus-within:ring-4 focus-within:ring-primary/5 transition-all">
          <Search className="h-5 w-5 text-primary" />
          <Input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search area or landmark..."
            className="border-0 bg-transparent shadow-none focus-visible:ring-0 p-0 h-auto text-[16px] font-bold placeholder:font-medium placeholder:text-muted-foreground/40"
          />
          {q && (
            <button 
               onClick={() => setQ("")} 
               className="grid h-6 w-6 place-items-center rounded-full bg-muted/50 text-muted-foreground hover:bg-muted"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Use current location */}
      <div className="px-5 pt-4">
        <button
          onClick={useGPS}
          disabled={locating || selecting}
          className="w-full flex items-center gap-3 px-5 py-4 rounded-2xl bg-primary/5 border border-primary/10 text-left transition-all active:scale-[0.98]"
        >
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-white shadow-sm">
             {locating ? (
               <Loader2 className="h-5 w-5 animate-spin text-primary" />
             ) : (
               <Navigation className="h-5 w-5 text-primary fill-primary/10" />
             )}
          </div>
          <div>
             <span className="block text-[15px] font-black text-[#1a1a1a]">Use current location</span>
             <span className="block text-[12px] font-bold text-primary/60 uppercase tracking-wider">Fastest way</span>
          </div>
        </button>
        <div className="mt-6 mb-2 flex items-center gap-3 px-1">
           <div className="h-px flex-1 bg-black/5" />
           <span className="text-[11px] font-black text-muted-foreground/30 uppercase tracking-[0.2em]">or search</span>
           <div className="h-px flex-1 bg-black/5" />
        </div>
      </div>

      {/* Search results */}
      <div className="flex-1 overflow-y-auto px-5 pb-8">
        {loadingSuggestions && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <Loader2 className="h-10 w-10 animate-spin text-primary/30" />
            <p className="mt-4 text-[13px] font-bold text-muted-foreground/40 uppercase tracking-widest">Searching...</p>
          </div>
        )}

        {showEmpty && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="grid h-20 w-20 place-items-center rounded-full bg-white shadow-sm mb-6">
              <Search className="h-8 w-8 text-muted-foreground/20" />
            </div>
            <p className="text-[15px] font-black text-[#1a1a1a]">No results found</p>
            <p className="mt-2 text-[13px] font-medium text-muted-foreground/60">Try searching for a different area or landmark</p>
            {!notified && (
              <div className="mt-8 w-full max-w-[280px] rounded-3xl border border-black/5 bg-white p-6 shadow-sm">
                <p className="text-[13px] font-bold text-[#1a1a1a]">Notify me at launch</p>
                <div className="mt-4 flex gap-2">
                  <Input
                    value={notifyPhone}
                    onChange={(e) => setNotifyPhone(e.target.value.replace(/\D/g, ""))}
                    placeholder="9876543210"
                    maxLength={10}
                    className="h-11 rounded-xl border-black/5 bg-[#FFF9F3] text-center font-bold"
                  />
                  <Button onClick={submitWaitlist} size="icon" className="h-11 w-11 shrink-0 rounded-xl shadow-lg shadow-primary/20">
                    <BellRing className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {suggestions.map((s) => (
          <button
            key={s.placeId}
            onClick={() => chooseSuggestion(s)}
            disabled={selecting}
            className="w-full flex items-start gap-4 py-5 border-b border-black/5 text-left transition-all active:bg-black/5"
          >
            <div className="mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white shadow-sm">
              <MapPin className="h-5 w-5 text-[#1a1a1a]" />
            </div>
            <div className="flex-1 min-w-0">
              <span className="block text-[15px] font-black text-[#1a1a1a] truncate">
                {s.primary}
              </span>
              {s.secondary && (
                <span className="mt-1 block text-[13px] font-medium text-muted-foreground/60 line-clamp-2 leading-relaxed">
                  {s.secondary}
                </span>
              )}
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground/30 mt-3" />
          </button>
        ))}

        {q.trim().length < 2 && !loadingSuggestions && (
          <div className="mt-8 rounded-3xl border border-black/5 bg-white p-8 text-center shadow-sm">
            <div className="grid h-16 w-16 place-items-center rounded-[20px] bg-primary/5 mx-auto mb-6">
              <MapPin className="h-7 w-7 text-primary" />
            </div>
            <p className="text-[15px] font-black text-[#1a1a1a]">Find your vehicle</p>
            <p className="mt-2 text-[13px] font-medium leading-relaxed text-muted-foreground/60">
              Enter your apartment, society, or office name to get service at your doorstep.
            </p>
          </div>
        )}
      </div>

      {selecting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#FFF9F3]/80 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="flex flex-col items-center">
            <div className="relative">
              <div className="absolute inset-0 bg-primary/20 blur-2xl rounded-full animate-pulse" />
              <div className="relative grid h-16 w-16 place-items-center rounded-2xl bg-white shadow-xl">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            </div>
            <p className="mt-6 text-[13px] font-black text-primary uppercase tracking-[0.2em]">Confirming Location</p>
          </div>
        </div>
      )}

    </div>
  );
}
