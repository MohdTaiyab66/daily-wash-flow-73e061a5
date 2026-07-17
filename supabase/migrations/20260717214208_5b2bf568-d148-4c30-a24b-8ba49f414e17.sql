-- Bug 2 root cause: this AFTER INSERT trigger on bookings unconditionally
-- pushes "new_booking" notifications to every partner in the area, with no
-- payment_status gate. Bookings are created with payment_status='pending'
-- BEFORE Razorpay checkout, so partners were being paged for unpaid work.
-- The correct path (paid → activate_paid_booking → sweep_subscription_offers
-- → subscription_offers → offer-push-dispatch) is fully payment-gated and
-- remains intact.

DROP TRIGGER IF EXISTS trg_notify_partners_new_booking ON public.bookings;
DROP FUNCTION IF EXISTS public.notify_partners_new_booking();