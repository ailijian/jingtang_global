ALTER TYPE public.platform ADD VALUE IF NOT EXISTS 'tiktok';
ALTER TYPE public.privacy_status ADD VALUE IF NOT EXISTS 'unselected';

ALTER TABLE public.source_assets
  ADD COLUMN IF NOT EXISTS duration_seconds INTEGER;

ALTER TABLE public.platform_versions
  ALTER COLUMN title TYPE VARCHAR(2200);

ALTER TABLE public.source_assets
  ADD CONSTRAINT source_assets_duration_seconds_positive
  CHECK (duration_seconds IS NULL OR duration_seconds > 0);
