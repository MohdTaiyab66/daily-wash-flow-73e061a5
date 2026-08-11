import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface LocationState {
  view: 'onboarding' | 'locating' | 'search';
  setView: (view: 'onboarding' | 'locating' | 'search') => void;
  
  // Selection state
  area: string | null;
  fullAddress: string | null;
  geo: {
    lat: number;
    lng: number;
    pincode: string;
    state: string;
    city: string;
  } | null;
  
  setLocation: (data: {
    area: string;
    fullAddress: string;
    geo: {
      lat: number;
      lng: number;
      pincode: string;
      state: string;
      city: string;
    };
  }) => void;
  
  reset: () => void;
}

export const useLocationFlowStore = create<LocationState>()(
  persist(
    (set) => ({
      view: 'onboarding',
      setView: (view) => set({ view }),
      
      area: null,
      fullAddress: null,
      geo: null,
      
      setLocation: (data) => set({ 
        area: data.area, 
        fullAddress: data.fullAddress, 
        geo: data.geo 
      }),
      
      reset: () => set({ view: 'onboarding', area: null, fullAddress: null, geo: null }),
    }),
    {
      name: 'uw-location-flow-storage',
      partialize: (state) => ({ 
        area: state.area, 
        fullAddress: state.fullAddress, 
        geo: state.geo 
      }),
    }
  )
);
