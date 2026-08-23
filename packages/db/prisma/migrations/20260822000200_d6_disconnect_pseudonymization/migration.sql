ALTER TABLE "data_deletion_requests"
  ADD COLUMN "pending_object_keys" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

CREATE OR REPLACE FUNCTION prevent_submitted_platform_version_mutation()
RETURNS TRIGGER AS $$
DECLARE
  maintenance_mode TEXT := current_setting('app.platform_version_maintenance', true);
BEGIN
  IF TG_OP = 'DELETE'
    AND current_setting('app.workspace_deletion_maintenance', true) = 'on'
    AND current_user = pg_catalog.pg_get_userbyid((
      SELECT "proowner"
      FROM pg_catalog.pg_proc
      WHERE "oid" = pg_catalog.to_regprocedure(
        'public.delete_workspace_immutable_history(uuid,uuid)'
      )
    ))
    AND OLD."workspace_id" = NULLIF(current_setting('app.workspace_id', true), '')::UUID
  THEN
    RETURN OLD;
  END IF;
  IF EXISTS (
    SELECT 1
    FROM "content_revisions"
    WHERE "id" = OLD."revision_id" AND "submitted_at" IS NOT NULL
  ) THEN
    IF TG_OP = 'UPDATE'
      AND maintenance_mode = 'authorized_data_cleanup'
      AND current_user = pg_catalog.pg_get_userbyid((
        SELECT "proowner"
        FROM pg_catalog.pg_proc
        WHERE "oid" = pg_catalog.to_regprocedure(
          'public.pseudonymize_youtube_platform_versions(uuid,uuid,text,text,text)'
        )
      ))
      AND NEW."id" = OLD."id"
      AND NEW."workspace_id" = OLD."workspace_id"
      AND NEW."revision_id" = OLD."revision_id"
      AND NEW."platform" = OLD."platform"
      AND NEW."title" = OLD."title"
      AND NEW."description" = OLD."description"
      AND NEW."privacy_status" = OLD."privacy_status"
      AND NEW."made_for_kids" = OLD."made_for_kids"
      AND NEW."validation_status" = OLD."validation_status"
      AND NEW."created_at" = OLD."created_at"
      AND (
        (
          NEW."account_reference" LIKE 'disconnected:%'
          AND NEW."account_display_name" = 'Disconnected YouTube channel'
        )
        OR (
          NEW."account_reference" LIKE 'expired:%'
          AND NEW."account_display_name" = 'Expired YouTube authorization'
        )
      )
    THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'platform versions of submitted revisions are immutable';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION prevent_submitted_revision_mutation()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE'
    AND current_setting('app.workspace_deletion_maintenance', true) = 'on'
    AND current_user = pg_catalog.pg_get_userbyid((
      SELECT "proowner"
      FROM pg_catalog.pg_proc
      WHERE "oid" = pg_catalog.to_regprocedure(
        'public.delete_workspace_immutable_history(uuid,uuid)'
      )
    ))
    AND OLD."workspace_id" = NULLIF(current_setting('app.workspace_id', true), '')::UUID
  THEN
    RETURN OLD;
  END IF;
  IF OLD."submitted_at" IS NOT NULL THEN
    RAISE EXCEPTION 'submitted content revisions are immutable';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION prevent_approval_decision_mutation()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE'
    AND current_setting('app.workspace_deletion_maintenance', true) = 'on'
    AND current_user = pg_catalog.pg_get_userbyid((
      SELECT "proowner"
      FROM pg_catalog.pg_proc
      WHERE "oid" = pg_catalog.to_regprocedure(
        'public.delete_workspace_immutable_history(uuid,uuid)'
      )
    ))
    AND OLD."workspace_id" = NULLIF(current_setting('app.workspace_id', true), '')::UUID
  THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'approval decisions are append-only';
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION pseudonymize_youtube_platform_versions(
  target_workspace_id UUID,
  target_channel_id UUID,
  target_account_reference TEXT,
  replacement_account_reference TEXT,
  replacement_account_display_name TEXT
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
  IF target_account_reference IS NULL
    OR target_account_reference = ''
    OR length(replacement_account_reference) > 255
    OR NOT EXISTS (
      SELECT 1
      FROM public.channels AS channel
      WHERE channel.id = target_channel_id
        AND channel.workspace_id = target_workspace_id
        AND channel.platform = 'youtube'
        AND channel.external_account_id = target_account_reference
        AND (
          (
            channel.state = 'disconnecting'::public.channel_state
            AND replacement_account_reference = 'disconnected:' || target_channel_id::TEXT
            AND replacement_account_display_name = 'Disconnected YouTube channel'
          )
          OR (
            channel.state = 'reauthorization_required'::public.channel_state
            AND replacement_account_reference = 'expired:' || target_channel_id::TEXT
            AND replacement_account_display_name = 'Expired YouTube authorization'
          )
        )
    )
  THEN
    RAISE EXCEPTION 'invalid authorized-data replacement';
  END IF;
  PERFORM set_config('app.platform_version_maintenance', 'authorized_data_cleanup', true);
  UPDATE public.platform_versions
  SET
    account_reference = replacement_account_reference,
    account_display_name = replacement_account_display_name,
    updated_at = CURRENT_TIMESTAMP
  WHERE workspace_id = target_workspace_id
    AND platform = 'youtube'::public.platform
    AND account_reference = target_account_reference;
END;
$$;

REVOKE ALL ON FUNCTION pseudonymize_youtube_platform_versions(UUID, UUID, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION pseudonymize_youtube_platform_versions(UUID, UUID, TEXT, TEXT, TEXT) TO jingtang_app;

CREATE OR REPLACE FUNCTION pseudonymize_channel_audit(
  target_workspace_id UUID,
  target_channel_id UUID,
  target_ids TEXT[]
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
  IF target_ids IS NULL
    OR cardinality(target_ids) = 0
    OR NOT target_channel_id::TEXT = ANY(target_ids)
    OR NOT EXISTS (
      SELECT 1
      FROM public.channels AS channel
      WHERE channel.id = target_channel_id
        AND channel.workspace_id = target_workspace_id
        AND channel.platform = 'youtube'
        AND channel.state IN (
          'disconnecting'::public.channel_state,
          'reauthorization_required'::public.channel_state
        )
    )
    OR EXISTS (
      SELECT 1
      FROM unnest(target_ids) AS target(target_id)
      WHERE target.target_id <> target_channel_id::TEXT
        AND NOT EXISTS (
          SELECT 1
          FROM public.platform_executions AS execution
          JOIN public.platform_versions AS version
            ON version.id = execution.platform_version_id
          WHERE execution.id::TEXT = target.target_id
            AND execution.workspace_id = target_workspace_id
            AND version.workspace_id = target_workspace_id
            AND version.account_reference IN (
              'disconnected:' || target_channel_id::TEXT,
              'expired:' || target_channel_id::TEXT
            )
        )
        AND NOT EXISTS (
          SELECT 1
          FROM public.publishing_intents AS intent
          WHERE intent.id::TEXT = target.target_id
            AND intent.workspace_id = target_workspace_id
            AND intent.account_references && ARRAY[
              'disconnected:' || target_channel_id::TEXT,
              'expired:' || target_channel_id::TEXT
            ]::TEXT[]
        )
    )
  THEN
    RAISE EXCEPTION 'invalid channel audit pseudonymization target';
  END IF;
  PERFORM set_config('app.audit_maintenance', 'pseudonymize', true);
  UPDATE public.audit_events
  SET metadata = '{}'::JSONB
  WHERE workspace_id = target_workspace_id
    AND target_id = ANY(target_ids);
END;
$$;

REVOKE ALL ON FUNCTION pseudonymize_channel_audit(UUID, UUID, TEXT[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION pseudonymize_channel_audit(UUID, UUID, TEXT[]) TO jingtang_app;

CREATE OR REPLACE FUNCTION prevent_audit_event_mutation()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'UPDATE'
    AND current_setting('app.audit_maintenance', true) = 'pseudonymize'
    AND current_user IN (
      pg_catalog.pg_get_userbyid((
        SELECT "proowner"
        FROM pg_catalog.pg_proc
        WHERE "oid" = pg_catalog.to_regprocedure('public.pseudonymize_workspace_audit(uuid)')
      )),
      pg_catalog.pg_get_userbyid((
        SELECT "proowner"
        FROM pg_catalog.pg_proc
        WHERE "oid" = pg_catalog.to_regprocedure(
          'public.pseudonymize_channel_audit(uuid,uuid,text[])'
        )
      ))
    )
    AND NEW."id" = OLD."id"
    AND NEW."occurred_at" = OLD."occurred_at"
    AND NEW."workspace_id" = OLD."workspace_id"
    AND NEW."actor_type" = OLD."actor_type"
    AND NEW."action" = OLD."action"
    AND NEW."target_type" = OLD."target_type"
    AND NEW."target_id" = OLD."target_id"
    AND NEW."result" = OLD."result"
    AND NEW."correlation_id" = OLD."correlation_id"
    AND (NEW."actor_user_id" IS NOT DISTINCT FROM OLD."actor_user_id" OR NEW."actor_user_id" IS NULL)
    AND NEW."metadata" = '{}'::JSONB
  THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'audit_events are append-only';
END;
$$ LANGUAGE plpgsql;

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
      AND (
        deletion_request.state = 'completed'::public.data_deletion_state
        OR (
          workspace.lifecycle_state = 'deletion_pending'::public.workspace_lifecycle_state
          AND deletion_request.state IN (
            'processing'::public.data_deletion_state,
            'failed'::public.data_deletion_state
          )
        )
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

REVOKE ALL ON FUNCTION delete_workspace_immutable_history(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION delete_workspace_immutable_history(UUID, UUID) TO jingtang_app;
