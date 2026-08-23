CREATE OR REPLACE FUNCTION lifecycle_operation_deadline_exceeded(
  target_operation_id UUID,
  target_worker_id TEXT,
  target_generation BIGINT
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT COALESCE((
    SELECT operation.deadline_at <= CURRENT_TIMESTAMP
    FROM public.lifecycle_operations operation
    WHERE operation.id = target_operation_id
      AND operation.state = 'claimed'::public.lifecycle_operation_state
      AND operation.claimed_by = target_worker_id
      AND operation.claim_generation = target_generation
      AND operation.claimed_until > CURRENT_TIMESTAMP
  ), FALSE)
$$;

CREATE OR REPLACE FUNCTION read_workspace_data_deletion_status(
  target_reference TEXT,
  viewer_user_id UUID
)
RETURNS TABLE (deletion_state TEXT, failure_category TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT request.state::TEXT, request.failure_category::TEXT
  FROM public.data_deletion_requests request
  WHERE request.request_reference = target_reference
    AND (
      request.requested_by_user_id = viewer_user_id
      OR (
        request.requested_by_user_id IS NULL
        AND EXISTS (
          SELECT 1
          FROM public.users viewer
          WHERE viewer.id = viewer_user_id
            AND viewer.last_workspace_id = request.workspace_id
        )
      )
    )
  LIMIT 1
$$;

REVOKE ALL ON FUNCTION lifecycle_operation_deadline_exceeded(UUID, TEXT, BIGINT) FROM PUBLIC;
REVOKE ALL ON FUNCTION read_workspace_data_deletion_status(TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION lifecycle_operation_deadline_exceeded(UUID, TEXT, BIGINT)
TO jingtang_worker;
GRANT EXECUTE ON FUNCTION read_workspace_data_deletion_status(TEXT, UUID)
TO jingtang_app;
