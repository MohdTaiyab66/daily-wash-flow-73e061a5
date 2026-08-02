import {
  LayoutDashboard, BellRing, CalendarCheck, ClipboardList, UserSquare2, Users, UserCheck,
  Activity, Sparkles, RotateCcw, LifeBuoy, Bell, Settings, Map as MapIcon, Route as RouteIcon,
  Globe, IndianRupee, Wallet, ShieldAlert, Camera, TrendingUp, Radio, ListChecks, Layers,
} from "lucide-react";

export type AdminNavItem = {
  to: string;
  label: string;
  icon: typeof Users;
  exact?: boolean;
  search?: Record<string, string>;
};

export type AdminNavGroup = {
  id: string;
  label: string;
  items: AdminNavItem[];
};

/**
 * Single source of truth for admin navigation.
 * Every feature appears exactly once. Demo / trial / legacy screens are excluded.
 */
export const ADMIN_NAV: AdminNavGroup[] = [
  {
    id: "dashboard",
    label: "Dashboard",
    items: [
      { to: "/admin", label: "Dashboard", icon: LayoutDashboard, exact: true },
      { to: "/admin/notifications", label: "Notifications", icon: BellRing },
    ],
  },
  {
    id: "operations",
    label: "Operations",
    items: [
      { to: "/admin/services", label: "Today's Services", icon: CalendarCheck, search: { f: "today" } },
      { to: "/admin/services", label: "Bookings", icon: ClipboardList, search: { f: "all" } },
      { to: "/admin/customers", label: "Customers", icon: UserSquare2 },
      { to: "/admin/partners", label: "Partners", icon: Users },
      { to: "/admin/manual-assignment", label: "Assignments", icon: UserCheck },
      { to: "/admin/attendance", label: "Attendance", icon: CalendarCheck },
      { to: "/admin/live", label: "Live Operations", icon: Activity },
    ],
  },
  {
    id: "daily-shine",
    label: "Daily Shine",
    items: [
      { to: "/admin/marketplace", label: "Daily Shine Offers", icon: Sparkles },
      { to: "/admin/marketplace-live", label: "Live Offers", icon: Radio },
      { to: "/admin/renewals", label: "Renewals", icon: RotateCcw },
      { to: "/admin/dar", label: "Recovery (DAR)", icon: LifeBuoy },
    ],
  },
  {
    id: "marketplace",
    label: "Marketplace",
    items: [
      { to: "/admin/service-leads", label: "Service Leads", icon: ClipboardList },
      { to: "/admin/addon-queue", label: "Add-on Queue", icon: Bell },
      { to: "/admin/offer-history", label: "Offer History", icon: ListChecks },
      { to: "/admin/marketplace-settings", label: "Marketplace Settings", icon: Settings },
    ],
  },
  {
    id: "services",
    label: "Services",
    items: [
      { to: "/admin/addons", label: "Add-ons Catalogue", icon: Layers },
      { to: "/admin/plan-inclusions", label: "Plan Inclusions", icon: Sparkles },
      { to: "/admin/payment-modes", label: "Payment Modes", icon: IndianRupee },
    ],
  },
  {
    id: "maps",
    label: "Maps & Routing",
    items: [
      { to: "/admin/route-manager", label: "Route Manager", icon: RouteIcon },
      { to: "/admin/customer-map", label: "Customer Map", icon: MapIcon },
      { to: "/admin/coverage", label: "Coverage Manager", icon: Globe },
      { to: "/admin/expansion-requests", label: "Expansion Requests", icon: Globe },
    ],
  },
  {
    id: "finance",
    label: "Finance",
    items: [
      { to: "/admin/revenue", label: "Revenue", icon: IndianRupee },
      { to: "/admin/wallet", label: "Wallet", icon: Wallet },
      { to: "/admin/payouts", label: "Payouts", icon: Wallet },
    ],
  },
  {
    id: "quality",
    label: "Quality",
    items: [
      { to: "/admin/vehicle-audit", label: "Vehicle Audit", icon: ShieldAlert },
      { to: "/admin/photos", label: "Service Photos", icon: Camera },
      { to: "/admin/reliability", label: "Reliability", icon: TrendingUp },
      { to: "/admin/fraud", label: "Fraud Review", icon: ShieldAlert },
      { to: "/admin/integrity-audit", label: "Integrity Audit", icon: ShieldAlert },
    ],
  },
  {
    id: "settings",
    label: "Settings",
    items: [{ to: "/admin/settings", label: "System Settings", icon: Settings }],
  },
];
