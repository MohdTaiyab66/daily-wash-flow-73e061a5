-- Enforce single default vehicle per user

-- 1) Column default: new vehicles no longer auto-default; trigger handles first-vehicle case.
ALTER TABLE public.customer_vehicles ALTER COLUMN is_default SET DEFAULT false;

-- 2) Data cleanup: keep only the earliest created row per user as default.
WITH ranked AS (
  SELECT id, user_id,
         row_number() OVER (PARTITION BY user_id ORDER BY created_at ASC, id ASC) AS rn
  FROM public.customer_vehicles
  WHERE is_default = true
)
UPDATE public.customer_vehicles v
SET is_default = false
FROM ranked r
WHERE v.id = r.id AND r.rn > 1;

-- Ensure every user with at least one vehicle has exactly one default (promote earliest if none).
WITH need_default AS (
  SELECT user_id
  FROM public.customer_vehicles
  GROUP BY user_id
  HAVING bool_or(is_default) = false
),
promote AS (
  SELECT DISTINCT ON (v.user_id) v.id
  FROM public.customer_vehicles v
  JOIN need_default n ON n.user_id = v.user_id
  ORDER BY v.user_id, v.created_at ASC, v.id ASC
)
UPDATE public.customer_vehicles v
SET is_default = true
FROM promote p
WHERE v.id = p.id;

-- 3) Trigger: enforce single-default and auto-default the first vehicle per user.
CREATE OR REPLACE FUNCTION public.tg_customer_vehicles_single_default()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- If this row is being marked default, unset any other defaults for the same user.
  IF NEW.is_default = true THEN
    UPDATE public.customer_vehicles
       SET is_default = false
     WHERE user_id = NEW.user_id
       AND id <> NEW.id
       AND is_default = true;
    RETURN NEW;
  END IF;

  -- On insert, if the user has no default vehicle yet, promote this one.
  IF TG_OP = 'INSERT' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.customer_vehicles
       WHERE user_id = NEW.user_id AND is_default = true AND id <> NEW.id
    ) THEN
      NEW.is_default := true;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_customer_vehicles_single_default ON public.customer_vehicles;
CREATE TRIGGER trg_customer_vehicles_single_default
BEFORE INSERT OR UPDATE OF is_default, user_id ON public.customer_vehicles
FOR EACH ROW
EXECUTE FUNCTION public.tg_customer_vehicles_single_default();