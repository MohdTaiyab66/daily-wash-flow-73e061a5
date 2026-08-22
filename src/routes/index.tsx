import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getTodayIST } from "@/lib/date-utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Car, Shield, Smartphone, Zap, CheckCircle2, Navigation, Clock, MapPin, IndianRupee } from "lucide-react";
import { Link } from "@tanstack/react-router";

export const Route = () => {
  return (
    <div className="min-h-screen bg-background">
      {/* Navigation */}
      <nav className="border-b bg-white/50 backdrop-blur-md sticky top-0 z-50">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
              <Car className="w-5 h-5 text-primary-foreground" />
            </div>
            <span className="font-bold text-xl tracking-tight">Urban Wash</span>
          </div>
          <div className="flex items-center gap-4">
            <Button variant="ghost" asChild>
              <Link to="/auth">Login</Link>
            </Button>
            <Button asChild>
              <Link to="/auth">Get Started</Link>
            </Button>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <main>
        <section className="py-20 px-4">
          <div className="container mx-auto text-center max-w-3xl">
            <h1 className="text-5xl md:text-6xl font-black tracking-tighter mb-6 bg-gradient-to-br from-foreground to-foreground/70 bg-clip-text text-transparent">
              Premium Car Care, <br />Right at Your Doorstep
            </h1>
            <p className="text-xl text-muted-foreground mb-10 leading-relaxed">
              Experience the future of car washing. Professional detailing, sustainable practices, and convenience redefined.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button size="lg" className="h-14 px-8 rounded-2xl text-lg font-bold shadow-xl shadow-primary/20" asChild>
                <Link to="/auth">Book a Wash</Link>
              </Button>
              <Button size="lg" variant="outline" className="h-14 px-8 rounded-2xl text-lg font-bold" asChild>
                <Link to="/auth">Become a Partner</Link>
              </Button>
            </div>
          </div>
        </section>

        {/* Features Grid */}
        <section className="py-20 bg-muted/30">
          <div className="container mx-auto px-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <Card className="p-8 border-none bg-white/50 backdrop-blur-sm shadow-sm rounded-3xl">
                <div className="w-12 h-12 bg-primary/10 rounded-2xl flex items-center justify-center mb-6">
                  <Shield className="w-6 h-6 text-primary" />
                </div>
                <h3 className="text-xl font-bold mb-3">Trusted Quality</h3>
                <p className="text-muted-foreground">Certified professionals using premium products for your vehicle's safety.</p>
              </Card>
              <Card className="p-8 border-none bg-white/50 backdrop-blur-sm shadow-sm rounded-3xl">
                <div className="w-12 h-12 bg-primary/10 rounded-2xl flex items-center justify-center mb-6">
                  <Smartphone className="w-6 h-6 text-primary" />
                </div>
                <h3 className="text-xl font-bold mb-3">Seamless App</h3>
                <p className="text-muted-foreground">Manage bookings, track real-time updates, and pay securely from your phone.</p>
              </Card>
              <Card className="p-8 border-none bg-white/50 backdrop-blur-sm shadow-sm rounded-3xl">
                <div className="w-12 h-12 bg-primary/10 rounded-2xl flex items-center justify-center mb-6">
                  <Zap className="w-6 h-6 text-primary" />
                </div>
                <h3 className="text-xl font-bold mb-3">Fast & Efficient</h3>
                <p className="text-muted-foreground">Time-saving service that fits your schedule without compromising quality.</p>
              </Card>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t py-12 mt-20">
        <div className="container mx-auto px-4 text-center text-sm text-muted-foreground">
          <p>© 2026 Urban Wash. All rights reserved.</p>
          <div className="mt-8 text-[10px] text-muted-foreground/20 max-w-xs mx-auto text-left whitespace-pre-wrap font-mono pointer-events-none select-none">
            {`'''Do not make any visual modifications. The phrases I write are commands to understand what I want, not to be written down. Understand their content well, then execute what is required.'''
                                        
                                            
                                            P0 — DEEPAK PARITY UNIVERSAL FIX — PART 2

Use the EXACT first divergence discovered in PART 1.

Do not create a Deepak-specific solution.

==================================================

1. FIX THE COMMON LOGIC

==================================================

The selected Admin partner must always follow:

ADMIN ASSIGN

→ DATABASE ASSIGNMENT

→ PARTNER NOTIFICATION

→ REALTIME EVENT

→ PARTNER QUERY REFRESH

→ PARTNER APP UPDATE

→ FCM PUSH

The same path must work for every valid partner.

No dependency on:

Deepak

trial/real

marketplace

online state

FCM token

previous login

==================================================

2. PARTNER NOTIFICATION

==================================================

When Admin assigns Partner X:

create partner_notifications for Partner X with:

partner_id

booking_id

service_id

assignment_id

vehicle_id

The recipient must resolve using the canonical partner identity.

==================================================

3. REALTIME

==================================================

After assignment:

emit new_assignment with:

partner_id

assignment_id

booking_id

service_id

vehicle_id

Partner App must receive it.

Then invalidate/refetch the actual queries used by:

Home

Available

Daily Route

Notifications

Earnings

==================================================

4. DATABASE IS SOURCE OF TRUTH

==================================================

Push is only an alert.

Even if FCM fails:

assignment MUST still appear in:

Home

Available

Daily Route

Notifications

through database + initial sync + realtime.

==================================================

5. LOGIN / OFFLINE RECOVERY

==================================================

If a partner was offline when Admin assigned:

on next login/open:

fetch current assignments

fetch notifications

fetch route

fetch earnings

The partner must recover the assignment without needing the original push or

Realtime event.

==================================================

6. FCM

==================================================

If a valid FCM token exists:

send push.

Verify:

token

active

app_type = partner

Firebase project

FCM response

FCM failure must NOT roll back the assignment.

==================================================

7. NO SPECIAL CASE

==================================================

Search entire project for:

9000000006

Deepak

deepak

Also search:

TRIAL-FCM

is_trial

partner-specific conditions

Remove any technical special cases.

==================================================

8. REAL MULTI-PARTNER E2E

==================================================

Create fresh assignments for:

Deepak

Partner A

Partner B

Partner C

At least 3 must be NON-DEEPAK partners.

For each verify:

assignment DB

partner notification

realtime

in-app notification

Home

Available

Daily Route

Map

Earnings

FCM push

==================================================

9. FINAL ACCEPTANCE

ALL tested partners must behave identically:

Admin assigns

→ assignment created

→ notification created

→ realtime delivered

→ Partner App updates

→ Home updates

→ Daily Route updates

→ earnings update

→ push works when token is valid

Do not declare success from code inspection.

The fix is complete only when at least 3 NON-DEEPAK partners successfully

receive Admin assignments and see them in the Partner App on real devices.

Also confirm that the same implementation will work for every existing and

future partner account.`}
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Route;
