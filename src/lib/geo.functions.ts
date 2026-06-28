import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const reverseInput = z.object({
  lat: z.number().gte(-90).lte(90),
  lng: z.number().gte(-180).lte(180),
});

export type ReverseGeocodeResult = {
  formatted_address: string;
  address_line: string;
  area: string;
  city: string;
  state: string;
  pincode: string;
  country: string;
  lat: number;
  lng: number;
};

/** Reverse geocode via Google Maps connector gateway (server-side, key-protected). */
export const reverseGeocode = createServerFn({ method: "POST" })
  .inputValidator((input) => reverseInput.parse(input))
  .handler(async ({ data }): Promise<ReverseGeocodeResult> => {
    const lovableKey = process.env.LOVABLE_API_KEY;
    const gmKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!lovableKey || !gmKey) throw new Error("Maps connector not configured");
    const url = `https://connector-gateway.lovable.dev/google_maps/maps/api/geocode/json?latlng=${data.lat},${data.lng}&language=en&region=in`;
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${lovableKey}`,
        "X-Connection-Api-Key": gmKey,
      },
    });
    const j = (await res.json().catch(() => ({}))) as any;
    if (!res.ok || !Array.isArray(j.results) || j.results.length === 0) {
      throw new Error(j?.error_message || "Could not look up that location");
    }
    const best = j.results[0];
    const comps: any[] = best.address_components || [];
    const find = (...types: string[]) =>
      comps.find((c) => types.every((t) => c.types?.includes(t)))?.long_name ||
      comps.find((c) => c.types?.some((t: string) => types.includes(t)))?.long_name ||
      "";
    const sublocality =
      find("sublocality_level_1") || find("sublocality") || find("neighborhood") || find("political");
    const city =
      find("locality") || find("administrative_area_level_2") || "";
    const state = find("administrative_area_level_1");
    const pincode = find("postal_code");
    const country = find("country");
    const route = find("route");
    const number = find("street_number");
    const address_line = [number, route, sublocality].filter(Boolean).join(" ").trim() ||
      (best.formatted_address as string).split(",").slice(0, 2).join(",");
    return {
      formatted_address: best.formatted_address,
      address_line,
      area: sublocality || route || city,
      city,
      state,
      pincode,
      country,
      lat: data.lat,
      lng: data.lng,
    };
  });
