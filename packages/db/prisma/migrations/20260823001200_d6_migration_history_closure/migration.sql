-- The first D6 migration exposed a narrower, pre-control-plane maintenance
-- function. Later migrations replaced it with the worker-only one-argument
-- function, but PostgreSQL overloads functions by signature, so CREATE OR
-- REPLACE did not remove this legacy entry point.
DROP FUNCTION IF EXISTS public.pseudonymize_workspace_audit(UUID, TEXT[], BOOLEAN);

-- The one-argument replacement was first introduced with PostgreSQL's default
-- PUBLIC execute privilege. Revoking only the app role later was therefore not
-- sufficient because PUBLIC privileges are inherited by every role.
REVOKE ALL ON FUNCTION public.pseudonymize_workspace_audit(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pseudonymize_workspace_audit(UUID) FROM jingtang_app;
GRANT EXECUTE ON FUNCTION public.pseudonymize_workspace_audit(UUID) TO jingtang_worker;
