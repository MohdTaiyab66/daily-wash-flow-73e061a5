
create or replace function public.admin_zone_upsert(payload jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not has_role(auth.uid(), 'admin') then raise exception 'forbidden'; end if;
  if (payload ? 'id') and (payload->>'id') is not null then
    update coverage_zones set
      name = coalesce(payload->>'name', name),
      city = nullif(payload->>'city',''),
      color = coalesce(payload->>'color', color),
      priority = coalesce((payload->>'priority')::int, priority),
      zone_type = coalesce(payload->>'zone_type', zone_type),
      center_lat = nullif(payload->>'center_lat','')::float8,
      center_lng = nullif(payload->>'center_lng','')::float8,
      radius_m = nullif(payload->>'radius_m','')::int,
      polygon = case when payload ? 'polygon' then payload->'polygon' else polygon end,
      status = coalesce(payload->>'status', status),
      daily_shine_enabled = coalesce((payload->>'daily_shine_enabled')::bool, daily_shine_enabled),
      premium_enabled = coalesce((payload->>'premium_enabled')::bool, premium_enabled),
      washing_enabled = coalesce((payload->>'washing_enabled')::bool, washing_enabled),
      interior_enabled = coalesce((payload->>'interior_enabled')::bool, interior_enabled),
      exterior_enabled = coalesce((payload->>'exterior_enabled')::bool, exterior_enabled),
      int_ext_enabled = coalesce((payload->>'int_ext_enabled')::bool, int_ext_enabled),
      deep_clean_enabled = coalesce((payload->>'deep_clean_enabled')::bool, deep_clean_enabled),
      polish_enabled = coalesce((payload->>'polish_enabled')::bool, polish_enabled),
      cutter_polish_enabled = coalesce((payload->>'cutter_polish_enabled')::bool, cutter_polish_enabled),
      roof_cleaning_enabled = coalesce((payload->>'roof_cleaning_enabled')::bool, roof_cleaning_enabled),
      seat_cleaning_enabled = coalesce((payload->>'seat_cleaning_enabled')::bool, seat_cleaning_enabled),
      corporate_fleet_enabled = coalesce((payload->>'corporate_fleet_enabled')::bool, corporate_fleet_enabled),
      emergency_enabled = coalesce((payload->>'emergency_enabled')::bool, emergency_enabled),
      max_daily_capacity = nullif(payload->>'max_daily_capacity','')::int,
      max_active_partners = nullif(payload->>'max_active_partners','')::int,
      max_customers = nullif(payload->>'max_customers','')::int,
      max_services = nullif(payload->>'max_services','')::int,
      assignment_radius_m = nullif(payload->>'assignment_radius_m','')::int,
      route_optimization_radius_m = nullif(payload->>'route_optimization_radius_m','')::int,
      travel_buffer_min = nullif(payload->>'travel_buffer_min','')::int,
      updated_at = now()
    where id = (payload->>'id')::uuid
    returning id into v_id;
  else
    insert into coverage_zones (
      name, city, color, priority, zone_type, center_lat, center_lng, radius_m, polygon, status,
      daily_shine_enabled, premium_enabled, washing_enabled, interior_enabled, exterior_enabled,
      int_ext_enabled, deep_clean_enabled, polish_enabled, cutter_polish_enabled,
      roof_cleaning_enabled, seat_cleaning_enabled, corporate_fleet_enabled, emergency_enabled,
      max_daily_capacity, max_active_partners, max_customers, max_services,
      assignment_radius_m, route_optimization_radius_m, travel_buffer_min
    ) values (
      payload->>'name', nullif(payload->>'city',''),
      coalesce(payload->>'color','#3b82f6'),
      coalesce((payload->>'priority')::int, 10),
      payload->>'zone_type',
      nullif(payload->>'center_lat','')::float8,
      nullif(payload->>'center_lng','')::float8,
      nullif(payload->>'radius_m','')::int,
      case when payload ? 'polygon' then payload->'polygon' else null end,
      coalesce(payload->>'status','active'),
      coalesce((payload->>'daily_shine_enabled')::bool, false),
      coalesce((payload->>'premium_enabled')::bool, false),
      coalesce((payload->>'washing_enabled')::bool, false),
      coalesce((payload->>'interior_enabled')::bool, false),
      coalesce((payload->>'exterior_enabled')::bool, false),
      coalesce((payload->>'int_ext_enabled')::bool, false),
      coalesce((payload->>'deep_clean_enabled')::bool, false),
      coalesce((payload->>'polish_enabled')::bool, false),
      coalesce((payload->>'cutter_polish_enabled')::bool, false),
      coalesce((payload->>'roof_cleaning_enabled')::bool, false),
      coalesce((payload->>'seat_cleaning_enabled')::bool, false),
      coalesce((payload->>'corporate_fleet_enabled')::bool, false),
      coalesce((payload->>'emergency_enabled')::bool, false),
      nullif(payload->>'max_daily_capacity','')::int,
      nullif(payload->>'max_active_partners','')::int,
      nullif(payload->>'max_customers','')::int,
      nullif(payload->>'max_services','')::int,
      nullif(payload->>'assignment_radius_m','')::int,
      nullif(payload->>'route_optimization_radius_m','')::int,
      nullif(payload->>'travel_buffer_min','')::int
    ) returning id into v_id;
  end if;
  return v_id;
end $$;

create or replace function public.admin_zone_delete(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not has_role(auth.uid(), 'admin') then raise exception 'forbidden'; end if;
  delete from coverage_zones where id = p_id;
end $$;

create or replace function public.admin_zone_set_status(p_id uuid, p_status text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not has_role(auth.uid(), 'admin') then raise exception 'forbidden'; end if;
  update coverage_zones set status = p_status, updated_at = now() where id = p_id;
end $$;

create or replace function public.admin_zone_duplicate(p_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not has_role(auth.uid(), 'admin') then raise exception 'forbidden'; end if;
  insert into coverage_zones (
    name, city, color, priority, zone_type, center_lat, center_lng, radius_m, polygon, status,
    daily_shine_enabled, premium_enabled, washing_enabled, interior_enabled, exterior_enabled,
    int_ext_enabled, deep_clean_enabled, polish_enabled, cutter_polish_enabled,
    roof_cleaning_enabled, seat_cleaning_enabled, corporate_fleet_enabled, emergency_enabled,
    max_daily_capacity, max_active_partners, max_customers, max_services,
    assignment_radius_m, route_optimization_radius_m, travel_buffer_min
  )
  select name || ' (copy)', city, color, priority, zone_type, center_lat, center_lng, radius_m, polygon, 'paused',
    daily_shine_enabled, premium_enabled, washing_enabled, interior_enabled, exterior_enabled,
    int_ext_enabled, deep_clean_enabled, polish_enabled, cutter_polish_enabled,
    roof_cleaning_enabled, seat_cleaning_enabled, corporate_fleet_enabled, emergency_enabled,
    max_daily_capacity, max_active_partners, max_customers, max_services,
    assignment_radius_m, route_optimization_radius_m, travel_buffer_min
  from coverage_zones where id = p_id returning id into v_id;
  return v_id;
end $$;

grant execute on function public.admin_zone_upsert(jsonb) to authenticated;
grant execute on function public.admin_zone_delete(uuid) to authenticated;
grant execute on function public.admin_zone_set_status(uuid, text) to authenticated;
grant execute on function public.admin_zone_duplicate(uuid) to authenticated;
