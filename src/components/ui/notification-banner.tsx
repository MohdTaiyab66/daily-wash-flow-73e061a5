import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bell, Car, Sparkles, Droplets, AlertTriangle, CreditCard, CheckCircle2, Navigation, ChevronRight, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useNavigate } from '@tanstack/react-router';

export type InAppNotification = {
  id: string;
  title: string;
  body: string;
  type: string;
  link?: string;
  data?: Record<string, any>;
};

const ICONS: Record<string, any> = {
  new_booking: Car,
  assignment_released: Navigation,
  service_started: Droplets,
  service_completed: CheckCircle2,
  vehicle_unavailable: AlertTriangle,
  vehicle_dirty: AlertTriangle,
  payment_success: CreditCard,
  default: Bell,
};

export function NotificationBanner() {
  const [notification, setNotification] = useState<InAppNotification | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const handleNotification = (event: CustomEvent<InAppNotification>) => {
      setNotification(event.detail);
      
      // Auto-hide after 6 seconds
      const timer = setTimeout(() => {
        setNotification(prev => prev?.id === event.detail.id ? null : prev);
      }, 6000);
      
      return () => clearTimeout(timer);
    };

    window.addEventListener('urbanwash:in-app-notification' as any, handleNotification as any);
    return () => window.removeEventListener('urbanwash:in-app-notification' as any, handleNotification as any);
  }, []);

  if (!notification) return null;

  const Icon = ICONS[notification.type] || ICONS.default;
  const isWarning = notification.type.includes('unavailable') || notification.type.includes('dirty') || notification.type.includes('failed');

  const handleClick = () => {
    if (notification.link) {
      navigate({ to: notification.link as any });
    }
    setNotification(null);
  };

  return (
    <div className="fixed top-[env(safe-area-inset-top,20px)] inset-x-0 z-[100] px-4 pointer-events-none">
      <AnimatePresence>
        {notification && (
          <motion.div
            initial={{ y: -100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -100, opacity: 0 }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="mx-auto max-w-md pointer-events-auto"
          >
            <div 
              onClick={handleClick}
              className="relative overflow-hidden rounded-2xl bg-white shadow-[0_8px_30px_rgb(0,0,0,0.12)] border border-black/5 p-4 flex items-start gap-4 active:scale-[0.98] transition-transform cursor-pointer"
            >
              {/* Top Accent Bar */}
              <div className="absolute top-0 inset-x-0 h-1 bg-[#FF6B00]" />

              <div className={cn(
                "mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
                isWarning ? "bg-orange-50 text-orange-600" : "bg-orange-50 text-[#FF6B00]"
              )}>
                <Icon className="h-5 w-5" />
              </div>

              <div className="flex-1 min-w-0 pr-6">
                <h4 className="text-[15px] font-bold text-[#171717] leading-tight truncate">
                  {notification.title}
                </h4>
                <p className="mt-1 text-[13px] font-medium text-[#666666] leading-snug line-clamp-2">
                  {notification.body}
                </p>
                
                {notification.link && (
                  <div className="mt-2 flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-[#FF6B00]">
                    {notification.type.includes('booking') || notification.type.includes('work') ? 'View Work' : 'View Details'}
                    <ChevronRight className="h-3 w-3" />
                  </div>
                )}
              </div>

              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  setNotification(null);
                }}
                className="absolute top-3 right-3 p-1 rounded-full hover:bg-black/5 transition-colors"
              >
                <X className="h-4 w-4 text-[#8A8A8A]" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
