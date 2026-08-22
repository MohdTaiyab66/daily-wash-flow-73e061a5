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
                                        
                                            
                                            P0 FINAL — IDENTITY RESOLUTION + MULTI-PARTNER E2E VALIDATION

Do NOT modify the UI or landing page.

The latest implementation claims the root cause was identity fragmentation:

multiple user IDs associated with the same phone/account.

It also claims:

- phone-based recovery is implemented

- partner dispatch uses the correct active FCM token

- all Partner screens use realtime invalidation

- no Deepak-specific logic remains

Now prove this with REAL transactions.

==================================================

1. CANONICAL IDENTITY

==================================================

For each tested partner verify:

partners.id

auth.users.id

user_roles.user_id

push_tokens user/account identity

assignments.partner_id

partner_notifications.partner_id

Identify the CANONICAL partner/account identity.

Phone matching may be used ONLY as a fallback/recovery mechanism.

Do NOT use phone number as the primary assignment identity.

==================================================

2. DEEPAK TEST

==================================================

Admin assigns a fresh Daily Shine booking to:

Deepak 9000000006

Verify:

assignment DB

partner notification

realtime

Home

Available

Daily Route

Map

Earnings

FCM push

==================================================

3. NON-DEEPAK TESTS

==================================================

Repeat with at least THREE different non-Deepak partners.

Use:

Partner A

Partner B

Partner C

Each must receive the exact same assignment flow.

==================================================

4. IDENTITY FRAGMENTATION TEST

==================================================

For one previously affected partner, inspect whether:

phone number

→ multiple user IDs

exist.

If duplicates exist:

verify the system selects the CURRENT ACTIVE CANONICAL PARTNER ACCOUNT.

It must NOT accidentally send the notification to a legacy/customer account.

==================================================

5. DATABASE

==================================================

After Admin assignment verify:

assignment.partner_id

=

canonical partner id

partner_notifications.partner_id

=

same canonical partner id

push token owner

=

same canonical account

==================================================

6. REALTIME

==================================================

For every tested partner:

event emitted

event received

partner identity matched

query invalidation fired

assignment refetched

No manual refresh.

==================================================

7. PARTNER APP

==================================================

Immediately after Admin assignment:

Home updates

Available updates

Daily Route updates

Map updates

Notifications update

Earnings update

==================================================

8. PUSH

==================================================

If valid FCM token exists:

push received.

If push fails:

Partner App must STILL update through database/realtime.

==================================================

9. OFFLINE RECOVERY

==================================================

Close one partner's app.

Admin assigns them.

Reopen/login.

Assignment must be recovered automatically.

==================================================

10. FINAL COMPARISON

==================================================

Return:

PARTNER | ASSIGNMENT | IN-APP | REALTIME | HOME | ROUTE | EARNINGS | PUSH

Deepak:

____

Partner A:

____

Partner B:

____

Partner C:

____

==================================================

11. CRITICAL SAFETY CHECK

==================================================

Verify that phone-based resolution can NEVER cause:

Partner A assignment

→ Partner B notification

or:

Partner assignment

→ legacy customer account notification

The final assignment recipient must always resolve to the canonical partner

account.

==================================================

FINAL ACCEPTANCE

At least THREE non-Deepak partners must successfully receive:

✓ Admin assignment

✓ in-app notification

✓ realtime update

✓ Home update

✓ Daily Route update

✓ earnings update

✓ push when token is valid

using the same code path as Deepak.

No manual database repair.

No Deepak exception.

No trial exception.

No phone-only identity assignment.

Only then mark the E2E partner-assignment system as fixed.`}
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Route;
