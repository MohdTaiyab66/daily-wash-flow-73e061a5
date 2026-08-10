
-- CLEANUP OF INSECURE STORAGE POLICIES
-- These specifically target the policies identified in the scan: 
-- "Admin All Carousel" and "Admin All Photography"

DO $$
BEGIN
    -- Drop the specific insecure policies that allowed any authenticated user to manage objects
    DROP POLICY IF EXISTS "Admin All Carousel" ON storage.objects;
    DROP POLICY IF EXISTS "Admin All Photography" ON storage.objects;
    
    -- Drop other variants that might be wide open
    DROP POLICY IF EXISTS "Public Access Carousel" ON storage.objects;
    DROP POLICY IF EXISTS "Public Access DSC" ON storage.objects;
    DROP POLICY IF EXISTS "Public Access Photography" ON storage.objects;
    DROP POLICY IF EXISTS "Public Access to service photography" ON storage.objects;
    DROP POLICY IF EXISTS "Admin Upload DSC" ON storage.objects;
    DROP POLICY IF EXISTS "Admin Update DSC" ON storage.objects;
    DROP POLICY IF EXISTS "Admin Delete DSC" ON storage.objects;
END $$;
