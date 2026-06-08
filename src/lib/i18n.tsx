import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type Lang = "en" | "hi";

const DICT = {
  en: {
    good_morning: "Good morning",
    partner: "Partner",
    online: "Online",
    offline: "Offline",
    current_assignment: "Current assignment",
    active: "Active",
    assigned: "Assigned",
    done: "Done",
    left: "Left",
    distance: "Distance",
    eta: "ETA",
    earned: "Earned",
    todays_route: "Today's route",
    view_todays_route: "View today's route",
    no_active_assignment: "No active assignment",
    build_hint: "Build your own assignment — choose cars and duration.",
    build_assignment: "Build assignment",
    today: "Today",
    rating: "Rating",
    lifetime: "Lifetime",
    hours: "Hours",
    level: "Level",
    assignments: "Assignments",
    earnings: "Earnings",
    rewards: "Rewards",
    profile: "Profile",
    home: "Home",
    locations_online_note: "Customer locations show only when you are online.",
    starts: "starts",
    day_of: (n: number, total: number) => `Day ${n} of ${total}`,
  },
  hi: {
    good_morning: "सुप्रभात",
    partner: "पार्टनर",
    online: "ऑनलाइन",
    offline: "ऑफलाइन",
    current_assignment: "वर्तमान असाइनमेंट",
    active: "सक्रिय",
    assigned: "निर्धारित",
    done: "पूरा",
    left: "बाकी",
    distance: "दूरी",
    eta: "समय",
    earned: "कमाई",
    todays_route: "आज का रूट",
    view_todays_route: "आज का रूट देखें",
    no_active_assignment: "कोई सक्रिय असाइनमेंट नहीं",
    build_hint: "अपना असाइनमेंट बनाएं — कार और अवधि चुनें।",
    build_assignment: "असाइनमेंट बनाएं",
    today: "आज",
    rating: "रेटिंग",
    lifetime: "कुल",
    hours: "घंटे",
    level: "स्तर",
    assignments: "असाइनमेंट",
    earnings: "कमाई",
    rewards: "इनाम",
    profile: "प्रोफ़ाइल",
    home: "होम",
    locations_online_note: "ग्राहक की लोकेशन तभी दिखेगी जब आप ऑनलाइन होंगे।",
    starts: "शुरू",
    day_of: (n: number, total: number) => `दिन ${n} / ${total}`,
  },
} as const;

type Dict = typeof DICT.en;
type Key = keyof Dict;

const Ctx = createContext<{ lang: Lang; setLang: (l: Lang) => void; t: <K extends Key>(k: K) => Dict[K] }>({
  lang: "en",
  setLang: () => {},
  t: ((k: Key) => DICT.en[k]) as any,
});

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>("en");
  useEffect(() => {
    const saved = (typeof window !== "undefined" && (localStorage.getItem("uw_lang") as Lang)) || "en";
    setLangState(saved === "hi" ? "hi" : "en");
  }, []);
  const setLang = (l: Lang) => {
    setLangState(l);
    if (typeof window !== "undefined") localStorage.setItem("uw_lang", l);
  };
  const t = (<K extends Key>(k: K) => DICT[lang][k]) as <K extends Key>(k: K) => Dict[K];
  return <Ctx.Provider value={{ lang, setLang, t }}>{children}</Ctx.Provider>;
}

export const useI18n = () => useContext(Ctx);
