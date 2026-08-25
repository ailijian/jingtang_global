DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "channels"
    GROUP BY "workspace_id", "platform"
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23505',
      MESSAGE = 'Cannot enforce one channel per Workspace and platform while duplicate channel rows exist. Resolve the duplicates without discarding authorized data, then retry the migration.';
  END IF;
END
$$;

DROP INDEX "channels_workspace_id_platform_external_account_id_key";

CREATE UNIQUE INDEX "channels_workspace_id_platform_key"
  ON "channels"("workspace_id", "platform");
