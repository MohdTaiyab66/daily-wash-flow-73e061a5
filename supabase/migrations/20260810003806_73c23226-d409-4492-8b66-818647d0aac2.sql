
-- FINAL CLEANUP OF STORAGE POLICIES FOR PUBLISHING
-- This migration removes redundant or legacy policies that might still be flagged by the security scanner.

DO $$
BEGIN
    -- Remove redundant admin management policies for service-photography
    DROP POLICY IF EXISTS "Admins can delete service photography" ON storage.objects;
    DROP POLICY IF EXISTS "Admins can update service photography" ON storage.objects;
    DROP POLICY IF EXISTS "Admins can upload service photography" ON storage.objects;
    DROP POLICY IF EXISTS "Authenticated users can read service photography" ON storage.objects;
    
    -- We keep "Admin Insert/Update/Delete for service-photography" and "Public Read Access for service-photography"
    -- created in the previous migration as they are properly scoped.
END $$;
