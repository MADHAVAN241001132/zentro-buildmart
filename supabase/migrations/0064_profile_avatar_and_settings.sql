-- 0064_profile_avatar_and_settings.sql
-- Additive migration: add avatar_url to profiles and create profile-avatars storage bucket with per-user RLS.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS avatar_url text;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'profile-avatars',
  'profile-avatars',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'profile_avatars_public_read'
  ) THEN
    CREATE POLICY profile_avatars_public_read
      ON storage.objects FOR SELECT
      USING (bucket_id = 'profile-avatars');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'profile_avatars_owner_insert'
  ) THEN
    CREATE POLICY profile_avatars_owner_insert
      ON storage.objects FOR INSERT TO authenticated
      WITH CHECK (
        bucket_id = 'profile-avatars'
        AND (storage.foldername(name))[1] = auth.uid()::text
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'profile_avatars_owner_update'
  ) THEN
    CREATE POLICY profile_avatars_owner_update
      ON storage.objects FOR UPDATE TO authenticated
      USING (
        bucket_id = 'profile-avatars'
        AND (storage.foldername(name))[1] = auth.uid()::text
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'profile_avatars_owner_delete'
  ) THEN
    CREATE POLICY profile_avatars_owner_delete
      ON storage.objects FOR DELETE TO authenticated
      USING (
        bucket_id = 'profile-avatars'
        AND (storage.foldername(name))[1] = auth.uid()::text
      );
  END IF;
END $$;
