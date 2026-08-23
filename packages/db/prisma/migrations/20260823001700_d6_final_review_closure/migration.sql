-- D5's test-only local:v1 envelope embedded its wrapped data key in the
-- ciphertext itself. There is no independent key reference to retire, so a
-- forward D6 upgrade must invalidate the authorization instead of pretending
-- that old backup copies can be cryptographically erased.
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
  CURRENT_TIMESTAMP,
  channel.workspace_id,
  NULL,
  'system',
  'channel.reauthorization_required',
  'channel',
  channel.id::TEXT,
  'failed',
  gen_random_uuid(),
  jsonb_build_object(
    'platform', channel.platform,
    'reason', 'legacy_local_v1_envelope_retired'
  )
FROM public.channels AS channel
WHERE channel.token_envelope_ciphertext LIKE 'local:v1:%';

UPDATE public.channels
SET state = 'reauthorization_required'::public.channel_state,
    external_account_id = NULL,
    display_name = NULL,
    granted_scopes = ARRAY[]::TEXT[],
    token_ciphertext_reference = NULL,
    token_envelope_ciphertext = NULL,
    authorized_at = NULL,
    refreshed_at = NULL,
    authorized_data_expires_at = NULL,
    denied_at = COALESCE(denied_at, CURRENT_TIMESTAMP),
    operation_lease_id = NULL,
    operation_lease_until = NULL,
    operation_lease_generation = NULL,
    operation_generation = operation_generation + 1,
    updated_at = CURRENT_TIMESTAMP
WHERE token_envelope_ciphertext LIKE 'local:v1:%';
