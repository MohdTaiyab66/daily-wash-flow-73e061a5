-- AUDIT: Inspect the actual database definition of bookings table and its constraints.
-- This migration doesn't change anything, it just provides a way to see what's there
-- if we could run it, but since we can't see live DB, we'll use it to ensure
-- we have a clean slate for the fix.

-- Re-inspecting the inferred standard values based on previous migrations:
-- bookings.status: ('pending_payment', 'paid', 'active', 'completed', 'cancelled', 'refunded')
-- bookings.payment_status: ('pending', 'paid', 'failed', 'refunded')

-- The goal of the next migration will be to ensure these are exactly what the RPC uses.
