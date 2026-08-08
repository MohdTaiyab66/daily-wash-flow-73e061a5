import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState, useEffect, useRef } from "react";
import { ArrowLeft, Search, Loader2, Check, X, Car, AlertCircle, ChevronRight, Camera } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { VehicleAvatar } from "@/components/VehicleAvatar";
import { vehicleBodyLabel } from "@/lib/vehicle-category";
import { 
  PageTitle, 
  Section, 
  SectionTitle, 
  Surface, 
  Muted 
} from "@/components/customer/ui/kit";
import { cn } from "@/lib/utils";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";

export const Route = createFileRoute("/c/_authed/vehicles_/add")({
  ssr: false,
  head: () => ({ meta: [{ title: "Add Your Vehicle — Urban Wash" }] }),
  component: AddVehicle,
});

type CatalogRow = {
  id: string;
  make: string;
  model: string;
  category: string;
  image_url: string | null;
  aliases?: string[] | null;
  body_type?: string | null;
  popularity?: number | null;
};

const POPULAR_BRANDS = ["Maruti Suzuki", "Hyundai", "Tata", "Mahindra", "Toyota", "Kia"];

function AddVehicle() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [userId, setUserId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [brand, setBrand] = useState<string | null>(null);
  const [selected, setSelected] = useState<CatalogRow | null>(null);
  const [success, setSuccess] = useState(false);
  
  const [color, setColor] = useState("");
  const [reg, setReg] = useState("");
  const [year, setYear] = useState("");
  const [variant, setVariant] = useState("");
  const [parking, setParking] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null));
  }, []);

  const catalogQ = useQuery({
    queryKey: ["vehicle-catalog-all-v3"],
    queryFn: async (): Promise<CatalogRow[]> => {
      const { data, error } = await supabase
        .from("vehicle_catalog")
        .select("id,make,model,category,image_url,aliases,body_type,popularity")
        .eq("active", true)
        .order("popularity", { ascending: false })
        .order("make")
        .order("model")
        .limit(2000);
      if (error) throw error;
      return (data ?? []) as CatalogRow[];
    },
    staleTime: 5 * 60 * 1000,
  });

  const brands = useMemo(() => {
    const s = new Set<string>();
    (catalogQ.data ?? []).forEach((r) => s.add(r.make));
    return Array.from(s).sort();
  }, [catalogQ.data]);

  const brandsByAlpha = useMemo(() => {
    const groups: Record<string, string[]> = {};
    brands.forEach(b => {
      const char = b[0].toUpperCase();
      if (!groups[char]) groups[char] = [];
      groups[char].push(b);
    });
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
  }, [brands]);

  const popularVehicles = useMemo(() => {
    return (catalogQ.data ?? []).slice(0, 6);
  }, [catalogQ.data]);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term && !brand) return [];
    
    return (catalogQ.data ?? []).filter((r) => {
      if (brand && r.make !== brand) return false;
      if (!term) return true;
      const full = `${r.make} ${r.model}`.toLowerCase();
      return full.includes(term) || (r.aliases ?? []).some(a => a.toLowerCase().includes(term));
    }).slice(0, 40);
  }, [catalogQ.data, query, brand]);

  const save = useMutation({
    mutationFn: async () => {
      if (!selected) throw new Error("Pick a car first");
      if (reg.trim().length < 4) throw new Error("Enter a valid registration number");
      
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("You're signed out. Please sign in again.");

      const noteParts: string[] = [];
      if (variant.trim()) noteParts.push(`Variant: ${variant.trim()}`);
      if (year.trim()) noteParts.push(`Year: ${year.trim()}`);
      if (parking.trim()) noteParts.push(parking.trim());

      const payload = {
        user_id: u.user.id,
        make: selected.make,
        model: selected.model,
        category: selected.category,
        color: color.trim() || null,
        registration_number: reg.trim().toUpperCase(),
        parking_notes: noteParts.join(" • ") || null,
      };

      const { data: vehicle, error } = await supabase
        .from("customer_vehicles")
        .insert(payload)
        .select()
        .single();

      if (error) throw error;

      if (photo && vehicle) {
        const ext = photo.name.split('.').pop();
        const path = `${u.user.id}/${vehicle.id}/${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("vehicle-images")
          .upload(path, photo);
        
        if (!upErr) {
          await supabase
            .from("customer_vehicles")
            .update({ image_path: path })
            .eq("id", vehicle.id);
        }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["customer-vehicles"] });
      setSuccess(true);
    },
    onError: (e: any) => toast.error(e.message || "Failed to add vehicle"),
  });

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setPhoto(file);
      const reader = new FileReader();
      reader.onloadend = () => setPhotoPreview(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const handleBack = () => {
    if (selected) {
      setSelected(null);
      setBrand(null);
    } else if (brand) {
      setBrand(null);
    } else {
      navigate({ to: "/c/home" });
    }
  };

  const VehicleRow = ({ c }: { c: CatalogRow }) => (
    <button
      onClick={() => setSelected(c)}
      className="flex w-full items-center gap-4 py-3 border-b border-border/40 last:border-0 active:bg-accent/40 transition-colors text-left"
    >
      <div className="h-12 w-16 bg-muted/50 rounded-xl overflow-hidden flex items-center justify-center shrink-0">
        <VehicleAvatar
          imageUrl={c.image_url}
          make={c.make}
          model={c.model}
          className="h-10 w-12 object-contain"
        />
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-[15px]">{c.make} {c.model}</div>
        <div className="text-[12px] text-muted-foreground uppercase tracking-tight">
          {vehicleBodyLabel(c.make, c.model, c.category)}
        </div>
      </div>
      <ChevronRight className="h-4 w-4 text-muted-foreground/50 shrink-0" />
    </button>
  );

  return (
    <div className="min-h-screen bg-[#FFF9F3] flex flex-col">
      {success ? (
        <div className="flex-1 flex flex-col items-center justify-center px-8 animate-in fade-in zoom-in duration-500">
          <div className="h-24 w-24 rounded-[32px] bg-success flex items-center justify-center text-white shadow-xl shadow-success/20 mb-8">
            <Check className="h-12 w-12" strokeWidth={3} />
          </div>
          <h2 className="text-[24px] font-black text-[#1a1a1a] text-center leading-tight">Vehicle added!</h2>
          <p className="mt-2 text-[15px] font-medium text-muted-foreground text-center">
            {selected?.make} {selected?.model} is now in your garage.
          </p>
          <Button 
            onClick={() => navigate({ to: "/c/home" })}
            className="mt-12 w-full h-14 rounded-2xl bg-[#1a1a1a] text-white font-black shadow-lg active:scale-95 transition-transform"
          >
            Go to Home
          </Button>
        </div>
      ) : (
        <>
          <header className="px-5 pt-6 pb-4">
            <button
              onClick={handleBack}
              className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground mb-4 transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              <span className="text-sm font-medium">Back</span>
            </button>
            <PageTitle>{selected ? "Vehicle details" : brand ? brand : "Add your vehicle"}</PageTitle>
            <Muted className="mt-1">
              {selected 
                ? "Almost done! Just a few more details." 
                : "Find your car and we'll automatically apply the right pricing."}
            </Muted>
          </header>

          <main className="flex-1 px-5 pb-32">
            {!selected ? (
              <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
                <div className="relative group">
                  <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
                    <Search className="h-5 w-5 text-muted-foreground/70 group-focus-within:text-primary transition-colors" />
                  </div>
                  <Input
                    value={query}
                    onChange={(e) => {
                      setQuery(e.target.value);
                      if (brand) setBrand(null);
                    }}
                    placeholder="Search your car"
                    className="h-14 pl-12 pr-12 rounded-2xl border-border/60 bg-white shadow-sm focus-visible:ring-primary/20 transition-all text-base"
                  />
                  {query && (
                    <button 
                      onClick={() => setQuery("")}
                      className="absolute inset-y-0 right-4 flex items-center text-muted-foreground hover:text-foreground"
                    >
                      <X className="h-5 w-5" />
                    </button>
                  )}
                  {!query && (
                    <div className="mt-2 ml-1">
                      <Muted className="text-[12px]">Try "Creta", "Swift" or "Fortuner"</Muted>
                    </div>
                  )}
                </div>

                {(query.length > 0 || brand) ? (
                  <div className="space-y-2">
                    <SectionTitle className="mb-4">
                      {brand ? `Models for ${brand}` : "Search results"}
                    </SectionTitle>
                    {catalogQ.isLoading ? (
                      <div className="space-y-4">
                        {[1, 2, 3].map(i => <div key={i} className="h-16 w-full bg-muted/40 animate-pulse rounded-2xl" />)}
                      </div>
                    ) : filtered.length > 0 ? (
                      <div className="space-y-1">
                        {filtered.map(c => <VehicleRow key={c.id} c={c} />)}
                      </div>
                    ) : (
                      <div className="py-12 text-center space-y-3">
                        <div className="bg-muted/50 h-16 w-16 rounded-full flex items-center justify-center mx-auto">
                          <Car className="h-8 w-8 text-muted-foreground/40" />
                        </div>
                        <div>
                          <SectionTitle>No exact match</SectionTitle>
                          <Muted>We couldn't find that model. Try searching by brand instead.</Muted>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <>
                    <Section 
                      title="Popular brands" 
                      className="mt-0"
                      action={
                        <Drawer>
                          <DrawerTrigger asChild>
                            <button className="text-primary text-[14px] font-semibold flex items-center gap-0.5">
                              View all <ChevronRight className="h-4 w-4" />
                            </button>
                          </DrawerTrigger>
                          <DrawerContent className="max-h-[85vh]">
                            <DrawerHeader className="pb-2 border-b">
                              <DrawerTitle className="text-center">Choose a brand</DrawerTitle>
                              <DrawerDescription className="text-center">Select your car manufacturer</DrawerDescription>
                            </DrawerHeader>
                            <div className="overflow-y-auto px-4 pb-12 pt-2">
                               {brandsByAlpha.map(([char, list]) => (
                                 <div key={char} className="mb-6">
                                   <div className="text-[12px] font-bold text-muted-foreground mb-2 px-2">{char}</div>
                                   <div className="grid grid-cols-1 gap-1">
                                     {list.map(b => (
                                       <DrawerClose key={b} asChild>
                                         <button 
                                           onClick={() => setBrand(b)}
                                           className="w-full text-left px-3 py-3 rounded-xl hover:bg-accent active:bg-accent/60 transition-colors font-medium"
                                         >
                                           {b}
                                         </button>
                                       </DrawerClose>
                                     ))}
                                   </div>
                                 </div>
                               ))}
                            </div>
                          </DrawerContent>
                        </Drawer>
                      }
                    >
                      <div className="grid grid-cols-3 gap-2">
                        {POPULAR_BRANDS.map(b => (
                          <button
                            key={b}
                            onClick={() => setBrand(b)}
                            className="h-11 rounded-full bg-white border border-border/50 text-[13px] font-semibold hover:border-primary/40 hover:bg-primary/5 transition-all shadow-sm active:scale-[0.98]"
                          >
                            {b.split(' ')[0]}
                          </button>
                        ))}
                      </div>
                    </Section>

                    <Section title="Popular vehicles">
                      <div className="space-y-1">
                        {catalogQ.isLoading ? (
                          [1, 2, 3].map(i => <div key={i} className="h-16 w-full bg-muted/40 animate-pulse rounded-2xl" />)
                        ) : (
                          popularVehicles.map(c => <VehicleRow key={c.id} c={c} />)
                        )}
                      </div>
                    </Section>
                  </>
                )}
              </div>
            ) : (
              <div className="space-y-6 animate-in slide-in-from-right-4 duration-300">
                <Surface className="border-primary/10 bg-white p-3 flex items-center gap-4">
                   <div className="h-16 w-20 bg-muted/30 rounded-xl flex items-center justify-center shrink-0">
                      <VehicleAvatar
                        imageUrl={selected.image_url}
                        make={selected.make}
                        model={selected.model}
                        className="h-12 w-16"
                      />
                   </div>
                   <div className="flex-1 min-w-0">
                      <div className="font-bold text-lg">{selected.make} {selected.model}</div>
                      <div className="text-[12px] text-muted-foreground font-medium uppercase tracking-wider">
                        {vehicleBodyLabel(selected.make, selected.model, selected.category)}
                      </div>
                   </div>
                   <button 
                      onClick={() => setSelected(null)}
                      className="h-8 w-8 rounded-full bg-accent/50 flex items-center justify-center text-primary"
                   >
                      <X className="h-4 w-4" />
                   </button>
                </Surface>

                <div className="space-y-5">
                  <div className="space-y-2">
                    <Label className="text-[13px] font-bold text-foreground/80 ml-1">Registration number</Label>
                    <Input 
                      value={reg}
                      onChange={(e) => setReg(e.target.value.toUpperCase())}
                      placeholder="e.g. UP 32 AB 1234"
                      className="h-13 rounded-xl border-border/60 bg-white text-base font-semibold tracking-wide uppercase placeholder:normal-case placeholder:font-normal"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-[13px] font-bold text-foreground/80 ml-1">Color (Optional)</Label>
                      <Input 
                        value={color}
                        onChange={(e) => setColor(e.target.value)}
                        placeholder="White"
                        className="h-13 rounded-xl border-border/60 bg-white"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-[13px] font-bold text-foreground/80 ml-1">Year (Optional)</Label>
                      <Input 
                        value={year}
                        onChange={(e) => setYear(e.target.value.replace(/\D/g, '').slice(0, 4))}
                        placeholder="2022"
                        inputMode="numeric"
                        className="h-13 rounded-xl border-border/60 bg-white"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-[13px] font-bold text-foreground/80 ml-1">Vehicle photo</Label>
                    <div className="relative">
                      <input 
                        type="file" 
                        accept="image/*" 
                        capture="environment" 
                        className="hidden" 
                        ref={fileInputRef} 
                        onChange={handlePhotoChange}
                      />
                      {photoPreview ? (
                        <div className="relative h-44 w-full rounded-2xl overflow-hidden border-2 border-primary/20 bg-white shadow-sm">
                          <img src={photoPreview} className="h-full w-full object-cover" alt="Vehicle" />
                          <button 
                            onClick={() => { setPhoto(null); setPhotoPreview(null); }}
                            className="absolute top-2 right-2 h-8 w-8 rounded-full bg-black/60 text-white flex items-center justify-center backdrop-blur-sm"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      ) : (
                        <button 
                          onClick={() => fileInputRef.current?.click()}
                          className="w-full h-32 rounded-2xl border-2 border-dashed border-border/60 bg-white flex flex-col items-center justify-center gap-2 hover:border-primary/40 transition-colors"
                        >
                          <Camera className="h-8 w-8 text-muted-foreground/40" />
                          <span className="text-[13px] font-medium text-muted-foreground">Take a photo of your car</span>
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-[13px] font-bold text-foreground/80 ml-1">Parking instructions (Optional)</Label>
                    <Input 
                      value={parking}
                      onChange={(e) => setParking(e.target.value)}
                      placeholder="e.g. B-block basement, slot 14"
                      className="h-13 rounded-xl border-border/60 bg-white"
                    />
                  </div>
                </div>
              </div>
            )}
          </main>

          {selected && (
            <div className="fixed inset-x-0 bottom-0 p-5 bg-gradient-to-t from-[#FFF9F3] via-[#FFF9F3] to-transparent pt-10">
              <Button
                size="lg"
                className="w-full h-14 rounded-2xl shadow-lg shadow-primary/20 text-base font-bold gap-2 animate-in slide-in-from-bottom-4 duration-500"
                disabled={save.isPending || reg.trim().length < 4 || !userId}
                onClick={() => save.mutate()}
              >
                {save.isPending ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <>Add vehicle <ArrowLeft className="h-5 w-5 rotate-180" /></>
                )}
              </Button>
              <p className="text-center text-[11px] text-muted-foreground mt-3">
                By adding, you agree to our vehicle classification terms
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
