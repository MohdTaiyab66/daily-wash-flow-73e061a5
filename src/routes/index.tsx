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
        </div>
      </footer>
    </div>
  );
};

export default Route;
