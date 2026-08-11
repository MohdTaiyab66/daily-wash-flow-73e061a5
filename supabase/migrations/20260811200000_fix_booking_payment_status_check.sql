-- URGENT PAYMENT BLOCKER FIX
-- The database constraint bookings_payment_status_check (inferred name) is blocking
-- the insertion of bookings with payment_status = 'unpaid' or status = 'pending'.
-- We need to ensure both 'pending' and 'unpaid' are valid for their respective columns.

DO $$
BEGIN
    -- 1. Drop existing constraints if they exist to recreate them with 'unpaid' / 'pending'
    -- Note: Standard names are bookings_status_check and bookings_payment_status_check
    -- derived from: CHECK (status IN (...)) and CHECK (payment_status IN (...))
    
    -- Drop status constraint
    ALTER TABLE public.bookings DROP CONSTRAINT IF EXISTS bookings_status_check;
    
    -- Drop payment_status constraint
    ALTER TABLE public.bookings DROP CONSTRAINT IF EXISTS bookings_payment_status_check;
    
    -- Re-add status constraint with all required values
    -- Original: ('pending_payment','paid','active','completed','cancelled','refunded')
    -- Adding 'pending' as it's being used by confirm_customer_booking
    ALTER TABLE public.bookings ADD CONSTRAINT bookings_status_check 
        CHECK (status IN ('pending', 'pending_payment', 'paid', 'active', 'completed', 'cancelled', 'failed', 'refunded'));
    
    -- Re-add payment_status constraint with all required values
    -- Original: ('pending','paid','failed','refunded')
    -- Adding 'unpaid' as it's being used by the latest confirm_customer_booking
    ALTER TABLE public.bookings ADD CONSTRAINT bookings_payment_status_check 
        CHECK (payment_status IN ('pending', 'unpaid', 'paid', 'failed', 'refunded'));

END $$;

-- Ensure existing 'unpaid' records (if any survived) are valid.
-- The previous RPC might have failed, but if some were forced or if we change logic,
-- we want the DB to accept them.

GRANT SELECT, INSERT, UPDATE ON public.bookings TO authenticated;
GRANT ALL ON public.bookings TO service_role;
