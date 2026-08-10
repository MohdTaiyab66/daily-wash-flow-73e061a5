import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface CartItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
  type: 'base' | 'addon';
}

interface CartState {
  items: CartItem[];
  addItem: (item: CartItem) => void;
  updateQuantity: (id: string, quantity: number) => void;
  removeItem: (id: string) => void;
  clearCart: () => void;
  setBaseService: (id: string, name: string, price: number) => void;
}

export const useCartStore = create<CartState>()(
  persist(
    (set) => ({
      items: [],
      addItem: (item: CartItem) => set((state: CartState) => {
        const existing = state.items.find((i) => i.id === item.id);
        if (existing) {
          return {
            items: state.items.map((i) =>
              i.id === item.id ? { ...i, quantity: i.quantity + item.quantity } : i
            ),
          };
        }
        return { items: [...state.items, item] };
      }),
      updateQuantity: (id: string, quantity: number) => set((state: CartState) => ({
        items: state.items
          .map((i) => (i.id === id ? { ...i, quantity } : i))
          .filter((i) => i.type === 'base' || i.quantity > 0),
      })),
      removeItem: (id: string) => set((state: CartState) => ({
        items: state.items.filter((i) => i.id !== id),
      })),
      clearCart: () => set({ items: [] }),
      setBaseService: (id: string, name: string, price: number) => set((state: CartState) => {
        const otherItems = state.items.filter((i) => i.type !== 'base');
        return {
          items: [{ id, name, price, quantity: 1, type: 'base' }, ...otherItems],
        };
      }),
    }),
    {
      name: 'uw-cart-storage',
    }
  )
);

