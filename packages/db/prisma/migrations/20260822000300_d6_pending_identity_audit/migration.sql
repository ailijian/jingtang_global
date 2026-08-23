CREATE TABLE "pending_identity_audit_events" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "occurred_at" TIMESTAMPTZ(3) NOT NULL,
  "recorded_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "action" VARCHAR(80) NOT NULL,
  "target_type" VARCHAR(40) NOT NULL,
  "target_id" VARCHAR(255) NOT NULL,
  "result" VARCHAR(20) NOT NULL,
  "correlation_id" UUID NOT NULL,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  CONSTRAINT "pending_identity_audit_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "pending_identity_audit_events_correlation_id_action_target_id_key"
  ON "pending_identity_audit_events"("correlation_id", "action", "target_id");
CREATE INDEX "pending_identity_audit_events_user_id_occurred_at_idx"
  ON "pending_identity_audit_events"("user_id", "occurred_at");

ALTER TABLE "pending_identity_audit_events"
  ADD CONSTRAINT "pending_identity_audit_events_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
GRANT SELECT, INSERT ON "pending_identity_audit_events" TO jingtang_app;

ALTER TABLE "pending_identity_audit_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "pending_identity_audit_events" FORCE ROW LEVEL SECURITY;
CREATE POLICY "pending_identity_audit_user_isolation" ON "pending_identity_audit_events"
  USING ("user_id" = NULLIF(current_setting('app.user_id', true), '')::UUID)
  WITH CHECK ("user_id" = NULLIF(current_setting('app.user_id', true), '')::UUID);

CREATE OR REPLACE FUNCTION prevent_pending_identity_audit_rewrite()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE'
    AND current_setting('app.pending_identity_audit_assignment', true) = 'on'
    AND current_user = pg_catalog.pg_get_userbyid((
      SELECT "proowner"
      FROM pg_catalog.pg_proc
      WHERE "oid" = pg_catalog.to_regprocedure(
        'public.assign_pending_identity_audit_events(uuid,uuid)'
      )
    ))
  THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'pending identity audit events are immutable before assignment';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "pending_identity_audit_assignment_only"
BEFORE UPDATE OR DELETE ON "pending_identity_audit_events"
FOR EACH ROW EXECUTE FUNCTION prevent_pending_identity_audit_rewrite();

CREATE OR REPLACE FUNCTION assign_pending_identity_audit_events(
  target_workspace_id UUID,
  target_user_id UUID
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  assigned_count INTEGER;
BEGIN
  IF target_workspace_id IS DISTINCT FROM NULLIF(current_setting('app.workspace_id', true), '')::UUID
    OR target_user_id IS DISTINCT FROM NULLIF(current_setting('app.user_id', true), '')::UUID
  THEN
    RAISE EXCEPTION 'identity audit assignment context mismatch';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.workspaces AS workspace
    JOIN public.memberships AS membership
      ON membership.workspace_id = workspace.id
    WHERE workspace.id = target_workspace_id
      AND workspace.lifecycle_state = 'active'::public.workspace_lifecycle_state
      AND membership.user_id = target_user_id
      AND membership.status = 'active'::public.membership_status
      AND membership.role = 'owner_admin'::public.role
  ) THEN
    RAISE EXCEPTION 'identity audit assignment is not authorized';
  END IF;
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
    pending.occurred_at,
    target_workspace_id,
    target_user_id,
    'user',
    pending.action,
    pending.target_type,
    pending.target_id,
    pending.result,
    pending.correlation_id,
    pending.metadata
  FROM public.pending_identity_audit_events AS pending
  WHERE pending.user_id = target_user_id
    AND NOT EXISTS (
      SELECT 1
      FROM public.audit_events AS assigned
      WHERE assigned.workspace_id = target_workspace_id
        AND assigned.correlation_id = pending.correlation_id
        AND assigned.action = pending.action
        AND assigned.target_id = pending.target_id
    );
  PERFORM set_config('app.pending_identity_audit_assignment', 'on', true);
  DELETE FROM public.pending_identity_audit_events
  WHERE user_id = target_user_id;
  GET DIAGNOSTICS assigned_count = ROW_COUNT;
  RETURN assigned_count;
END;
$$;

REVOKE ALL ON FUNCTION assign_pending_identity_audit_events(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION assign_pending_identity_audit_events(UUID, UUID) TO jingtang_app;
