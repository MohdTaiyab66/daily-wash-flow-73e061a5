
-- Replace handle_new_partner with a router that only creates a partner row
-- when the new user signed up as a partner. Customer signups insert into
-- customer_profiles instead. Other roles (e.g. admin) are ignored.

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_role text := COALESCE(NEW.raw_user_meta_data->>'role', 'partner');
  v_phone text := COALESCE(NEW.raw_user_meta_data->>'phone', NEW.phone, '');
  v_name  text := NEW.raw_user_meta_data->>'full_name';
BEGIN
  IF v_role = 'customer' THEN
    INSERT INTO public.customer_profiles (user_id, full_name, phone)
    VALUES (NEW.id, v_name, NULLIF(v_phone, ''))
    ON CONFLICT (user_id) DO NOTHING;
  ELSIF v_role = 'partner' THEN
    INSERT INTO public.partners (id, phone, email, full_name)
    VALUES (NEW.id, COALESCE(NULLIF(v_phone, ''), NEW.email), NEW.email, v_name)
    ON CONFLICT (id) DO NOTHING;
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Never block auth signup on bootstrap errors; the app re-upserts on first load.
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();
