REVOKE DELETE ON "data_deletion_requests" FROM jingtang_app;

CREATE OR REPLACE FUNCTION protect_data_deletion_request()
RETURNS TRIGGER AS $$
DECLARE
  workspace_state public.workspace_lifecycle_state;
BEGIN
  -- Migration owners retain an explicit administrative escape hatch for
  -- isolated restore/replay work. The runtime role never owns this function.
  IF current_user = pg_catalog.pg_get_userbyid((
    SELECT "proowner"
    FROM pg_catalog.pg_proc
    WHERE "oid" = pg_catalog.to_regprocedure('public.protect_data_deletion_request()')
  )) THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'data deletion requests are retained records';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW."state" <> 'processing'::public.data_deletion_state
      OR NEW."requested_by_user_id" IS NULL
      OR NEW."started_at" IS NULL
      OR NEW."completed_at" IS NOT NULL
      OR NEW."failure_category" IS NOT NULL
      OR cardinality(NEW."pending_object_keys") <> 0
    THEN
      RAISE EXCEPTION 'invalid data deletion request creation';
    END IF;
  ELSE
    IF OLD."state" = 'completed'::public.data_deletion_state THEN
      RAISE EXCEPTION 'completed data deletion requests are immutable';
    END IF;
    IF NEW."id" <> OLD."id"
      OR NEW."workspace_id" <> OLD."workspace_id"
      OR NEW."scope" <> OLD."scope"
      OR NEW."request_reference" <> OLD."request_reference"
      OR NEW."data_classes" <> OLD."data_classes"
      OR NEW."requested_at" <> OLD."requested_at"
    THEN
      RAISE EXCEPTION 'data deletion request core fields are immutable';
    END IF;
    IF (OLD."requested_by_user_id" IS NULL AND NEW."requested_by_user_id" IS NOT NULL)
      OR (
        OLD."requested_by_user_id" IS NOT NULL
        AND NEW."requested_by_user_id" IS NOT NULL
        AND NEW."requested_by_user_id" <> OLD."requested_by_user_id"
      )
    THEN
      RAISE EXCEPTION 'data deletion request actor may only be pseudonymized';
    END IF;
    IF OLD."started_at" IS NOT NULL
      AND NEW."started_at" IS DISTINCT FROM OLD."started_at"
    THEN
      RAISE EXCEPTION 'data deletion request start time is immutable';
    END IF;
    IF OLD."started_at" IS NULL
      AND NEW."started_at" IS NOT NULL
      AND NEW."state" <> 'processing'::public.data_deletion_state
    THEN
      RAISE EXCEPTION 'data deletion request start time requires processing state';
    END IF;
    IF OLD."completed_at" IS NOT NULL
      AND NEW."completed_at" IS DISTINCT FROM OLD."completed_at"
    THEN
      RAISE EXCEPTION 'data deletion request completion time is immutable';
    END IF;
    IF OLD."state" = 'pending'::public.data_deletion_state
      AND NEW."state" NOT IN (
        'pending'::public.data_deletion_state,
        'processing'::public.data_deletion_state
      )
    THEN
      RAISE EXCEPTION 'invalid data deletion request state transition';
    END IF;
    IF OLD."state" = 'processing'::public.data_deletion_state
      AND NEW."state" NOT IN (
        'processing'::public.data_deletion_state,
        'failed'::public.data_deletion_state,
        'completed'::public.data_deletion_state
      )
    THEN
      RAISE EXCEPTION 'invalid data deletion request state transition';
    END IF;
    IF OLD."state" = 'failed'::public.data_deletion_state
      AND NEW."state" NOT IN (
        'failed'::public.data_deletion_state,
        'processing'::public.data_deletion_state,
        'completed'::public.data_deletion_state
      )
    THEN
      RAISE EXCEPTION 'invalid data deletion request state transition';
    END IF;
  END IF;

  IF NEW."state" = 'completed'::public.data_deletion_state THEN
    IF NEW."completed_at" IS NULL
      OR NEW."requested_by_user_id" IS NOT NULL
      OR NEW."failure_category" IS NOT NULL
      OR cardinality(NEW."pending_object_keys") <> 0
    THEN
      RAISE EXCEPTION 'invalid completed data deletion request';
    END IF;
  ELSIF NEW."completed_at" IS NOT NULL THEN
    RAISE EXCEPTION 'only completed data deletion requests have a completion time';
  END IF;
  IF NEW."state" IN (
      'processing'::public.data_deletion_state,
      'failed'::public.data_deletion_state,
      'completed'::public.data_deletion_state
    )
    AND NEW."started_at" IS NULL
  THEN
    RAISE EXCEPTION 'started data deletion request requires a start time';
  END IF;

  SELECT workspace."lifecycle_state"
  INTO workspace_state
  FROM public.workspaces AS workspace
  WHERE workspace."id" = NEW."workspace_id";

  IF workspace_state IS NULL THEN
    RAISE EXCEPTION 'data deletion request workspace does not exist';
  END IF;
  IF NEW."state" = 'completed'::public.data_deletion_state
    AND workspace_state <> 'deleted'::public.workspace_lifecycle_state
  THEN
    RAISE EXCEPTION 'completed deletion request requires a deleted workspace';
  END IF;
  IF NEW."state" IN (
      'processing'::public.data_deletion_state,
      'failed'::public.data_deletion_state
    )
    AND workspace_state NOT IN (
      'deletion_pending'::public.workspace_lifecycle_state,
      'deleted'::public.workspace_lifecycle_state
    )
  THEN
    RAISE EXCEPTION 'active workspace cannot have an in-progress deletion request';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "data_deletion_requests_retained_record"
BEFORE INSERT OR UPDATE OR DELETE ON "data_deletion_requests"
FOR EACH ROW EXECUTE FUNCTION protect_data_deletion_request();

CREATE OR REPLACE FUNCTION pseudonymize_workspace_audit(
  target_workspace_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF target_workspace_id IS DISTINCT FROM NULLIF(current_setting('app.workspace_id', true), '')::UUID THEN
    RAISE EXCEPTION 'tenant context mismatch';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.workspaces AS workspace
    JOIN public.data_deletion_requests AS deletion_request
      ON deletion_request.workspace_id = workspace.id
    WHERE workspace.id = target_workspace_id
      AND workspace.lifecycle_state IN (
        'deletion_pending'::public.workspace_lifecycle_state,
        'deleted'::public.workspace_lifecycle_state
      )
      AND deletion_request.state IN (
        'processing'::public.data_deletion_state,
        'failed'::public.data_deletion_state
      )
  ) THEN
    RAISE EXCEPTION 'workspace audit pseudonymization is not authorized';
  END IF;
  PERFORM set_config('app.audit_maintenance', 'pseudonymize', true);
  UPDATE public.audit_events
  SET
    actor_user_id = NULL,
    metadata = '{}'::JSONB
  WHERE workspace_id = target_workspace_id;
END;
$$;

CREATE OR REPLACE FUNCTION delete_workspace_immutable_history(
  target_workspace_id UUID,
  target_request_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF target_workspace_id IS DISTINCT FROM NULLIF(current_setting('app.workspace_id', true), '')::UUID THEN
    RAISE EXCEPTION 'tenant context mismatch';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.data_deletion_requests AS deletion_request
    JOIN public.workspaces AS workspace ON workspace.id = deletion_request.workspace_id
    WHERE deletion_request.id = target_request_id
      AND deletion_request.workspace_id = target_workspace_id
      AND workspace.lifecycle_state IN (
        'deletion_pending'::public.workspace_lifecycle_state,
        'deleted'::public.workspace_lifecycle_state
      )
      AND deletion_request.state IN (
        'processing'::public.data_deletion_state,
        'failed'::public.data_deletion_state
      )
  ) THEN
    RAISE EXCEPTION 'workspace immutable-history deletion is not authorized';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.channels AS channel
    WHERE channel.workspace_id = target_workspace_id
      AND channel.operation_lease_id IS NOT NULL
      AND channel.operation_lease_until > CURRENT_TIMESTAMP
  ) THEN
    RAISE EXCEPTION 'workspace operations are in flight';
  END IF;
  PERFORM set_config('app.workspace_deletion_maintenance', 'on', true);
  DELETE FROM public.approval_decisions WHERE workspace_id = target_workspace_id;
  DELETE FROM public.platform_versions WHERE workspace_id = target_workspace_id;
  DELETE FROM public.content_revisions WHERE workspace_id = target_workspace_id;
END;
$$;

CREATE OR REPLACE FUNCTION restore_delete_workspace_immutable_history(
  target_workspace_id UUID,
  target_request_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.data_deletion_requests AS deletion_request
    WHERE deletion_request.id = target_request_id
      AND deletion_request.workspace_id = target_workspace_id
      AND deletion_request.state = 'completed'::public.data_deletion_state
  ) THEN
    RAISE EXCEPTION 'restore deletion replay is not authorized';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.channels AS channel
    WHERE channel.workspace_id = target_workspace_id
      AND channel.operation_lease_id IS NOT NULL
      AND channel.operation_lease_until > CURRENT_TIMESTAMP
  ) THEN
    RAISE EXCEPTION 'workspace operations are in flight';
  END IF;
  PERFORM set_config('app.workspace_deletion_maintenance', 'on', true);
  DELETE FROM public.approval_decisions WHERE workspace_id = target_workspace_id;
  DELETE FROM public.platform_versions WHERE workspace_id = target_workspace_id;
  DELETE FROM public.content_revisions WHERE workspace_id = target_workspace_id;
END;
$$;

CREATE OR REPLACE FUNCTION restore_pseudonymize_workspace_audit(
  target_workspace_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.data_deletion_requests AS deletion_request
    WHERE deletion_request.workspace_id = target_workspace_id
      AND deletion_request.state = 'completed'::public.data_deletion_state
  ) THEN
    RAISE EXCEPTION 'restore audit pseudonymization is not authorized';
  END IF;
  PERFORM set_config('app.audit_maintenance', 'pseudonymize', true);
  UPDATE public.audit_events
  SET
    actor_user_id = NULL,
    metadata = '{}'::JSONB
  WHERE workspace_id = target_workspace_id;
END;
$$;

REVOKE ALL ON FUNCTION restore_delete_workspace_immutable_history(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION restore_delete_workspace_immutable_history(UUID, UUID) FROM jingtang_app;
REVOKE ALL ON FUNCTION restore_pseudonymize_workspace_audit(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION restore_pseudonymize_workspace_audit(UUID) FROM jingtang_app;
