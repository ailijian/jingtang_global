-- Start the provider refresh before the 30-day Authorized Data boundary. The
-- lifecycle deadline is the exact data expiry and is therefore also the point
-- after which a failed refresh must erase the local authorization material.
CREATE OR REPLACE FUNCTION enqueue_due_lifecycle_operations()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  inserted_count INTEGER;
BEGIN
  INSERT INTO public.lifecycle_operations (
    kind, workspace_id, channel_id, dedupe_key, request_reference, correlation_id,
    requested_at, deadline_at, next_attempt_at, retention_expires_at
  )
  SELECT
    'authorized_data_retention'::public.lifecycle_operation_kind,
    channel.workspace_id,
    channel.id,
    'authorized_data_retention:' || channel.id::TEXT || ':' || channel.authorized_data_expires_at::TEXT,
    'ADR-' || upper(substr(md5(channel.id::TEXT || channel.authorized_data_expires_at::TEXT), 1, 20)),
    gen_random_uuid(),
    CURRENT_TIMESTAMP,
    channel.authorized_data_expires_at,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP + INTERVAL '365 days'
  FROM public.channels channel
  WHERE channel.platform = 'youtube'
    AND channel.state = 'connected'::public.channel_state
    AND channel.authorized_data_expires_at <= CURRENT_TIMESTAMP + INTERVAL '1 day'
  ON CONFLICT (dedupe_key) DO NOTHING;
  GET DIAGNOSTICS inserted_count = ROW_COUNT;

  INSERT INTO public.lifecycle_operations (
    kind, dedupe_key, request_reference, correlation_id, requested_at,
    deadline_at, next_attempt_at, retention_expires_at
  ) VALUES (
    'retention_purge'::public.lifecycle_operation_kind,
    'retention_purge:' || CURRENT_DATE::TEXT,
    'RTP-' || replace(CURRENT_DATE::TEXT, '-', ''),
    gen_random_uuid(), CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + INTERVAL '1 day',
    CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + INTERVAL '365 days'
  ) ON CONFLICT (dedupe_key) DO NOTHING;
  RETURN inserted_count;
END;
$$;

REVOKE ALL ON FUNCTION enqueue_due_lifecycle_operations() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION enqueue_due_lifecycle_operations() TO jingtang_worker;
