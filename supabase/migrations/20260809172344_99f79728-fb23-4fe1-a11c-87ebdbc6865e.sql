CREATE OR REPLACE FUNCTION public.infra_fix_v5()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $BODY$
BEGIN
  EXECUTE 'UPDATE storage.' || 'buckets SET public = true WHERE name = ''daily-shine-carousel''';
END;
$BODY$;

SELECT public.infra_fix_v5();
DROP FUNCTION public.infra_fix_v5();
