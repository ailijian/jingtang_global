CREATE OR REPLACE FUNCTION public.claim_expired_source_asset_upload_cleanup(
  batch_size INTEGER,
  upload_cutoff TIMESTAMPTZ
)
RETURNS TABLE (
  asset_id UUID,
  workspace_id UUID,
  object_key TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF batch_size < 1 OR batch_size > 100 THEN
    RAISE EXCEPTION 'source asset cleanup batch size must be between 1 and 100';
  END IF;
  IF upload_cutoff IS NULL THEN
    RAISE EXCEPTION 'source asset cleanup cutoff is required';
  END IF;

  RETURN QUERY
  WITH candidates AS MATERIALIZED (
    SELECT
      asset.id,
      asset.status = 'pending_upload'::public.source_asset_status AS newly_expired
    FROM public.source_assets AS asset
    WHERE asset.content_id IS NULL
      AND (
        (
          asset.status = 'pending_upload'::public.source_asset_status
          AND asset.created_at <= upload_cutoff
        )
        OR (
          asset.status = 'failed'::public.source_asset_status
          AND asset.failure_category = 'upload_expired_cleanup_pending'
          AND asset.updated_at <= clock_timestamp() - interval '30 seconds'
        )
      )
    ORDER BY asset.created_at ASC, asset.id ASC
    FOR UPDATE SKIP LOCKED
    LIMIT batch_size
  ),
  updated AS (
    UPDATE public.source_assets AS asset
    SET
      status = 'failed'::public.source_asset_status,
      failure_category = 'upload_expired_cleanup_pending',
      updated_at = clock_timestamp()
    FROM candidates
    WHERE asset.id = candidates.id
    RETURNING
      asset.id AS asset_id,
      asset.workspace_id,
      asset.object_key::TEXT,
      candidates.newly_expired
  ),
  audit_rows AS (
    INSERT INTO public.audit_events (
      occurred_at,
      workspace_id,
      actor_user_id,
      actor_type,
      action,
      target_type,
      target_id,
      result,
      correlation_id,
      metadata
    )
    SELECT
      clock_timestamp(),
      updated.workspace_id,
      NULL,
      'system',
      'source_asset.upload_failed',
      'source_asset',
      updated.asset_id::TEXT,
      'failed',
      gen_random_uuid(),
      jsonb_build_object(
        'failure_category', 'upload_expired',
        'cleanup_state', 'pending'
      )
    FROM updated
    WHERE updated.newly_expired
    RETURNING id
  )
  SELECT updated.asset_id, updated.workspace_id, updated.object_key
  FROM updated;
END;
$$;

CREATE INDEX "source_assets_pending_upload_cleanup_idx"
  ON public.source_assets (created_at ASC, id ASC)
  WHERE content_id IS NULL
    AND status = 'pending_upload'::public.source_asset_status;

CREATE INDEX "source_assets_failed_upload_cleanup_idx"
  ON public.source_assets (updated_at ASC, id ASC)
  WHERE content_id IS NULL
    AND status = 'failed'::public.source_asset_status
    AND failure_category = 'upload_expired_cleanup_pending';

CREATE OR REPLACE FUNCTION public.complete_source_asset_upload_cleanup(asset_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  UPDATE public.source_assets AS asset
  SET
    failure_category = 'upload_expired',
    updated_at = clock_timestamp()
  WHERE asset.id = asset_id
    AND asset.content_id IS NULL
    AND asset.status = 'failed'::public.source_asset_status
    AND asset.failure_category = 'upload_expired_cleanup_pending';

  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_expired_source_asset_upload_cleanup(INTEGER, TIMESTAMPTZ)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.complete_source_asset_upload_cleanup(UUID)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_expired_source_asset_upload_cleanup(INTEGER, TIMESTAMPTZ)
  TO jingtang_worker;
GRANT EXECUTE ON FUNCTION public.complete_source_asset_upload_cleanup(UUID)
  TO jingtang_worker;
