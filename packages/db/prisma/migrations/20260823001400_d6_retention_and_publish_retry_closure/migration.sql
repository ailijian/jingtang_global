CREATE OR REPLACE FUNCTION purge_expired_lifecycle_records()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  audit_count INTEGER := 0;
  account_audit_count INTEGER := 0;
  outbox_count INTEGER := 0;
  invitation_count INTEGER := 0;
  consent_count INTEGER := 0;
  deletion_count INTEGER := 0;
  operation_count INTEGER := 0;
BEGIN
  PERFORM set_config('app.audit_maintenance', 'retention', true);
  DELETE FROM public.audit_events
  WHERE occurred_at < CURRENT_TIMESTAMP - INTERVAL '365 days';
  GET DIAGNOSTICS audit_count = ROW_COUNT;
  DELETE FROM public.account_audit_events
  WHERE retention_expires_at <= CURRENT_TIMESTAMP;
  GET DIAGNOSTICS account_audit_count = ROW_COUNT;
  DELETE FROM public.outbox_messages
  WHERE (state = 'completed'::public.outbox_state AND completed_at < CURRENT_TIMESTAMP - INTERVAL '24 hours')
     OR (state = 'dead'::public.outbox_state AND completed_at < CURRENT_TIMESTAMP - INTERVAL '14 days');
  GET DIAGNOSTICS outbox_count = ROW_COUNT;
  DELETE FROM public.invitations
  WHERE (status IN (
           'accepted'::public.invitation_status,
           'expired'::public.invitation_status,
           'revoked'::public.invitation_status
         )
         AND updated_at <= CURRENT_TIMESTAMP - INTERVAL '7 days')
     OR (status = 'pending'::public.invitation_status
         AND expires_at <= CURRENT_TIMESTAMP - INTERVAL '7 days');
  GET DIAGNOSTICS invitation_count = ROW_COUNT;
  DELETE FROM public.consent_records consent
  USING public.users account
  WHERE account.id = consent.user_id
    AND account.lifecycle_state = 'deleted'
    AND account.deleted_at IS NOT NULL
    AND account.deleted_at <= CURRENT_TIMESTAMP - INTERVAL '365 days'
    AND NOT EXISTS (
      SELECT 1
      FROM public.channels channel
      WHERE channel.consent_record_id = consent.id
    );
  GET DIAGNOSTICS consent_count = ROW_COUNT;
  DELETE FROM public.data_deletion_requests
  WHERE retention_expires_at <= CURRENT_TIMESTAMP;
  GET DIAGNOSTICS deletion_count = ROW_COUNT;
  DELETE FROM public.lifecycle_operations
  WHERE retention_expires_at <= CURRENT_TIMESTAMP
    AND state IN ('completed'::public.lifecycle_operation_state, 'dead'::public.lifecycle_operation_state);
  GET DIAGNOSTICS operation_count = ROW_COUNT;
  RETURN jsonb_build_object(
    'audit_events', audit_count,
    'account_audit_events', account_audit_count,
    'outbox_messages', outbox_count,
    'invitations', invitation_count,
    'consent_records', consent_count,
    'deletion_requests', deletion_count,
    'lifecycle_operations', operation_count
  );
END;
$$;

REVOKE ALL ON FUNCTION purge_expired_lifecycle_records() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION purge_expired_lifecycle_records() TO jingtang_worker;
