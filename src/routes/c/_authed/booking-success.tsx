import { z } from "zod";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Check, Calendar, Clock, Car, Home, ChevronRight, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Surface } from "@/components/customer/ui/kit";

export const Route = createFileRoute("/c/_authed/booking-success")({
  ssr: true,
  head: () => ({ meta: [{ title: "Booking confirmed — Urban Wash" }] }),
  validateSearch: z.object({
    bookingId: z.string().optional().catch(undefined),
    service: z.string().optional().catch(undefined),
    date: z.string().optional().catch(undefined),
    slot: z.string().optional().catch(undefined),
    vehicle: z.string().optional().catch(undefined),
    plan: z.coerce.boolean().optional().catch(undefined),
  }),
  component: BookingSuccess,
});

function BookingSuccess() {
  const { bookingId, service, date, slot, vehicle, plan } = Route.useSearch();

  return (
    <div className="flex min-h-screen flex-col bg-[#FFF9F3] px-6 pb-10 pt-14">
      <div className="flex flex-col items-center text-center">
        <div className="relative mb-8">
          <div className="absolute inset-0 bg-success/20 blur-3xl rounded-full animate-pulse" />
          <div className="relative grid h-24 w-24 place-items-center rounded-full bg-success text-white shadow-xl shadow-success/20 animate-in zoom-in-50 duration-500">
            <Check className="h-12 w-12" strokeWidth={4} />
          </div>
        </div>

        <h1 className="text-3xl font-black tracking-tight text-[#1a1a1a]">
          {plan ? "Plan activated!" : "Wash confirmed!"}
        </h1>
        <p className="mt-3 max-w-[280px] text-[15px] font-medium leading-relaxed text-muted-foreground/70">
          {plan
            ? "Your Daily Shine subscription is now active. We'll see you tomorrow morning!"
            : "We've received your request. You'll be notified as soon as a partner is assigned."}
        </p>
      </div>

      {(service || date || slot || vehicle) && (
        <Surface className="mt-12 bg-white border-black/5 shadow-sm overflow-hidden p-0 animate-in slide-in-from-bottom-4 duration-700">
          <div className="px-5 py-4 bg-[#F9FAFB]/50 border-b border-black/5">
            <span className="text-[11px] font-black uppercase tracking-widest text-muted-foreground/60">Booking summary</span>
          </div>
          <div className="p-2">
            {service && <Row icon={Sparkles} label="Service" value={service} />}
            {vehicle && <Row icon={Car} label="Vehicle" value={vehicle} />}
            {date && <Row icon={Calendar} label="Scheduled Date" value={date} />}
            {slot && <Row icon={Clock} label="Service Window" value={slot} />}
          </div>
        </Surface>
      )}

      <div className="mt-auto space-y-4 pt-10">
        {bookingId ? (
          <Button asChild className="h-15 w-full rounded-2xl text-[16px] font-black shadow-lg shadow-primary/20 transition-all active:scale-[0.98]">
            <Link to="/c/bookings/$id" params={{ id: bookingId }}>
              View booking details <ChevronRight className="ml-1 h-5 w-5" />
            </Link>
          </Button>
        ) : (
          <Button asChild className="h-15 w-full rounded-2xl text-[16px] font-black shadow-lg shadow-primary/20 transition-all active:scale-[0.98]">
            <Link to={plan ? "/c/subscriptions" : "/c/bookings"}>
              {plan ? "Manage my plan" : "Go to bookings"} <ChevronRight className="ml-1 h-5 w-5" />
            </Link>
          </Button>
        )}
        <Button asChild variant="ghost" className="h-14 w-full rounded-2xl text-[15px] font-bold text-muted-foreground/60">
          <Link to="/c/home">
            <Home className="mr-2 h-4 w-4" /> Back to home
          </Link>
        </Button>
      </div>
    </div>
  );
}

function Row({
  icon: Icon,
  label,
  value,
}: {
  icon: any;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-4 px-4 py-4">
      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#FFF9F3] text-primary">
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <span className="block text-[10px] font-black uppercase tracking-wider text-muted-foreground/40">{label}</span>
        <span className="block truncate text-[15px] font-black text-[#1a1a1a]">{value}</span>
      </div>
    </div>
  );
}
