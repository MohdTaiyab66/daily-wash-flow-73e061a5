-- FINAL URGENT PAYMENT FIX
-- This migration ensures the bookings table CHECK constraints exactly match
-- the values used in the confirm_customer_booking RPC.
-- The RPC uses: status = 'pending_payment', payment_status = 'pending'

DO $$
BEGIN
    -- 1. Drop existing constraints to be absolutely sure we redefine them correctly.
    -- We drop both possible names to be safe.
    ALTER TABLE public.bookings DROP CONSTRAINT IF EXISTS bookings_status_check;
    ALTER TABLE public.bookings DROP CONSTRAINT IF EXISTS bookings_payment_status_check;
    
    -- 2. Define canonical status values.
    -- status: must include 'pending_payment' (initial state)
    ALTER TABLE public.bookings ADD CONSTRAINT bookings_status_check 
        CHECK (status IN ('pending_payment', 'paid', 'active', 'completed', 'cancelled', 'failed', 'refunded'));
    
    -- 3. Define canonical payment_status values.
    -- payment_status: must include 'pending' (initial state)
    ALTER TABLE public.bookings ADD CONSTRAINT bookings_payment_status_check 
        CHECK (payment_status IN ('pending', 'paid', 'failed', 'refunded'));

    -- 4. Audit existing rows: if any row violates these (unlikely if they were failing insert),
    -- this migration will fail, which is good for safety.
END $$;

-- Ensure proper grants
GRANT SELECT, INSERT, UPDATE ON public.bookings TO authenticated;
GRANT ALL ON public.bookings TO service_role;
