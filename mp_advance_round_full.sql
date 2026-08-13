                                                        pg_get_functiondef                                                         
-----------------------------------------------------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.mp_advance_round(p_broadcast_id uuid)                                                          +
  RETURNS jsonb                                                                                                                   +
  LANGUAGE plpgsql                                                                                                                +
  SECURITY DEFINER                                                                                                                +
  SET search_path TO 'public'                                                                                                     +
 AS $function$                                                                                                                    +
 DECLARE                                                                                                                          +
   cfg       public.marketplace_settings%ROWTYPE;                                                                                 +
   b         public.marketplace_broadcasts%ROWTYPE;                                                                               +
   next_round int;                                                                                                                +
   next_incentive numeric;                                                                                                        +
   next_radius int;                                                                                                               +
   include_neighbours boolean := false;                                                                                           +
   v_inserted int;                                                                                                                +
   v_top uuid;                                                                                                                    +
 BEGIN                                                                                                                            +
   SELECT * INTO cfg FROM public.marketplace_settings WHERE id=true;                                                              +
   SELECT * INTO b FROM public.marketplace_broadcasts WHERE id = p_broadcast_id FOR UPDATE;                                       +
   IF NOT FOUND OR b.status <> 'open' THEN                                                                                        +
     RETURN jsonb_build_object('ok', false, 'reason','not_open');                                                                 +
   END IF;                                                                                                                        +
                                                                                                                                  +
   UPDATE public.marketplace_offers SET response='expired', responded_at=now()                                                    +
     WHERE broadcast_id = p_broadcast_id AND round = b.current_round AND response='pending';                                      +
   UPDATE public.marketplace_round_history SET ended_at = now()                                                                   +
     WHERE broadcast_id = p_broadcast_id AND round = b.current_round AND ended_at IS NULL;                                        +
                                                                                                                                  +
   next_round := b.current_round + 1;                                                                                             +
                                                                                                                                  +
   IF next_round > cfg.max_rounds THEN                                                                                            +
     IF cfg.auto_assign_final_round THEN                                                                                          +
       SELECT ep.partner_id INTO v_top                                                                                            +
       FROM public.mp_eligible_partners(p_broadcast_id,                                                                           +
                                        COALESCE(cfg.radius_per_round_m[array_length(cfg.radius_per_round_m,1)], 0),              +
                                        cfg.neighbour_polygon_expansion) ep                                                       +
       WHERE NOT EXISTS (                                                                                                         +
         SELECT 1 FROM public.marketplace_offers o                                                                                +
         WHERE o.partner_id = ep.partner_id AND o.response = 'pending'                                                            +
       )                                                                                                                          +
       LIMIT 1;                                                                                                                   +
       IF v_top IS NOT NULL THEN                                                                                                  +
         INSERT INTO public.marketplace_offers (broadcast_id, partner_id, round, incentive)                                       +
         VALUES (p_broadcast_id, v_top, next_round, cfg.max_incentive)                                                            +
         ON CONFLICT DO NOTHING;                                                                                                  +
         UPDATE public.marketplace_broadcasts                                                                                     +
           SET current_round = next_round,                                                                                        +
               current_incentive = cfg.max_incentive,                                                                             +
               current_radius_m = COALESCE(cfg.radius_per_round_m[array_length(cfg.radius_per_round_m,1)],0),                     +
               round_started_at = now(),                                                                                          +
               round_expires_at = now() + make_interval(secs => cfg.round_duration_sec)                                           +
           WHERE id = p_broadcast_id;                                                                                             +
         RETURN jsonb_build_object('ok', true, 'auto_assigned_to', v_top);                                                        +
       END IF;                                                                                                                    +
     END IF;                                                                                                                      +
     UPDATE public.marketplace_broadcasts SET status='admin_alert', updated_at=now() WHERE id = p_broadcast_id;                   +
     INSERT INTO public.admin_alerts (kind, severity, title, body, meta)                                                          +
     VALUES ('marketplace_unassigned','high',                                                                                     +
             'Daily Shine broadcast unassigned',                                                                                  +
             'Daily Shine broadcast reached final round without acceptance',                                                      +
             jsonb_build_object('broadcast_id', p_broadcast_id, 'subscription_id', b.subscription_id));                           +
     RETURN jsonb_build_object('ok', true, 'status','admin_alert');                                                               +
   END IF;                                                                                                                        +
                                                                                                                                  +
   next_incentive := LEAST(                                                                                                       +
     cfg.max_incentive,                                                                                                           +
     cfg.base_incentive + COALESCE((                                                                                              +
       SELECT sum(v) FROM unnest(cfg.round_increments[1:(next_round-1)]) v                                                        +
     ), 0)                                                                                                                        +
   );                                                                                                                             +
   next_radius := COALESCE(cfg.radius_per_round_m[next_round], cfg.radius_per_round_m[array_length(cfg.radius_per_round_m,1)], 0);+
   include_neighbours := cfg.neighbour_polygon_expansion AND next_round = cfg.max_rounds;                                         +
                                                                                                                                  +
   UPDATE public.marketplace_broadcasts                                                                                           +
     SET current_round = next_round,                                                                                              +
         current_incentive = next_incentive,                                                                                      +
         current_radius_m = next_radius,                                                                                          +
         round_started_at = now(),                                                                                                +
         round_expires_at = now() + make_interval(secs => cfg.round_duration_sec),                                                +
         updated_at = now()                                                                                                       +
     WHERE id = p_broadcast_id;                                                                                                   +
                                                                                                                                  +
   -- Skip partners that already hold a live pending offer (another broadcast);                                                   +
   -- otherwise the single-pending-offer trigger aborts the whole tick.                                                           +
   WITH picks AS (                                                                                                                +
     SELECT ep.partner_id, ep.distance_m                                                                                          +
     FROM public.mp_eligible_partners(p_broadcast_id, next_radius, include_neighbours) ep                                         +
     WHERE NOT EXISTS (                                                                                                           +
       SELECT 1 FROM public.marketplace_offers o                                                                                  +
       WHERE o.partner_id = ep.partner_id AND o.response = 'pending'                                                              +
     )                                                                                                                            +
   ), ins AS (                                                                                                                    +
     INSERT INTO public.marketplace_offers (broadcast_id, partner_id, round, incentive, distance_from_route_m)                    +
     SELECT p_broadcast_id, partner_id, next_round, next_incentive, COALESCE(distance_m,0)::int FROM picks                        +
     ON CONFLICT DO NOTHING                                                                                                       +
     RETURNING 1                                                                                                                  +
   )                                                                                                                              +
   SELECT count(*) INTO v_inserted FROM ins;                                                                                      +
                                                                                                                                  +
   INSERT INTO public.marketplace_round_history (broadcast_id, round, incentive, radius_m, offers_sent, reason)                   +
   VALUES (p_broadcast_id, next_round, next_incentive, next_radius, COALESCE(v_inserted,0),                                       +
           CASE WHEN v_inserted=0 THEN 'no_eligible_partners' ELSE 'timeout' END);                                                +
                                                                                                                                  +
   RETURN jsonb_build_object('ok', true, 'round', next_round, 'incentive', next_incentive,                                        +
                             'radius_m', next_radius, 'offers_sent', COALESCE(v_inserted,0));                                     +
 END;                                                                                                                             +
 $function$                                                                                                                       +
 
(1 row)

