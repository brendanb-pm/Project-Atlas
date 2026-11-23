-- Apply as the dedicated database owner after migration. The guard also protects
-- an accidentally reused connection to another database with a matching role.
BEGIN;
DO $guard$
BEGIN
  IF current_database() <> 'atlas_mos140c_acceptance' OR
     (SELECT shobj_description(oid, 'pg_database') FROM pg_database
       WHERE datname=current_database()) IS DISTINCT FROM 'MOS-140C SYNTHETIC ACCEPTANCE ONLY'
  THEN
    RAISE EXCEPTION 'Not the dedicated MOS-140C acceptance database';
  END IF;
END $guard$;
GRANT SELECT ON atlas_installation, atlas_schema_migrations, atlas_users,
  atlas_tenant_memberships, atlas_external_identities, atlas_assets, atlas_jobs,
  atlas_job_operations, atlas_purchase_requests TO atlas_acceptance_app;
GRANT INSERT ON atlas_security_events TO atlas_acceptance_app;
GRANT SELECT, INSERT ON atlas_work_order_revisions TO atlas_acceptance_app;
GRANT UPDATE ON atlas_jobs TO atlas_acceptance_app;
GRANT INSERT, UPDATE ON atlas_job_operations TO atlas_acceptance_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON
  atlas_auth_sessions, atlas_auth_attempts,
  atlas_contextual_attachments, atlas_contextual_attachment_events,
  atlas_tool_types, atlas_tool_instances, atlas_tool_measurements,
  atlas_tool_condition_events, atlas_holders, atlas_tool_assemblies,
  atlas_tool_machine_assignments, atlas_operation_tool_executions,
  atlas_operation_tool_requirements, atlas_tool_identifiers, atlas_tool_manual_entry_events,
  atlas_ai_field_proposals, atlas_ai_field_reviews, atlas_ai_processing_events,
  atlas_ai_processing_jobs, atlas_ai_processing_results,
  atlas_ai_review_events, atlas_ai_review_sessions TO atlas_acceptance_app;
COMMIT;
