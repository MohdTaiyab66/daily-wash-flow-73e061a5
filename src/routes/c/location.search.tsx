import { createFileRoute, useNavigate, redirect, Link } from "@tanstack/react-router";
import { z } from "zod";
import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { ArrowLeft, ChevronRight, MapPin, Navigation, Search, Loader2, X, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getCurrentGps } from "@/lib/native";
import { loadGoogleMaps } from "@/lib/google-maps-loader";
import { useServerFn } from "@tanstack/react-start";
import { reverseGeocode } from "@/lib/geo.functions";
import { cn } from "@/lib/utils";
import { useLocationFlowStore } from "@/lib/location-flow-store";

export const Route = createFileRoute("/c/location/search")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>) => ({
    returnTo: z.string().optional().parse(search.returnTo),
  }),
  head: () => ({ meta: [{ title: "Location — Urban Wash" }] }),
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user?.email?.endsWith("@customer.urbanwash.app")) {
      throw redirect({ to: "/c/auth" });
    }
  },
  component: LocationFlow,
});

type Suggestion = {
  placeId: string;
  primary: string;
  secondary: string;
};

const LUCKNOW_CENTER = { lat: 26.8467, lng: 80.9462 };
const BIAS_RADIUS_M = 40000;

function LocationFlow() {
  const navigate = useNavigate();
  const searchParams = Route.useSearch();
  const reverse = useServerFn(reverseGeocode);
  const { view, setView, setLocation, area: savedArea } = useLocationFlowStore();
  
  const [q, setQ] = useState("");
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [selecting, setSelecting] = useState(false);

  const sessionTokenRef = useRef<any>(null);
  const placesLibRef = useRef<any>(null);
  const debounceRef = useRef<number | null>(null);
  const reqIdRef = useRef(0);

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
        if (myReq !== reqIdRef.current) return;
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
      const areaName = loc.area || loc.city || fallbackLabel || "Your area";
      
      const geo = { lat, lng, pincode: loc.pincode, state: loc.state, city: loc.city };
      
      // Update store
      setLocation({
        area: areaName,
        fullAddress: loc.formatted_address,
        geo
      });

      // Legacy persistence for compatibility with existing components
      localStorage.setItem("uw_customer_area", areaName);
      localStorage.setItem("uw_customer_full_address", loc.formatted_address);
      localStorage.setItem("uw_customer_geo", JSON.stringify(geo));
      
      // Also persist on customer_addresses (best-effort)
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

      // Success! Move to search view to show the result
      setView('search');
      setSelecting(false);
    } catch (e) {
      setSelecting(false);
      setView('onboarding');
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
      sessionTokenRef.current = new lib.AutocompleteSessionToken();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not load that location");
      setSelecting(false);
    }
  };

  const handleUseCurrentLocation = async () => {
    setView('locating');
    const p = await getCurrentGps({ enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
    if (!p) {
      setView('onboarding');
      toast.error("Couldn't read your location. Enable location permission and try again.");
      return;
    }
    await persistAndGo(p.lat, p.lng);
  };

  const handleContinue = () => {
    if (searchParams.returnTo) {
      if (searchParams.returnTo.startsWith('/')) {
        navigate({ to: searchParams.returnTo as any });
      } else {
        window.location.href = searchParams.returnTo;
      }
    } else {
      navigate({ to: "/c/home" });
    }
  };

  // SCREEN 1: ONBOARDING
  if (view === 'onboarding') {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center px-6 pt-16 pb-12 animate-in fade-in duration-500">
        <div className="w-full text-center mb-8">
          <h1 className="text-[28px] font-black tracking-tight text-[#1a1a1a] mb-2">What's your location?</h1>
          <p className="text-[15px] font-medium text-muted-foreground">We need your location to show you our serviceable hubs.</p>
        </div>

        <div className="flex-1 w-full flex items-center justify-center relative overflow-hidden">
          {/* Illustration placeholder */}
          <div className="w-full h-full max-h-[400px] flex items-center justify-center">
            <div className="w-full aspect-square relative">
               {/* City illustration - using CSS for a modern minimal look until actual SVG is provided */}
               <div className="absolute inset-0 flex items-end justify-center">
                 <div className="w-full h-[80%] bg-gradient-to-t from-white via-primary/5 to-transparent rounded-t-[100px] flex items-end justify-center overflow-hidden">
                    <div className="w-[80%] h-[60%] bg-white/40 backdrop-blur-sm rounded-t-3xl border border-white flex items-end justify-center p-8">
                       <MapPin className="h-32 w-32 text-primary opacity-20" strokeWidth={1} />
                    </div>
                 </div>
               </div>
            </div>
          </div>
        </div>

        <div className="w-full space-y-4 mt-8">
          <Button 
            onClick={handleUseCurrentLocation}
            className="w-full h-14 rounded-2xl bg-primary hover:bg-primary/90 text-white font-black text-lg shadow-lg shadow-primary/20 flex items-center justify-center gap-3 transition-transform active:scale-[0.98]"
          >
            <Navigation className="h-5 w-5 fill-white" />
            Use current location
          </Button>
          
          <button 
            onClick={() => setView('search')}
            className="w-full py-2 text-primary font-bold text-center active:opacity-70 transition-opacity"
          >
            Enter location manually
          </button>
        </div>
      </div>
    );
  }

  // SCREEN 2: LOCATING
  if (view === 'locating') {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center px-6 animate-in fade-in duration-300">
        <div className="relative mb-12">
          <div className="absolute inset-0 bg-primary/10 blur-3xl rounded-full animate-pulse" />
          <div className="relative w-32 h-32 flex items-center justify-center rounded-full bg-white border border-primary/5 shadow-xl">
            <div className="absolute inset-0 border-4 border-primary/20 rounded-full" />
            <div className="absolute inset-0 border-t-4 border-primary rounded-full animate-spin" />
            <MapPin className="h-12 w-12 text-primary animate-bounce" />
          </div>
        </div>
        
        <h2 className="text-[22px] font-black text-[#1a1a1a] text-center mb-2">Finding your location…</h2>
        <p className="text-[15px] font-medium text-muted-foreground text-center">Checking nearby serviceable areas</p>
      </div>
    );
  }

  // SCREEN 3: SEARCH / RESULT
  return (
    <div className="min-h-screen bg-[#F8F9FA] flex flex-col">
      {/* Header with Back */}
      <div className="px-5 pt-12 pb-4 flex items-center gap-4">
        <button 
           onClick={() => setView('onboarding')}
           className="grid h-10 w-10 place-items-center rounded-xl bg-white shadow-sm border border-black/5 transition-transform active:scale-90"
        >
          <ArrowLeft className="h-5 w-5 text-[#1a1a1a]" />
        </button>
        <h1 className="text-[20px] font-black tracking-tight text-[#1a1a1a]">Location</h1>
      </div>

      {/* SUCCESS BANNER */}
      {savedArea && (
        <div className="mx-5 mb-6 animate-in slide-in-from-top-4 duration-500">
          <div className="flex items-center gap-4 p-4 rounded-2xl bg-[#E8F5E9] border border-[#C8E6C9]">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white shadow-sm">
              <CheckCircle2 className="h-6 w-6 text-[#4CAF50]" />
            </div>
            <div className="flex-1 min-w-0">
              <span className="block text-[12px] font-bold text-[#4CAF50] uppercase tracking-wider mb-0.5">Location set</span>
              <span className="block text-[16px] font-black text-[#1b5e20] truncate">{savedArea}</span>
            </div>
            <Button 
              onClick={handleContinue}
              size="sm"
              className="rounded-xl bg-[#4CAF50] hover:bg-[#43A047] text-white font-bold h-9 px-4"
            >
              Continue
            </Button>
          </div>
        </div>
      )}

      {/* SEARCH BOX */}
      <div className="px-5 mb-6">
        <div className="flex items-center gap-3 rounded-2xl border border-black/5 bg-white px-5 py-4 shadow-[0_2px_8px_rgba(0,0,0,0.04)] focus-within:ring-2 focus-within:ring-primary/10 transition-all">
          <Search className="h-5 w-5 text-primary" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search area, landmark or society"
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

      <div className="flex-1 overflow-y-auto px-5 pb-8 space-y-6">
        {/* FASTEST WAY SECTION */}
        <div className="space-y-3">
          <button
            onClick={handleUseCurrentLocation}
            className="w-full flex items-center gap-4 px-5 py-4 rounded-2xl bg-white border border-black/5 text-left transition-all active:bg-black/[0.02] shadow-sm"
          >
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary/5">
               <Navigation className="h-5 w-5 text-primary fill-primary/10" />
            </div>
            <div className="flex-1">
               <span className="block text-[15px] font-black text-[#1a1a1a]">Use current location</span>
               <span className="inline-block mt-0.5 px-2 py-0.5 rounded-md bg-primary/10 text-[10px] font-black text-primary uppercase tracking-wider">Fastest way</span>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground/30" />
          </button>
        </div>

        {/* OR SEARCH SEPARATOR */}
        <div className="flex items-center gap-3 px-1 opacity-20">
           <div className="h-px flex-1 bg-black" />
           <span className="text-[10px] font-black text-black uppercase tracking-[0.2em]">or search results</span>
           <div className="h-px flex-1 bg-black" />
        </div>

        {/* SEARCH RESULTS */}
        <div className="space-y-1">
          {loadingSuggestions && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Loader2 className="h-8 w-8 animate-spin text-primary/30" />
            </div>
          )}

          {suggestions.map((s) => (
            <button
              key={s.placeId}
              onClick={() => chooseSuggestion(s)}
              disabled={selecting}
              className="w-full flex items-start gap-4 p-4 rounded-2xl bg-white border border-transparent hover:border-primary/20 text-left transition-all active:bg-black/[0.02] mb-2 shadow-sm"
            >
              <div className="mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#F8F9FA]">
                <MapPin className="h-5 w-5 text-[#1a1a1a]" />
              </div>
              <div className="flex-1 min-w-0">
                <span className="block text-[15px] font-black text-[#1a1a1a] truncate">
                  {s.primary}
                </span>
                {s.secondary && (
                  <span className="mt-0.5 block text-[13px] font-medium text-muted-foreground/60 line-clamp-1">
                    {s.secondary}
                  </span>
                )}
                <div className="mt-2 flex items-center gap-1.5">
                   <div className="h-1.5 w-1.5 rounded-full bg-[#4CAF50]" />
                   <span className="text-[11px] font-bold text-[#4CAF50] uppercase tracking-wide">Service available</span>
                </div>
              </div>
              <div className="mt-2 text-[12px] font-black text-primary px-3 py-1.5 rounded-lg border border-primary/20 bg-primary/5">
                Select
              </div>
            </button>
          ))}

          {q.trim().length >= 2 && !loadingSuggestions && suggestions.length === 0 && (
             <div className="py-12 text-center">
                <p className="text-[15px] font-black text-[#1a1a1a]">No service here yet</p>
                <p className="mt-1 text-[13px] font-medium text-muted-foreground/60">We're expanding rapidly. Stay tuned!</p>
             </div>
          )}

          {q.trim().length < 2 && !loadingSuggestions && (
            <div className="rounded-3xl border border-dashed border-black/10 p-8 text-center bg-white/50">
              <div className="grid h-16 w-16 place-items-center rounded-2xl bg-white shadow-sm mx-auto mb-4 border border-black/5">
                <Search className="h-7 w-7 text-primary/40" strokeWidth={1.5} />
              </div>
              <p className="text-[15px] font-black text-[#1a1a1a]">Find your service area</p>
              <p className="mt-2 text-[13px] font-medium leading-relaxed text-muted-foreground/60">
                Enter your apartment, society, or office name to check doorstep service availability.
              </p>
            </div>
          )}
        </div>
      </div>

      {selecting && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-white/90 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="flex flex-col items-center">
            <div className="w-16 h-16 relative">
              <div className="absolute inset-0 border-4 border-primary/20 rounded-full" />
              <div className="absolute inset-0 border-t-4 border-primary rounded-full animate-spin" />
            </div>
            <p className="mt-6 text-[13px] font-black text-primary uppercase tracking-[0.2em]">Checking Serviceability</p>
          </div>
        </div>
      )}
    </div>
  );
}
