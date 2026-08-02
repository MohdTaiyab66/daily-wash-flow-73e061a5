import { createFileRoute, Link } from "@tanstack/react-router";
import { Check, Calendar, Clock, Car, Home } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/c/_authed/booking-success")({
  ssr: false,
  head: () => ({ meta: [{ title: "Booking confirmed — Urban Wash" }] }),
  validateSearch: (s: Record<string, unknown>) => ({
    bookingId: typeof s.bookingId === "string" ? s.bookingId : undefined,
    service: typeof s.service === "string" ? s.service : undefined,
    date: typeof s.date === "string" ? s.date : undefined,
    slot: typeof s.slot === "string" ? s.slot : undefined,
    vehicle: typeof s.vehicle === "string" ? s.vehicle : undefined,
    plan: s.plan === "1" || s.plan === true ? true : undefined,
  }),
  component: BookingSuccess,
});

/**
 * Dedicated confirmation screen shown after a booking/subscription succeeds.
 *
 * It replaces the old toast-only confirmation — nothing here creates or
 * changes a booking, it only presents what the previous step returned.
 */
function BookingSuccess() {
  const { bookingId, service, date, slot, vehicle, plan } = Route.useSearch();

  return (
    <div className="flex min-h-[80vh] flex-col px-6 pb-10 pt-14">
      <div className="flex flex-col items-center text-center">
        <span className="relative grid h-24 w-24 place-items-center rounded-full bg-success/12">
          <span className="absolute inset-0 rounded-full bg-success/30 animate-success-ring" aria-hidden />
          <span className="grid h-16 w-16 place-items-center rounded-full bg-success text-white animate-success-pop">
            <Check className="h-8 w-8" strokeWidth={3} />
          </span>
        </span>

        <h1 className="mt-7 text-2xl font-bold tracking-tight animate-fade-in">
          {plan ? "Your plan is active" : "Booking confirmed"}
        </h1>
        <p className="mt-2 max-w-xs text-sm text-muted-foreground animate-fade-in">
          {plan
            ? "Daily Shine is set up. We'll take care of your car every service day."
            : "We've got it. You'll get a notification when your partner is assigned."}
        </p>
      </div>

      {(service || date || slot || vehicle) && (
        <div className="mt-8 animate-slide-up rounded-3xl border border-border bg-card p-5">
          {service && <Row icon={Check} label="Service" value={service} />}
          {vehicle && <Row icon={Car} label="Vehicle" value={vehicle} />}
          {date && <Row icon={Calendar} label="Date" value={date} />}
          {slot && <Row icon={Clock} label="Time" value={slot} />}
        </div>
      )}

      <div className="mt-auto space-y-3 pt-10">
        {bookingId ? (
          <Button asChild size="lg" className="h-14 w-full rounded-2xl text-base font-semibold">
            <Link to="/c/bookings/$id" params={{ id: bookingId }}>View booking</Link>
          </Button>
        ) : (
          <Button asChild size="lg" className="h-14 w-full rounded-2xl text-base font-semibold">
            <Link to={plan ? "/c/subscriptions" : "/c/bookings"}>
              {plan ? "View my plan" : "View my bookings"}
            </Link>
          </Button>
        )}
        <Button asChild variant="outline" size="lg" className="h-13 w-full rounded-2xl font-semibold">
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
  icon: typeof Check;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-accent text-primary">
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[10px] uppercase tracking-wide text-muted-foreground">{label}</span>
        <span className="block truncate text-sm font-semibold">{value}</span>
      </span>
    </div>
  );
}
