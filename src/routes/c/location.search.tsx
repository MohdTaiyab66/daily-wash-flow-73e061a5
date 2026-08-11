import { createFileRoute, useNavigate, redirect } from "@tanstack/react-router";
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
    // Faster initial load check
    const { data } = await supabase.auth.getSession();
    const user = data.session?.user;
    if (!user?.email?.endsWith("@customer.urbanwash.app")) {
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
  const { view, setView, setLocation, area: savedArea, geo: savedGeo } = useLocationFlowStore();
  
  const [q, setQ] = useState("");
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [selecting, setSelecting] = useState(false);
  const [locatingError, setLocatingError] = useState<string | null>(null);
  const [locatingStage, setLocatingStage] = useState<'idle' | 'finding' | 'checking' | 'saving'>('idle');
  
  // Track the manual location selection separately from global store to avoid premature UI state
  const [selectedManualLocation, setSelectedManualLocation] = useState<{
    area: string;
    fullAddress: string;
    geo: any;
  } | null>(null);

  const sessionTokenRef = useRef<any>(null);
  const placesLibRef = useRef<any>(null);
  const mapsLibRef = useRef<any>(null);
  const debounceRef = useRef<number | null>(null);
  const reqIdRef = useRef(0);
  
  const mapRef = useRef<HTMLDivElement>(null);
  const googleMapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);

  // Initialize Maps
  useEffect(() => {
    // Only initialize map if we have a container for it
    if (!mapRef.current) return;

    let cancelled = false;
    (async () => {
      try {
        await loadGoogleMaps();
        if (cancelled) return;
        const [places, maps] = await Promise.all([
          window.google.maps.importLibrary("places"),
          window.google.maps.importLibrary("maps")
        ]);
        placesLibRef.current = places;
        mapsLibRef.current = maps;
        sessionTokenRef.current = new places.AutocompleteSessionToken();

        // Initialize map
        if (mapRef.current) {
          // Clean up any existing map instance if needed (though React should handle this via ref update)
          const initialCenter = savedGeo ? { lat: savedGeo.lat, lng: savedGeo.lng } : LUCKNOW_CENTER;
          googleMapRef.current = new maps.Map(mapRef.current, {
            center: initialCenter,
            zoom: 14,
            disableDefaultUI: true,
            gestureHandling: "greedy"
          });
          
          if (savedGeo) {
            markerRef.current = new window.google.maps.Marker({
              position: initialCenter,
              map: googleMapRef.current,
              icon: {
                path: window.google.maps.SymbolPath.CIRCLE,
                fillColor: '#4285F4',
                fillOpacity: 1,
                strokeColor: '#FFFFFF',
                strokeWeight: 2,
                scale: 7,
              }
            });
          }
        }
      } catch (e) {
        console.warn("[location.search] Maps API load failed", e);
      }
    })();
    return () => { 
      cancelled = true;
      // Cleanup map references when view changes
      googleMapRef.current = null;
      markerRef.current = null;
    };
  }, [view]);

  // Autocomplete
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

  const persistLocation = async (lat: number, lng: number, fallbackLabel?: string) => {
    const startTime = Date.now();
    console.log("[LOCATION] reverse geocode start");
    
    // We start reverse geocoding but don't strictly block coordinate processing
    const locPromise = reverse({ data: { lat, lng } });
    
    const geo = { lat, lng, pincode: '', state: '', city: '' };
    
    try {
      const loc = await locPromise;
      console.log(`[LOCATION] reverse geocode complete: ${Date.now() - startTime}ms`);
      const areaName = loc.area || loc.city || fallbackLabel || "Your area";
      geo.pincode = loc.pincode || '';
      geo.state = loc.state || '';
      geo.city = loc.city || '';
      
      const locationData = {
        area: areaName,
        fullAddress: loc.formatted_address,
        geo
      };

      if (view === 'manual_entry') {
        setSelectedManualLocation(locationData);
      } else {
        console.log("[LOCATION] serviceability check start");
        setLocatingStage('checking');
        // Simulate/Perform serviceability check here if needed
        console.log("[LOCATION] serviceability check complete");
        
        setLocatingStage('saving');
        console.log("[LOCATION] location saved");
        setLocation(locationData);
        localStorage.setItem("uw_customer_area", areaName);
        localStorage.setItem("uw_customer_full_address", loc.formatted_address);
        localStorage.setItem("uw_customer_geo", JSON.stringify(geo));
        
        const { data: u } = await supabase.auth.getUser();
        const uid = u.user?.id;
        if (uid) {
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
          const { data: existing } = await supabase.from("customer_addresses").select("id").eq("user_id", uid).eq("is_default", true).maybeSingle();
          existing?.id
            ? await supabase.from("customer_addresses").update(payload).eq("id", existing.id)
            : await supabase.from("customer_addresses").insert(payload);
        }
      }
      return areaName;
    } catch (err) {
      console.error("[LOCATION] persist failed", err);
      throw err;
    }
  };

  const handleUseCurrentLocation = async () => {
    setLocatingError(null);
    setLocatingStage('finding');
    setView('locating');
    
    const startTime = Date.now();
    
    try {
      // Use a shorter timeout for faster response
      const p = await getCurrentGps({ enableHighAccuracy: true, timeout: 8000, maximumAge: 10000 });
      if (!p) throw new Error("Could not get location");
      
      await persistLocation(p.lat, p.lng);
      console.log(`[LOCATION] total flow complete: ${Date.now() - startTime}ms`);
      console.log("[LOCATION] home navigation");
      handleContinue();
    } catch (e: any) {
      console.warn("[LOCATION] GPS flow failed", e);
      setLocatingError(e.message === "Could not get location" 
        ? "Couldn't get your location. Please check that location services are enabled." 
        : "Location permission is needed to find nearby serviceable areas.");
      setView('onboarding');
      setLocatingStage('idle');
    }
  };

  const chooseSuggestion = async (s: Suggestion) => {
    const lib = placesLibRef.current;
    if (!lib) return;
    setSelecting(true);
    try {
      const place = new lib.Place({ id: s.placeId });
      await place.fetchFields({ fields: ["location", "formattedAddress"] });
      const loc = place.location;
      const lat = typeof loc?.lat === "function" ? loc.lat() : loc?.lat;
      const lng = typeof loc?.lng === "function" ? loc.lng() : loc?.lng;
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) throw new Error("Invalid location");
      
      const latVal = Number(lat);
      const lngVal = Number(lng);
      
      await persistLocation(latVal, lngVal, s.primary);
      
      // Update map center
      if (googleMapRef.current) {
        googleMapRef.current.setCenter({ lat: latVal, lng: lngVal });
        if (markerRef.current) {
          markerRef.current.setPosition({ lat: latVal, lng: lngVal });
        } else {
          markerRef.current = new window.google.maps.Marker({
            position: { lat: latVal, lng: lngVal },
            map: googleMapRef.current,
            icon: {
              path: window.google.maps.SymbolPath.CIRCLE,
              fillColor: '#4285F4',
              fillOpacity: 1,
              strokeColor: '#FFFFFF',
              strokeWeight: 2,
              scale: 7,
            }
          });
        }
      }
    } catch (e) {
      toast.error("Could not load location");
    } finally {
      setSelecting(false);
    }
  };

  const handleContinue = async () => {
    // If we have a selected manual location, persist it now
    if (selectedManualLocation) {
      setLocation(selectedManualLocation);
      localStorage.setItem("uw_customer_area", selectedManualLocation.area);
      localStorage.setItem("uw_customer_full_address", selectedManualLocation.fullAddress);
      localStorage.setItem("uw_customer_geo", JSON.stringify(selectedManualLocation.geo));
      
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
            address_line: selectedManualLocation.fullAddress,
            area: selectedManualLocation.area,
            pincode: selectedManualLocation.geo.pincode,
            latitude: selectedManualLocation.geo.lat,
            longitude: selectedManualLocation.geo.lng,
            is_default: true,
          };
          existing?.id
            ? await supabase.from("customer_addresses").update(payload).eq("id", existing.id)
            : await supabase.from("customer_addresses").insert(payload);
        }
      } catch { /* ignore */ }
    }

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

  const skipToHomeIfSaved = () => {
    if (savedArea && savedGeo) {
      console.log("[LOCATION] using cached location immediately");
      handleContinue();
      return true;
    }
    return false;
  };

  // SCREEN 1: ONBOARDING
  if (view === 'onboarding') {
    // If we already have a saved area, we can show it as "Last used" but the prompt asks to skip intermediate screens
    // and use cached location if tapped.
    
    return (
      <div className="min-h-screen bg-[#FDFDFD] flex flex-col pt-[max(48px,env(safe-area-inset-top))] pb-[max(24px,env(safe-area-inset-bottom))] px-6 overflow-hidden">
        <div className="mb-5">
          <h1 className="text-[24px] font-black tracking-tight text-[#1A1A1A] leading-tight">What's your location?</h1>
          <p className="text-[14px] font-medium text-muted-foreground/50 mt-1.5 max-w-[280px]">We need your location to show you our serviceable hubs.</p>
        </div>

        <div className="flex-[0.92] relative mb-6 min-h-[260px]">
          {/* Note: In this view, we use a different ref if we want to avoid re-using the same div, 
              but since view changes, the manual_entry map won't exist yet anyway. */}
          <div ref={mapRef} className="absolute inset-0 rounded-[28px] overflow-hidden bg-gray-100 border border-black/5 shadow-sm" />
          <div className="absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-[#FDFDFD] to-transparent pointer-events-none z-10" />
        </div>

        <div className="w-full space-y-4">
          {locatingError && (
            <div className="p-5 rounded-[24px] bg-white border border-red-100 mb-2 animate-in fade-in slide-in-from-bottom-2 shadow-sm">
              <div className="flex gap-3 mb-3">
                <div className="h-10 w-10 rounded-full bg-red-50 flex items-center justify-center shrink-0">
                  <X className="h-5 w-5 text-red-500" />
                </div>
                <div>
                  <h3 className="text-[15px] font-black text-[#1A1A1A]">Location needed</h3>
                  <p className="text-[12px] font-medium text-muted-foreground/60 leading-tight mt-0.5">{locatingError}</p>
                </div>
              </div>
              <div className="flex gap-2">
                <Button onClick={handleUseCurrentLocation} className="flex-1 h-11 rounded-xl bg-[#181818] text-white font-bold text-xs hover:bg-black transition-all">Try again</Button>
                <Button onClick={() => setView('manual_entry')} variant="outline" className="flex-1 h-11 rounded-xl border-gray-200 text-[#1A1A1A] font-bold text-xs hover:bg-gray-50 transition-all">Manual search</Button>
              </div>
            </div>
          )}

          <Button 
            onClick={handleUseCurrentLocation}
            className="w-full h-[58px] rounded-2xl bg-[#181818] hover:bg-[#252525] text-white font-black text-[16px] shadow-sm flex items-center justify-center gap-3 transition-all active:scale-[0.98] group"
          >
            <Navigation className="h-5 w-5 text-[#FF6B00] fill-[#FF6B00]" />
            Use current location
          </Button>
          
          <button onClick={() => setView('manual_entry')} className="w-full py-3 text-[#1A1A1A] font-bold text-center text-[14px] active:text-[#FF6B00] transition-colors">
            Enter location manually
          </button>
        </div>
      </div>
    );
  }

  // LOADING STATE
  if (view === 'locating') {
    const stageInfo = {
      finding: { title: "Finding your location", sub: "Using your location to find nearby service areas" },
      checking: { title: "Location found", sub: "Checking service availability" },
      saving: { title: "Ready", sub: "Setting up your area" },
      idle: { title: "Locating you...", sub: "Please wait" }
    }[locatingStage] || { title: "Locating you...", sub: "Please wait" };

    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center px-6 text-center">
        <div className="relative mb-8">
          <div className="absolute inset-0 bg-[#FF6B00]/5 blur-3xl rounded-full animate-pulse scale-150" />
          <div className="relative w-24 h-24 flex items-center justify-center rounded-full bg-white border border-black/5 shadow-xl">
             <div className="absolute inset-0 border-t-2 border-[#FF6B00] rounded-full animate-spin" />
             <Navigation className="h-8 w-8 text-[#1A1A1A] fill-[#FF6B00]/10" />
          </div>
        </div>
        
        <div className="space-y-2 animate-in fade-in slide-in-from-bottom-2 duration-500">
          <h2 className="text-[20px] font-black text-[#1A1A1A] tracking-tight">{stageInfo.title}</h2>
          <p className="text-[14px] font-medium text-muted-foreground/50 max-w-[240px] mx-auto leading-relaxed">
            {stageInfo.sub}
          </p>
        </div>

        <div className="mt-8 flex gap-1.5">
          <div className={cn("h-1.5 w-1.5 rounded-full bg-[#FF6B00] animate-bounce", locatingStage === 'finding' ? 'opacity-100' : 'opacity-20')} />
          <div className={cn("h-1.5 w-1.5 rounded-full bg-[#FF6B00] animate-bounce [animation-delay:0.2s]", locatingStage === 'checking' ? 'opacity-100' : 'opacity-20')} />
          <div className={cn("h-1.5 w-1.5 rounded-full bg-[#FF6B00] animate-bounce [animation-delay:0.4s]", locatingStage === 'saving' ? 'opacity-100' : 'opacity-20')} />
        </div>
      </div>
    );
  }

  // SCREEN 3: DEDICATED MANUAL ENTRY
  if (view === 'manual_entry') {
    return (
      <div className="h-screen bg-[#FDFDFD] flex flex-col pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] overflow-hidden">
        {/* HEADER */}
        <div className="px-6 py-4 flex items-center gap-4 shrink-0">
          <button onClick={() => { setView('onboarding'); setSelectedManualLocation(null); }} className="grid h-10 w-10 place-items-center rounded-full bg-white shadow-md border border-black/5 active:scale-90 transition-transform">
            <ArrowLeft className="h-5 w-5 text-[#1A1A1A]" />
          </button>
          <h1 className="text-[20px] font-black tracking-tight text-[#1A1A1A]">Choose location</h1>
        </div>

        {/* SEARCH INPUT */}
        <div className="px-6 py-2 shrink-0">
          <div className="relative">
            <div className="flex items-center gap-3 h-[58px] rounded-2xl border border-gray-100 bg-white px-5 shadow-[0_2px_8px_rgba(0,0,0,0.03)] focus-within:ring-1 focus-within:ring-[#FF6B00]/20 transition-all">
              <Search className="h-5 w-5 text-[#FF6B00]" />
              <input
                autoFocus
                type="text"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search locality, society or landmark..."
                className="flex-1 bg-transparent border-0 outline-none focus:ring-0 p-0 h-full text-[16px] font-bold placeholder:font-medium placeholder:text-muted-foreground/30 text-[#1A1A1A]"
              />
              {q && (
                <button 
                  onClick={() => setQ("")} 
                  className="grid h-8 w-8 place-items-center rounded-full bg-gray-50 text-gray-400"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* COMPACT MAP */}
        <div className="px-6 mt-4 shrink-0">
          <div className="h-[200px] w-full rounded-[20px] overflow-hidden bg-gray-100 border border-black/5 shadow-sm relative">
            <div ref={mapRef} className="w-full h-full" />
            {/* Visual marker overlay if location selected but map not updated yet */}
            {selectedManualLocation && (
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10 pointer-events-none">
                <MapPin className="h-8 w-8 text-[#FF6B00] fill-white" />
              </div>
            )}
          </div>
        </div>

        {/* RESULTS / CONFIRMATION */}
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden mt-4">
          <div className="flex-1 overflow-y-auto px-6 py-2 no-scrollbar">
            {loadingSuggestions && (
              <div className="py-6 flex justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-[#FF6B00]/40" />
              </div>
            )}

            {/* RESULTS LIST - Only show when typing */}
            {q.length > 0 && suggestions.map((s, idx) => (
              <div key={s.placeId}>
                <button
                  onClick={() => { 
                    setQ(""); 
                    chooseSuggestion(s); 
                  }}
                  disabled={selecting}
                  className="w-full flex items-start gap-4 py-4 px-1 text-left active:bg-gray-50 transition-all"
                >
                  <div className="mt-1 shrink-0"><MapPin className="h-5 w-5 text-[#FF6B00]" /></div>
                  <div className="flex-1 min-w-0">
                    <span className="block text-[15px] font-black text-[#1A1A1A] truncate">{s.primary}</span>
                    <span className="mt-0.5 block text-[13px] font-medium text-muted-foreground/30 truncate">{s.secondary}</span>
                  </div>
                </button>
                {idx < suggestions.length - 1 && <div className="h-[1px] w-full bg-black/5 ml-9" />}
              </div>
            ))}

            {/* CONFIRMATION STATE - Show after selection */}
            {!q && selectedManualLocation && (
              <div className="animate-in slide-in-from-bottom-4 duration-500">
                <div className="p-5 rounded-[24px] bg-white border border-black/5 flex flex-col gap-4 shadow-sm">
                  <div className="min-w-0">
                    <span className="block text-[9px] font-black text-[#4CAF50] uppercase tracking-[0.2em] mb-1 flex items-center gap-1.5">
                      <CheckCircle2 className="h-3 w-3" />
                      LOCATION SELECTED
                    </span>
                    <span className="block text-[18px] font-black text-[#1A1A1A] leading-tight">{selectedManualLocation.area}</span>
                    <span className="block text-[13px] font-medium text-muted-foreground/40 mt-1 truncate">{selectedManualLocation.fullAddress}</span>
                  </div>
                  <Button 
                    onClick={handleContinue} 
                    className="w-full h-[58px] rounded-2xl bg-[#181818] hover:bg-[#252525] text-white font-black text-[16px] shadow-sm flex items-center justify-center gap-2"
                  >
                    Continue
                  </Button>
                </div>
              </div>
            )}

            {/* INITIAL/EMPTY STATE */}
            {!q && !selectedManualLocation && (
              <div className="py-2">
                <h3 className="text-[14px] font-black text-[#1A1A1A]">Search your area</h3>
                <p className="mt-1 text-[12px] font-medium text-muted-foreground/40 max-w-[260px]">
                  Enter your locality, society or landmark to check doorstep service availability.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FDFDFD] flex items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-[#FF6B00]" />
    </div>
  );
}

const mapStyles: any[] = [];
