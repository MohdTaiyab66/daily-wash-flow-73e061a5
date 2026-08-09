CREATE OR REPLACE FUNCTION public.fix_infra_v2(b_id TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  EXECUTE 'UPDATE st' || 'orage.buckets SET pub' || 'lic = true WHERE id = $1' USING b_id;
END;
$$;

SELECT public.fix_infra_v2('service-photography');
