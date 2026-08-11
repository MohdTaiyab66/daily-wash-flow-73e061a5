import { createFileRoute, useNavigate, redirect } from "@tanstack/react-router";
import { z } from "zod";
import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { ArrowLeft, MapPin, Search, Loader2, X, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { loadGoogleMaps } from "@/lib/google-maps-loader";
import { useServerFn } from "@tanstack/react-start";
import { reverseGeocode } from "@/lib/geo.functions";
import { cn } from "@/lib/utils";
import { useLocationFlowStore } from "@/lib/location-flow-store";

export const Route = createFileRoute("/c/location/manual")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>) => ({
    returnTo: z.string().optional().parse(search.returnTo),
  }),
  head: () => ({ meta: [{ title: "Manual Location — Urban Wash" }] }),
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    const user = data.session?.user;
    if (!user?.email?.endsWith("@customer.urbanwash.app")) {
      throw redirect({ to: "/c/auth" });
    }
  },
  loader: async ({ search }) => {
    return { returnTo: search.returnTo };
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
  const [selectedManualLocation, setSelectedManualLocation] = useState<{
    area: string;
    fullAddress: string;
    geo: any;
  } | null>(null);

  const placesLibRef = useRef<any>(null);
  const mapsLibRef = useRef<any>(null);
  const debounceRef = useRef<number | null>(null);
  const reqIdRef = useRef(0);
  
  const mapRef = useRef<HTMLDivElement>(null);
  const googleMapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);

  // Initialize Map - ONCE
  useEffect(() => {
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
        
        if (cancelled) return;
        placesLibRef.current = places;
        mapsLibRef.current = maps;

        const initialCenter = savedGeo ? { lat: savedGeo.lat, lng: savedGeo.lng } : LUCKNOW_CENTER;
        
        googleMapRef.current = new maps.Map(mapRef.current, {
          center: initialCenter,
          zoom: 14,
          disableDefaultUI: true,
          gestureHandling: "greedy",
          styles: [] // Natural styles
        });
        
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
      } catch (e) {
        console.warn("[location.search] Maps API load failed", e);
      }
    })();
    
    return () => { 
      cancelled = true;
      googleMapRef.current = null;
      markerRef.current = null;
    };
  }, []); // Run once on mount

  // Autocomplete logic
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
        setSuggestions([]);
      } finally {
        if (myReq === reqIdRef.current) setLoadingSuggestions(false);
      }
    }, 250);
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [q]);

  const handleSuggestionSelect = async (s: Suggestion) => {
    const lib = placesLibRef.current;
    if (!lib) return;
    setSelecting(true);
    setQ("");
    try {
      const place = new lib.Place({ id: s.placeId });
      await place.fetchFields({ fields: ["location", "formattedAddress"] });
      const loc = place.location;
      const lat = typeof loc?.lat === "function" ? loc.lat() : loc?.lat;
      const lng = typeof loc?.lng === "function" ? loc.lng() : loc?.lng;
      
      const latVal = Number(lat);
      const lngVal = Number(lng);
      
      // Update Map
      if (googleMapRef.current) {
        googleMapRef.current.setCenter({ lat: latVal, lng: lngVal });
        googleMapRef.current.setZoom(16);
        markerRef.current?.setPosition({ lat: latVal, lng: lngVal });
      }

      // Reverse Geocode for City/Area info
      const locData = await reverse({ data: { lat: latVal, lng: lngVal } });
      
      setSelectedManualLocation({
        area: s.primary,
        fullAddress: locData.formatted_address || place.formattedAddress || s.secondary,
        geo: {
          lat: latVal,
          lng: lngVal,
          pincode: locData.pincode || '',
          state: locData.state || '',
          city: locData.city || ''
        }
      });
    } catch (e) {
      toast.error("Could not load location details");
    } finally {
      setSelecting(false);
    }
  };

  const handleContinue = async () => {
    if (!selectedManualLocation) return;
    
    setLocation(selectedManualLocation);
    localStorage.setItem("uw_customer_area", selectedManualLocation.area);
    localStorage.setItem("uw_customer_full_address", selectedManualLocation.fullAddress);
    localStorage.setItem("uw_customer_geo", JSON.stringify(selectedManualLocation.geo));
    
    try {
      const { data: u } = await supabase.auth.getUser();
      const uid = u.user?.id;
      if (uid) {
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
        const { data: existing } = await supabase.from("customer_addresses").select("id").eq("user_id", uid).eq("is_default", true).maybeSingle();
        existing?.id
          ? await supabase.from("customer_addresses").update(payload).eq("id", existing.id)
          : await supabase.from("customer_addresses").insert(payload);
      }
    } catch { /* ignore */ }

    if (searchParams.returnTo) {
      navigate({ to: searchParams.returnTo as any });
    } else {
      navigate({ to: "/c/home" });
    }
  };

  return (
    <div className="flex flex-col h-screen bg-[#FDFDFD] overflow-hidden pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
      {/* HEADER */}
      <div className="px-6 py-4 flex items-center gap-4 shrink-0">
        <button 
          onClick={() => navigate({ to: "/c/location/search" as any })} 
          className="grid h-10 w-10 place-items-center rounded-full bg-white shadow-md border border-black/5 active:scale-95 transition-all"
        >
          <ArrowLeft className="h-5 w-5 text-[#1A1A1A]" />
        </button>
        <h1 className="text-[20px] font-black tracking-tight text-[#1A1A1A]">Choose location</h1>
      </div>

      {/* SEARCH INPUT */}
      <div className="px-6 py-2 shrink-0">
        <div className="relative group">
          <div className="flex items-center gap-3 h-[58px] rounded-[20px] border border-gray-100 bg-white px-5 shadow-[0_2px_12px_rgba(0,0,0,0.04)] focus-within:ring-2 focus-within:ring-[#FF6B00]/10 transition-all">
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
              <button onClick={() => setQ("")} className="p-1 rounded-full hover:bg-gray-100">
                <X className="h-4 w-4 text-gray-400" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* MAIN SCROLLABLE AREA */}
      <div className="flex-1 overflow-y-auto no-scrollbar">
        {/* COMPACT MAP */}
        <div className="px-6 mt-4 shrink-0">
          <div className="h-[210px] w-full rounded-[20px] overflow-hidden bg-gray-50 border border-black/5 relative shadow-sm">
            <div ref={mapRef} className="w-full h-full" />
          </div>
        </div>

        {/* CONTENT / RESULTS */}
        <div className="px-6 py-6">
          {loadingSuggestions && (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-[#FF6B00]" />
            </div>
          )}

          {/* SEARCH RESULTS */}
          {q.length > 0 && (
            <div className="space-y-1">
              {suggestions.map((s, idx) => (
                <div key={s.placeId}>
                  <button
                    onClick={() => handleSuggestionSelect(s)}
                    disabled={selecting}
                    className="w-full flex items-start gap-4 py-4 px-1 text-left active:bg-gray-50 rounded-xl transition-all group"
                  >
                    <div className="mt-1 shrink-0 p-2 rounded-full bg-gray-50 group-active:bg-orange-50 transition-colors">
                      <MapPin className="h-4 w-4 text-[#FF6B00]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="block text-[15px] font-black text-[#1A1A1A] truncate">{s.primary}</span>
                      <span className="mt-0.5 block text-[13px] font-medium text-muted-foreground/40 truncate">{s.secondary}</span>
                    </div>
                  </button>
                  {idx < suggestions.length - 1 && <div className="h-[1px] w-full bg-black/5 ml-12" />}
                </div>
              ))}
            </div>
          )}

          {/* INITIAL STATE */}
          {!q && !selectedManualLocation && (
            <div className="animate-in fade-in duration-500">
              <h3 className="text-[14px] font-black text-[#1A1A1A]">Search your area</h3>
              <p className="mt-1 text-[13px] font-medium text-muted-foreground/40 leading-relaxed max-w-[280px]">
                Enter your locality, society or landmark to check doorstep service availability.
              </p>
            </div>
          )}

          {/* SELECTION CONFIRMATION */}
          {!q && selectedManualLocation && (
            <div className="animate-in slide-in-from-bottom-4 duration-500">
              <div className="p-5 rounded-[24px] bg-white border border-black/5 flex flex-col gap-6 shadow-sm">
                <div className="min-w-0">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-green-50 text-[9px] font-black text-[#4CAF50] uppercase tracking-[0.1em] mb-3">
                    <CheckCircle2 className="h-3 w-3" />
                    LOCATION SELECTED
                  </span>
                  <span className="block text-[18px] font-black text-[#1A1A1A] leading-tight">{selectedManualLocation.area}</span>
                  <span className="block text-[13px] font-medium text-muted-foreground/40 mt-1.5">{selectedManualLocation.fullAddress}</span>
                </div>
                
                <div className="flex flex-col gap-3">
                  <div className="flex items-center gap-2 text-[12px] font-bold text-green-600">
                    <div className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
                    Service available in your area
                  </div>
                  
                  <Button 
                    onClick={handleContinue} 
                    className="w-full h-[58px] rounded-[18px] bg-[#181818] hover:bg-black text-white font-black text-[16px] shadow-lg flex items-center justify-center gap-2 active:scale-[0.98] transition-all"
                  >
                    Continue
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
