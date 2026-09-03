import { createHash } from 'node:crypto';

// MOS-133E domain migrations deliberately extend, rather than rewrite, the
// C foundation.  Tables retain tenant_id even for one-database-per-tenant
// installations so imports, restores and misrouted requests are rejected by
// relational constraints instead of relying on service-layer filtering.
const identitySql = `
CREATE TABLE atlas_users (
  user_id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE', 'ARCHIVED')),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE atlas_tenant_memberships (
  tenant_id TEXT NOT NULL,
  membership_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE', 'ARCHIVED')),
  roles_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  capabilities_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, membership_id),
  UNIQUE (tenant_id, user_id),
  FOREIGN KEY (tenant_id) REFERENCES atlas_installation (tenant_id),
  FOREIGN KEY (user_id) REFERENCES atlas_users (user_id)
);
CREATE INDEX atlas_tenant_memberships_user_idx ON atlas_tenant_memberships (user_id, tenant_id);
CREATE INDEX atlas_tenant_memberships_status_idx ON atlas_tenant_memberships (tenant_id, status, user_id);
CREATE TABLE atlas_external_identities (
  external_identity_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES atlas_users (user_id),
  provider TEXT NOT NULL,
  issuer TEXT NOT NULL,
  subject TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE', 'REVOKED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX atlas_external_identities_active_subject_idx ON atlas_external_identities (provider, issuer, subject) WHERE status = 'ACTIVE';
CREATE INDEX atlas_external_identities_user_idx ON atlas_external_identities (user_id, status);
CREATE TABLE atlas_security_audit_events (
  tenant_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  actor_user_id TEXT,
  operation TEXT NOT NULL,
  required_capability TEXT,
  correlation_id TEXT NOT NULL,
  command_id TEXT,
  resource_type TEXT,
  resource_id TEXT,
  mutation_state TEXT,
  recovery_state TEXT,
  outcome TEXT NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  details_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (tenant_id, event_id),
  FOREIGN KEY (tenant_id) REFERENCES atlas_installation (tenant_id),
  FOREIGN KEY (actor_user_id) REFERENCES atlas_users (user_id)
);
CREATE INDEX atlas_security_audit_recent_idx ON atlas_security_audit_events (tenant_id, occurred_at DESC, event_id DESC);
CREATE INDEX atlas_security_audit_correlation_idx ON atlas_security_audit_events (correlation_id, occurred_at DESC);
CREATE INDEX atlas_security_audit_command_idx ON atlas_security_audit_events (tenant_id, command_id) WHERE command_id IS NOT NULL;
CREATE INDEX atlas_security_audit_resource_idx ON atlas_security_audit_events (tenant_id, resource_type, resource_id, occurred_at DESC);
`;

const crmCommercialSql = `
CREATE TABLE atlas_customers (
  tenant_id TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  company_name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  primary_contact_display TEXT NOT NULL DEFAULT '',
  email TEXT,
  phone TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'ARCHIVED')),
  archived_at TIMESTAMPTZ,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, customer_id),
  FOREIGN KEY (tenant_id) REFERENCES atlas_installation (tenant_id)
);
CREATE INDEX atlas_customers_name_idx ON atlas_customers (tenant_id, normalized_name, customer_id) WHERE archived_at IS NULL;
CREATE INDEX atlas_customers_status_idx ON atlas_customers (tenant_id, status, customer_id);
CREATE TABLE atlas_contacts (
  tenant_id TEXT NOT NULL,
  contact_id TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  normalized_display_name TEXT NOT NULL,
  email TEXT,
  normalized_email TEXT,
  phone TEXT,
  title_role TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'ARCHIVED')),
  archived_at TIMESTAMPTZ,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, contact_id),
  UNIQUE (tenant_id, customer_id, contact_id),
  -- Keep a portable UUID-shaped structural check here; future domain ID
  -- generation validates the stricter hexadecimal UUID form before persistence.
  CONSTRAINT atlas_contacts_canonical_id CHECK (contact_id LIKE 'CONTACT-________-____-____-____-____________'),
  FOREIGN KEY (tenant_id, customer_id) REFERENCES atlas_customers (tenant_id, customer_id)
);
CREATE INDEX atlas_contacts_customer_status_idx ON atlas_contacts (tenant_id, customer_id, status, contact_id);
CREATE INDEX atlas_contacts_name_idx ON atlas_contacts (tenant_id, normalized_display_name, contact_id) WHERE archived_at IS NULL;
CREATE INDEX atlas_contacts_email_idx ON atlas_contacts (tenant_id, normalized_email, contact_id) WHERE normalized_email IS NOT NULL;
CREATE TABLE atlas_rfqs (
  tenant_id TEXT NOT NULL,
  rfq_id TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  contact_id TEXT,
  rfq_number TEXT,
  status TEXT NOT NULL DEFAULT 'DRAFT',
  owner_user_id TEXT,
  request_date TIMESTAMPTZ,
  due_at TIMESTAMPTZ,
  description TEXT,
  source_reference TEXT,
  archived_at TIMESTAMPTZ,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, rfq_id),
  FOREIGN KEY (tenant_id, customer_id) REFERENCES atlas_customers (tenant_id, customer_id),
  FOREIGN KEY (tenant_id, customer_id, contact_id) REFERENCES atlas_contacts (tenant_id, customer_id, contact_id),
  FOREIGN KEY (owner_user_id) REFERENCES atlas_users (user_id)
);
CREATE INDEX atlas_rfqs_status_idx ON atlas_rfqs (tenant_id, status, rfq_id);
CREATE INDEX atlas_rfqs_customer_idx ON atlas_rfqs (tenant_id, customer_id, created_at DESC, rfq_id);
CREATE INDEX atlas_rfqs_due_idx ON atlas_rfqs (tenant_id, due_at, rfq_id) WHERE due_at IS NOT NULL;
CREATE INDEX atlas_rfqs_owner_idx ON atlas_rfqs (tenant_id, owner_user_id, status, due_at) WHERE owner_user_id IS NOT NULL;
CREATE TABLE atlas_quotes (
  tenant_id TEXT NOT NULL,
  quote_id TEXT NOT NULL,
  rfq_id TEXT,
  customer_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'DRAFT',
  current_revision_id TEXT,
  issued_revision_id TEXT,
  accepted_revision_id TEXT,
  owner_user_id TEXT,
  archived_at TIMESTAMPTZ,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, quote_id),
  UNIQUE (tenant_id, customer_id, quote_id),
  FOREIGN KEY (tenant_id, customer_id) REFERENCES atlas_customers (tenant_id, customer_id),
  FOREIGN KEY (tenant_id, rfq_id) REFERENCES atlas_rfqs (tenant_id, rfq_id),
  FOREIGN KEY (owner_user_id) REFERENCES atlas_users (user_id)
);
CREATE INDEX atlas_quotes_status_idx ON atlas_quotes (tenant_id, status, quote_id);
CREATE INDEX atlas_quotes_customer_idx ON atlas_quotes (tenant_id, customer_id, updated_at DESC, quote_id);
CREATE INDEX atlas_quotes_rfq_idx ON atlas_quotes (tenant_id, rfq_id) WHERE rfq_id IS NOT NULL;
CREATE TABLE atlas_quote_revisions (
  tenant_id TEXT NOT NULL,
  quote_revision_id TEXT NOT NULL,
  quote_id TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  rfq_id TEXT,
  revision_number INTEGER NOT NULL CHECK (revision_number > 0),
  status TEXT NOT NULL DEFAULT 'DRAFT',
  currency_code TEXT NOT NULL DEFAULT 'USD',
  one_time_total_minor BIGINT NOT NULL DEFAULT 0,
  recurring_total_minor BIGINT NOT NULL DEFAULT 0,
  total_minor BIGINT NOT NULL DEFAULT 0,
  cost_snapshot_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  issued_at TIMESTAMPTZ,
  accepted_at TIMESTAMPTZ,
  finalized_at TIMESTAMPTZ,
  issued_by_user_id TEXT,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, quote_revision_id),
  UNIQUE (tenant_id, quote_id, revision_number),
  UNIQUE (tenant_id, quote_id, quote_revision_id),
  FOREIGN KEY (tenant_id, customer_id, quote_id) REFERENCES atlas_quotes (tenant_id, customer_id, quote_id),
  FOREIGN KEY (tenant_id, rfq_id) REFERENCES atlas_rfqs (tenant_id, rfq_id),
  FOREIGN KEY (issued_by_user_id) REFERENCES atlas_users (user_id)
);
CREATE INDEX atlas_quote_revisions_quote_idx ON atlas_quote_revisions (tenant_id, quote_id, revision_number DESC);
CREATE INDEX atlas_quote_revisions_status_idx ON atlas_quote_revisions (tenant_id, status, issued_at DESC, quote_revision_id);
ALTER TABLE atlas_quotes ADD CONSTRAINT atlas_quotes_current_revision_fk FOREIGN KEY (tenant_id, quote_id, current_revision_id) REFERENCES atlas_quote_revisions (tenant_id, quote_id, quote_revision_id);
ALTER TABLE atlas_quotes ADD CONSTRAINT atlas_quotes_issued_revision_fk FOREIGN KEY (tenant_id, quote_id, issued_revision_id) REFERENCES atlas_quote_revisions (tenant_id, quote_id, quote_revision_id);
ALTER TABLE atlas_quotes ADD CONSTRAINT atlas_quotes_accepted_revision_fk FOREIGN KEY (tenant_id, quote_id, accepted_revision_id) REFERENCES atlas_quote_revisions (tenant_id, quote_id, quote_revision_id);
CREATE TABLE atlas_quote_lines (
  tenant_id TEXT NOT NULL,
  quote_line_id TEXT NOT NULL,
  quote_revision_id TEXT NOT NULL,
  sequence_number INTEGER NOT NULL CHECK (sequence_number > 0),
  line_type TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  quantity NUMERIC(20, 6) NOT NULL DEFAULT 0,
  unit_amount_minor BIGINT NOT NULL DEFAULT 0,
  extended_amount_minor BIGINT NOT NULL DEFAULT 0,
  currency_code TEXT NOT NULL DEFAULT 'USD',
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, quote_line_id),
  UNIQUE (tenant_id, quote_revision_id, sequence_number),
  FOREIGN KEY (tenant_id, quote_revision_id) REFERENCES atlas_quote_revisions (tenant_id, quote_revision_id)
);
CREATE INDEX atlas_quote_lines_revision_idx ON atlas_quote_lines (tenant_id, quote_revision_id, sequence_number);
`;

const operationsSql = `
CREATE TABLE atlas_jobs (
  tenant_id TEXT NOT NULL,
  job_id TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  quote_id TEXT,
  accepted_quote_revision_id TEXT,
  status TEXT NOT NULL DEFAULT 'DRAFT',
  owner_user_id TEXT,
  due_at TIMESTAMPTZ,
  scheduled_at TIMESTAMPTZ,
  current_operation_code TEXT,
  archived_at TIMESTAMPTZ,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, job_id),
  FOREIGN KEY (tenant_id, customer_id) REFERENCES atlas_customers (tenant_id, customer_id),
  FOREIGN KEY (tenant_id, quote_id) REFERENCES atlas_quotes (tenant_id, quote_id),
  FOREIGN KEY (tenant_id, accepted_quote_revision_id) REFERENCES atlas_quote_revisions (tenant_id, quote_revision_id),
  FOREIGN KEY (owner_user_id) REFERENCES atlas_users (user_id)
);
CREATE INDEX atlas_jobs_status_idx ON atlas_jobs (tenant_id, status, job_id);
CREATE INDEX atlas_jobs_owner_idx ON atlas_jobs (tenant_id, owner_user_id, status, due_at) WHERE owner_user_id IS NOT NULL;
CREATE INDEX atlas_jobs_due_idx ON atlas_jobs (tenant_id, due_at, job_id) WHERE due_at IS NOT NULL;
CREATE INDEX atlas_jobs_customer_idx ON atlas_jobs (tenant_id, customer_id, updated_at DESC, job_id);
CREATE TABLE atlas_job_operations (
  tenant_id TEXT NOT NULL,
  job_operation_id TEXT NOT NULL,
  job_id TEXT NOT NULL,
  sequence_number INTEGER NOT NULL CHECK (sequence_number > 0),
  operation_code TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING',
  assignee_user_id TEXT,
  scheduled_at TIMESTAMPTZ,
  due_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, job_operation_id),
  UNIQUE (tenant_id, job_id, sequence_number),
  FOREIGN KEY (tenant_id, job_id) REFERENCES atlas_jobs (tenant_id, job_id),
  FOREIGN KEY (assignee_user_id) REFERENCES atlas_users (user_id)
);
CREATE INDEX atlas_job_operations_job_idx ON atlas_job_operations (tenant_id, job_id, sequence_number);
CREATE INDEX atlas_job_operations_work_idx ON atlas_job_operations (tenant_id, assignee_user_id, status, due_at) WHERE assignee_user_id IS NOT NULL;
CREATE INDEX atlas_job_operations_status_idx ON atlas_job_operations (tenant_id, status, due_at, sequence_number);
CREATE TABLE atlas_job_events (
  tenant_id TEXT NOT NULL,
  job_event_id TEXT NOT NULL,
  job_id TEXT NOT NULL,
  job_operation_id TEXT,
  event_type TEXT NOT NULL,
  actor_user_id TEXT,
  correlation_id TEXT,
  command_id TEXT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  details_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (tenant_id, job_event_id),
  FOREIGN KEY (tenant_id, job_id) REFERENCES atlas_jobs (tenant_id, job_id),
  FOREIGN KEY (tenant_id, job_operation_id) REFERENCES atlas_job_operations (tenant_id, job_operation_id),
  FOREIGN KEY (actor_user_id) REFERENCES atlas_users (user_id)
);
CREATE INDEX atlas_job_events_job_idx ON atlas_job_events (tenant_id, job_id, occurred_at DESC, job_event_id DESC);
CREATE INDEX atlas_job_events_command_idx ON atlas_job_events (tenant_id, command_id) WHERE command_id IS NOT NULL;
CREATE TABLE atlas_job_qr_tokens (
  tenant_id TEXT NOT NULL,
  job_qr_token_id TEXT NOT NULL,
  job_id TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'REVOKED', 'EXPIRED')),
  issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  replaced_by_token_id TEXT,
  PRIMARY KEY (tenant_id, job_qr_token_id),
  UNIQUE (tenant_id, token_hash),
  FOREIGN KEY (tenant_id, job_id) REFERENCES atlas_jobs (tenant_id, job_id)
);
CREATE INDEX atlas_job_qr_tokens_job_idx ON atlas_job_qr_tokens (tenant_id, job_id, status, issued_at DESC);
`;

const supportSql = `
CREATE TABLE atlas_vendors (
  tenant_id TEXT NOT NULL,
  vendor_id TEXT NOT NULL,
  vendor_name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'ARCHIVED')),
  archived_at TIMESTAMPTZ,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, vendor_id),
  FOREIGN KEY (tenant_id) REFERENCES atlas_installation (tenant_id)
);
CREATE INDEX atlas_vendors_name_idx ON atlas_vendors (tenant_id, normalized_name, vendor_id) WHERE archived_at IS NULL;
CREATE TABLE atlas_purchase_requests (
  tenant_id TEXT NOT NULL,
  purchase_request_id TEXT NOT NULL,
  job_id TEXT,
  vendor_id TEXT,
  requester_user_id TEXT,
  status TEXT NOT NULL DEFAULT 'DRAFT',
  currency_code TEXT NOT NULL DEFAULT 'USD',
  requested_amount_minor BIGINT NOT NULL DEFAULT 0,
  command_id TEXT,
  request_fingerprint TEXT,
  archived_at TIMESTAMPTZ,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, purchase_request_id),
  UNIQUE (tenant_id, command_id),
  FOREIGN KEY (tenant_id, job_id) REFERENCES atlas_jobs (tenant_id, job_id),
  FOREIGN KEY (tenant_id, vendor_id) REFERENCES atlas_vendors (tenant_id, vendor_id),
  FOREIGN KEY (requester_user_id) REFERENCES atlas_users (user_id)
);
CREATE INDEX atlas_purchase_requests_queue_idx ON atlas_purchase_requests (tenant_id, status, created_at DESC, purchase_request_id);
CREATE INDEX atlas_purchase_requests_requester_idx ON atlas_purchase_requests (tenant_id, requester_user_id, status, created_at DESC) WHERE requester_user_id IS NOT NULL;
CREATE TABLE atlas_purchase_approvals (
  tenant_id TEXT NOT NULL,
  purchase_approval_id TEXT NOT NULL,
  purchase_request_id TEXT NOT NULL,
  approver_user_id TEXT NOT NULL REFERENCES atlas_users (user_id),
  decision TEXT NOT NULL CHECK (decision IN ('APPROVED', 'REJECTED', 'PENDING')),
  decided_at TIMESTAMPTZ,
  command_id TEXT,
  details_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, purchase_approval_id),
  FOREIGN KEY (tenant_id, purchase_request_id) REFERENCES atlas_purchase_requests (tenant_id, purchase_request_id)
);
CREATE INDEX atlas_purchase_approvals_approver_idx ON atlas_purchase_approvals (tenant_id, approver_user_id, decision, created_at DESC);
CREATE TABLE atlas_invoices (
  tenant_id TEXT NOT NULL,
  invoice_id TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  job_id TEXT,
  quote_id TEXT,
  status TEXT NOT NULL DEFAULT 'DRAFT',
  currency_code TEXT NOT NULL DEFAULT 'USD',
  total_minor BIGINT NOT NULL DEFAULT 0,
  issued_at TIMESTAMPTZ,
  due_at TIMESTAMPTZ,
  finalized_at TIMESTAMPTZ,
  archived_at TIMESTAMPTZ,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, invoice_id),
  FOREIGN KEY (tenant_id, customer_id) REFERENCES atlas_customers (tenant_id, customer_id),
  FOREIGN KEY (tenant_id, job_id) REFERENCES atlas_jobs (tenant_id, job_id),
  FOREIGN KEY (tenant_id, quote_id) REFERENCES atlas_quotes (tenant_id, quote_id)
);
CREATE INDEX atlas_invoices_state_idx ON atlas_invoices (tenant_id, status, due_at, invoice_id);
CREATE INDEX atlas_invoices_customer_idx ON atlas_invoices (tenant_id, customer_id, created_at DESC, invoice_id);
CREATE TABLE atlas_cash_receipts (
  tenant_id TEXT NOT NULL,
  cash_receipt_id TEXT NOT NULL,
  invoice_id TEXT,
  customer_id TEXT NOT NULL,
  currency_code TEXT NOT NULL DEFAULT 'USD',
  amount_minor BIGINT NOT NULL,
  received_at TIMESTAMPTZ NOT NULL,
  payment_reference TEXT,
  reconciliation_status TEXT NOT NULL DEFAULT 'UNRECONCILED',
  posted_at TIMESTAMPTZ,
  command_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, cash_receipt_id),
  UNIQUE (tenant_id, command_id),
  FOREIGN KEY (tenant_id, invoice_id) REFERENCES atlas_invoices (tenant_id, invoice_id),
  FOREIGN KEY (tenant_id, customer_id) REFERENCES atlas_customers (tenant_id, customer_id)
);
CREATE INDEX atlas_cash_receipts_invoice_idx ON atlas_cash_receipts (tenant_id, invoice_id, received_at DESC) WHERE invoice_id IS NOT NULL;
CREATE INDEX atlas_cash_receipts_reconciliation_idx ON atlas_cash_receipts (tenant_id, reconciliation_status, received_at DESC);
CREATE TABLE atlas_sales_activities (
  tenant_id TEXT NOT NULL,
  sales_activity_id TEXT NOT NULL,
  customer_id TEXT,
  contact_id TEXT,
  owner_user_id TEXT,
  activity_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'OPEN',
  occurred_at TIMESTAMPTZ,
  summary TEXT NOT NULL DEFAULT '',
  archived_at TIMESTAMPTZ,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, sales_activity_id),
  FOREIGN KEY (tenant_id, customer_id) REFERENCES atlas_customers (tenant_id, customer_id),
  FOREIGN KEY (tenant_id, customer_id, contact_id) REFERENCES atlas_contacts (tenant_id, customer_id, contact_id),
  FOREIGN KEY (owner_user_id) REFERENCES atlas_users (user_id)
);
CREATE INDEX atlas_sales_activities_customer_idx ON atlas_sales_activities (tenant_id, customer_id, occurred_at DESC) WHERE customer_id IS NOT NULL;
CREATE INDEX atlas_sales_activities_owner_idx ON atlas_sales_activities (tenant_id, owner_user_id, status, occurred_at DESC) WHERE owner_user_id IS NOT NULL;
CREATE TABLE atlas_follow_ups (
  tenant_id TEXT NOT NULL,
  follow_up_id TEXT NOT NULL,
  customer_id TEXT,
  contact_id TEXT,
  sales_activity_id TEXT,
  owner_user_id TEXT,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'OPEN',
  due_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  archived_at TIMESTAMPTZ,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, follow_up_id),
  FOREIGN KEY (tenant_id, customer_id) REFERENCES atlas_customers (tenant_id, customer_id),
  FOREIGN KEY (tenant_id, customer_id, contact_id) REFERENCES atlas_contacts (tenant_id, customer_id, contact_id),
  FOREIGN KEY (tenant_id, sales_activity_id) REFERENCES atlas_sales_activities (tenant_id, sales_activity_id),
  FOREIGN KEY (owner_user_id) REFERENCES atlas_users (user_id)
);
CREATE INDEX atlas_follow_ups_my_work_idx ON atlas_follow_ups (tenant_id, owner_user_id, status, due_at, follow_up_id) WHERE archived_at IS NULL;
CREATE TABLE atlas_serialized_firearms (
  tenant_id TEXT NOT NULL,
  firearm_id TEXT NOT NULL,
  serialized_identifier TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  current_custody TEXT,
  archived_at TIMESTAMPTZ,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, firearm_id),
  UNIQUE (tenant_id, serialized_identifier),
  FOREIGN KEY (tenant_id) REFERENCES atlas_installation (tenant_id)
);
CREATE INDEX atlas_serialized_firearms_custody_idx ON atlas_serialized_firearms (tenant_id, status, current_custody, firearm_id);
CREATE TABLE atlas_firearm_regulatory_events (
  tenant_id TEXT NOT NULL,
  firearm_event_id TEXT NOT NULL,
  firearm_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actor_user_id TEXT,
  details_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (tenant_id, firearm_event_id),
  FOREIGN KEY (tenant_id, firearm_id) REFERENCES atlas_serialized_firearms (tenant_id, firearm_id),
  FOREIGN KEY (actor_user_id) REFERENCES atlas_users (user_id)
);
CREATE INDEX atlas_firearm_events_recent_idx ON atlas_firearm_regulatory_events (tenant_id, firearm_id, occurred_at DESC, firearm_event_id DESC);
`;

const internalJobsAssetsSql = `
CREATE TABLE atlas_assets (
  tenant_id TEXT NOT NULL,
  asset_id TEXT NOT NULL,
  asset_code TEXT NOT NULL CHECK (asset_code <> ''),
  asset_name TEXT NOT NULL CHECK (asset_name <> ''),
  description TEXT,
  category TEXT NOT NULL CHECK (category <> ''),
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'ARCHIVED')),
  archived_at TIMESTAMPTZ,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, asset_id),
  UNIQUE (tenant_id, asset_code),
  CONSTRAINT atlas_assets_canonical_id CHECK (asset_id LIKE 'ASSET-________-____-____-____-____________'),
  CONSTRAINT atlas_assets_archive_state CHECK ((status = 'ARCHIVED' AND archived_at IS NOT NULL) OR (status = 'ACTIVE' AND archived_at IS NULL)),
  FOREIGN KEY (tenant_id) REFERENCES atlas_installation (tenant_id)
);
CREATE INDEX atlas_assets_active_code_idx ON atlas_assets (tenant_id, status, asset_code, asset_id);
CREATE INDEX atlas_assets_active_name_idx ON atlas_assets (tenant_id, status, asset_name, asset_id);
CREATE INDEX atlas_assets_category_idx ON atlas_assets (tenant_id, category, status, asset_id);

ALTER TABLE atlas_jobs ADD COLUMN work_classification TEXT NOT NULL DEFAULT 'CUSTOMER';
ALTER TABLE atlas_jobs ADD COLUMN internal_work_type TEXT;
ALTER TABLE atlas_jobs ADD COLUMN title TEXT;
ALTER TABLE atlas_jobs ADD COLUMN description TEXT;
ALTER TABLE atlas_jobs ADD COLUMN asset_id TEXT;
ALTER TABLE atlas_jobs ADD COLUMN priority TEXT;
ALTER TABLE atlas_jobs ADD COLUMN planned_start_at TIMESTAMPTZ;
ALTER TABLE atlas_jobs ALTER COLUMN customer_id DROP NOT NULL;
ALTER TABLE atlas_jobs ADD CONSTRAINT atlas_jobs_work_classification_check CHECK (work_classification IN ('CUSTOMER', 'INTERNAL'));
ALTER TABLE atlas_jobs ADD CONSTRAINT atlas_jobs_classification_authority_check CHECK (
  (work_classification = 'CUSTOMER' AND customer_id IS NOT NULL AND internal_work_type IS NULL AND asset_id IS NULL)
  OR
  (work_classification = 'INTERNAL' AND customer_id IS NULL AND quote_id IS NULL AND accepted_quote_revision_id IS NULL
    AND internal_work_type IN ('MAINTENANCE', 'REPAIR', 'FIXTURE_TOOLING', 'CAPITAL_IMPROVEMENT', 'R_AND_D_PROTOTYPE', 'FACILITY', 'OTHER')
    AND COALESCE(title, description, '') <> '')
);
ALTER TABLE atlas_jobs ADD CONSTRAINT atlas_jobs_asset_fk FOREIGN KEY (tenant_id, asset_id) REFERENCES atlas_assets (tenant_id, asset_id);
CREATE INDEX atlas_jobs_classification_status_idx ON atlas_jobs (tenant_id, work_classification, status, due_at, job_id);
CREATE INDEX atlas_jobs_internal_type_idx ON atlas_jobs (tenant_id, internal_work_type, status, due_at, job_id) WHERE work_classification = 'INTERNAL';
CREATE INDEX atlas_jobs_asset_status_idx ON atlas_jobs (tenant_id, asset_id, status, job_id) WHERE asset_id IS NOT NULL;
`;

const physicalToolingSql = `
CREATE TABLE atlas_tool_types (
  tenant_id TEXT NOT NULL,
  tool_type_id TEXT NOT NULL,
  manufacturer TEXT,
  catalog_number TEXT,
  description TEXT NOT NULL CHECK (description <> ''),
  tool_class TEXT NOT NULL CHECK (tool_class <> ''),
  nominal_diameter NUMERIC(18,6),
  nominal_cutting_length NUMERIC(18,6),
  nominal_overall_length NUMERIC(18,6),
  flute_count INTEGER CHECK (flute_count IS NULL OR flute_count > 0),
  tool_material TEXT,
  coating TEXT,
  unit_system TEXT NOT NULL CHECK (unit_system IN ('INCH','MILLIMETER')),
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','ARCHIVED')),
  archived_at TIMESTAMPTZ,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by_user_id TEXT NOT NULL,
  PRIMARY KEY (tenant_id, tool_type_id),
  UNIQUE (tenant_id, manufacturer, catalog_number),
  CONSTRAINT atlas_tool_types_archive_state CHECK ((status='ARCHIVED' AND archived_at IS NOT NULL) OR (status='ACTIVE' AND archived_at IS NULL)),
  CONSTRAINT atlas_tool_types_canonical_id CHECK (tool_type_id LIKE 'TOOL-TYPE-________-____-____-____-____________'),
  FOREIGN KEY (tenant_id) REFERENCES atlas_installation (tenant_id),
  FOREIGN KEY (created_by_user_id) REFERENCES atlas_users (user_id)
);
CREATE INDEX atlas_tool_types_lookup_idx ON atlas_tool_types (tenant_id, status, tool_class, nominal_diameter, tool_type_id);

CREATE TABLE atlas_tool_instances (
  tenant_id TEXT NOT NULL,
  tool_instance_id TEXT NOT NULL,
  tool_type_id TEXT NOT NULL,
  serial_lot_identifier TEXT,
  condition TEXT NOT NULL CHECK (condition IN ('NEW','USED','REGROUND','MODIFIED','DAMAGED','QUARANTINED','RETIRED')),
  verification_status TEXT NOT NULL DEFAULT 'UNVERIFIED' CHECK (verification_status IN ('UNVERIFIED','VERIFIED','STALE')),
  current_measurement_id TEXT,
  storage_location TEXT,
  notes TEXT,
  attachment_references_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','ARCHIVED')),
  archived_at TIMESTAMPTZ,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by_user_id TEXT NOT NULL,
  PRIMARY KEY (tenant_id, tool_instance_id),
  UNIQUE (tenant_id, tool_instance_id, tool_type_id),
  FOREIGN KEY (tenant_id, tool_type_id) REFERENCES atlas_tool_types (tenant_id, tool_type_id),
  CONSTRAINT atlas_tool_instances_archive_state CHECK ((status='ARCHIVED' AND archived_at IS NOT NULL) OR (status='ACTIVE' AND archived_at IS NULL)),
  CONSTRAINT atlas_tool_instances_canonical_id CHECK (tool_instance_id LIKE 'TOOL-________-____-____-____-____________'),
  FOREIGN KEY (created_by_user_id) REFERENCES atlas_users (user_id)
);
CREATE INDEX atlas_tool_instances_lookup_idx ON atlas_tool_instances (tenant_id, status, condition, tool_type_id, tool_instance_id);
CREATE INDEX atlas_tool_instances_verification_idx ON atlas_tool_instances (tenant_id, verification_status, condition, tool_instance_id) WHERE status='ACTIVE';

CREATE TABLE atlas_tool_measurements (
  tenant_id TEXT NOT NULL,
  tool_measurement_id TEXT NOT NULL,
  tool_instance_id TEXT NOT NULL,
  measured_diameter NUMERIC(18,6),
  measured_length NUMERIC(18,6),
  unit_system TEXT NOT NULL CHECK (unit_system IN ('INCH','MILLIMETER')),
  measured_at TIMESTAMPTZ NOT NULL,
  measured_by_user_id TEXT NOT NULL,
  measurement_method TEXT,
  source_reference TEXT,
  verification_status TEXT NOT NULL CHECK (verification_status IN ('RECORDED','VERIFIED','REJECTED')),
  verified_at TIMESTAMPTZ,
  verified_by_user_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, tool_measurement_id),
  UNIQUE (tenant_id, tool_instance_id, tool_measurement_id),
  FOREIGN KEY (tenant_id, tool_instance_id) REFERENCES atlas_tool_instances (tenant_id, tool_instance_id),
  FOREIGN KEY (measured_by_user_id) REFERENCES atlas_users (user_id),
  FOREIGN KEY (verified_by_user_id) REFERENCES atlas_users (user_id),
  CONSTRAINT atlas_tool_measurements_verified_state CHECK ((verification_status='VERIFIED' AND verified_at IS NOT NULL AND verified_by_user_id IS NOT NULL) OR verification_status<>'VERIFIED')
  ,CONSTRAINT atlas_tool_measurements_canonical_id CHECK (tool_measurement_id LIKE 'TOOL-MEAS-________-____-____-____-____________')
);
CREATE INDEX atlas_tool_measurements_history_idx ON atlas_tool_measurements (tenant_id, tool_instance_id, measured_at DESC, tool_measurement_id DESC);
ALTER TABLE atlas_tool_instances ADD CONSTRAINT atlas_tool_instances_current_measurement_fk FOREIGN KEY (tenant_id, tool_instance_id, current_measurement_id) REFERENCES atlas_tool_measurements (tenant_id, tool_instance_id, tool_measurement_id);

CREATE TABLE atlas_tool_condition_events (
  tenant_id TEXT NOT NULL,
  tool_condition_event_id TEXT NOT NULL,
  tool_instance_id TEXT NOT NULL,
  previous_condition TEXT NOT NULL CHECK (previous_condition IN ('NEW','USED','REGROUND','MODIFIED','DAMAGED','QUARANTINED','RETIRED')),
  next_condition TEXT NOT NULL CHECK (next_condition IN ('NEW','USED','REGROUND','MODIFIED','DAMAGED','QUARANTINED','RETIRED')),
  reason TEXT NOT NULL CHECK (reason <> ''),
  changed_at TIMESTAMPTZ NOT NULL,
  changed_by_user_id TEXT NOT NULL,
  correlation_id TEXT NOT NULL,
  PRIMARY KEY (tenant_id, tool_condition_event_id),
  FOREIGN KEY (tenant_id, tool_instance_id) REFERENCES atlas_tool_instances (tenant_id, tool_instance_id),
  FOREIGN KEY (changed_by_user_id) REFERENCES atlas_users (user_id),
  CONSTRAINT atlas_tool_condition_events_canonical_id CHECK (tool_condition_event_id LIKE 'TOOL-COND-________-____-____-____-____________'),
  CONSTRAINT atlas_tool_condition_events_changed CHECK (previous_condition <> next_condition)
);
CREATE INDEX atlas_tool_condition_events_history_idx ON atlas_tool_condition_events (tenant_id, tool_instance_id, changed_at DESC, tool_condition_event_id DESC);

CREATE TABLE atlas_holders (
  tenant_id TEXT NOT NULL,
  holder_id TEXT NOT NULL,
  description TEXT NOT NULL CHECK (description <> ''),
  holder_type TEXT NOT NULL CHECK (holder_type <> ''),
  manufacturer TEXT,
  model TEXT,
  machine_interface TEXT,
  physical_identifier_reference TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','QUARANTINED','RETIRED','ARCHIVED')),
  storage_location TEXT,
  archived_at TIMESTAMPTZ,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by_user_id TEXT NOT NULL,
  PRIMARY KEY (tenant_id, holder_id),
  FOREIGN KEY (tenant_id) REFERENCES atlas_installation (tenant_id),
  FOREIGN KEY (created_by_user_id) REFERENCES atlas_users (user_id),
  CONSTRAINT atlas_holders_canonical_id CHECK (holder_id LIKE 'HOLDER-________-____-____-____-____________')
);
CREATE INDEX atlas_holders_lookup_idx ON atlas_holders (tenant_id, status, holder_type, holder_id);

CREATE TABLE atlas_tool_assemblies (
  tenant_id TEXT NOT NULL,
  tool_assembly_id TEXT NOT NULL,
  holder_id TEXT NOT NULL,
  tool_instance_id TEXT NOT NULL,
  installed_by_user_id TEXT NOT NULL,
  installed_at TIMESTAMPTZ NOT NULL,
  verification_status TEXT NOT NULL CHECK (verification_status IN ('UNVERIFIED','VERIFIED','STALE','BLOCKED')),
  verified_measurement_id TEXT,
  actual_diameter_snapshot NUMERIC(18,6),
  unit_system TEXT,
  last_verified_at TIMESTAMPTZ,
  removed_at TIMESTAMPTZ,
  removed_by_user_id TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','REMOVED')),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, tool_assembly_id),
  UNIQUE (tenant_id, tool_assembly_id, holder_id, tool_instance_id),
  FOREIGN KEY (tenant_id, holder_id) REFERENCES atlas_holders (tenant_id, holder_id),
  FOREIGN KEY (tenant_id, tool_instance_id) REFERENCES atlas_tool_instances (tenant_id, tool_instance_id),
  FOREIGN KEY (tenant_id, tool_instance_id, verified_measurement_id) REFERENCES atlas_tool_measurements (tenant_id, tool_instance_id, tool_measurement_id),
  FOREIGN KEY (installed_by_user_id) REFERENCES atlas_users (user_id),
  FOREIGN KEY (removed_by_user_id) REFERENCES atlas_users (user_id),
  CONSTRAINT atlas_tool_assemblies_lifecycle CHECK ((status='ACTIVE' AND removed_at IS NULL) OR (status='REMOVED' AND removed_at IS NOT NULL))
  ,CONSTRAINT atlas_tool_assemblies_canonical_id CHECK (tool_assembly_id LIKE 'TOOL-ASM-________-____-____-____-____________')
);
CREATE UNIQUE INDEX atlas_tool_assemblies_active_holder_idx ON atlas_tool_assemblies (tenant_id, holder_id) WHERE status='ACTIVE';
CREATE UNIQUE INDEX atlas_tool_assemblies_active_tool_idx ON atlas_tool_assemblies (tenant_id, tool_instance_id) WHERE status='ACTIVE';

CREATE TABLE atlas_tool_machine_assignments (
  tenant_id TEXT NOT NULL,
  tool_assignment_id TEXT NOT NULL,
  tool_assembly_id TEXT NOT NULL,
  machine_asset_id TEXT NOT NULL,
  pocket_reference TEXT,
  loaded_at TIMESTAMPTZ NOT NULL,
  loaded_by_user_id TEXT NOT NULL,
  verification_status TEXT NOT NULL CHECK (verification_status IN ('UNVERIFIED','VERIFIED','STALE')),
  unloaded_at TIMESTAMPTZ,
  unloaded_by_user_id TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','REMOVED')),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, tool_assignment_id),
  FOREIGN KEY (tenant_id, tool_assembly_id) REFERENCES atlas_tool_assemblies (tenant_id, tool_assembly_id),
  FOREIGN KEY (tenant_id, machine_asset_id) REFERENCES atlas_assets (tenant_id, asset_id),
  FOREIGN KEY (loaded_by_user_id) REFERENCES atlas_users (user_id),
  FOREIGN KEY (unloaded_by_user_id) REFERENCES atlas_users (user_id),
  CONSTRAINT atlas_tool_assignments_canonical_id CHECK (tool_assignment_id LIKE 'TOOL-ASGN-________-____-____-____-____________'),
  CONSTRAINT atlas_tool_assignments_lifecycle CHECK ((status='ACTIVE' AND unloaded_at IS NULL) OR (status='REMOVED' AND unloaded_at IS NOT NULL))
);
CREATE UNIQUE INDEX atlas_tool_assignments_active_assembly_idx ON atlas_tool_machine_assignments (tenant_id, tool_assembly_id) WHERE status='ACTIVE';
CREATE UNIQUE INDEX atlas_tool_assignments_active_pocket_idx ON atlas_tool_machine_assignments (tenant_id, machine_asset_id, pocket_reference) WHERE status='ACTIVE' AND pocket_reference IS NOT NULL;
CREATE INDEX atlas_tool_assignments_machine_idx ON atlas_tool_machine_assignments (tenant_id, machine_asset_id, status, pocket_reference, tool_assignment_id);

CREATE TABLE atlas_operation_tool_requirements (
  tenant_id TEXT NOT NULL,
  tool_requirement_id TEXT NOT NULL,
  job_operation_id TEXT NOT NULL,
  tool_type_id TEXT NOT NULL,
  required_holder_id TEXT,
  cam_tool_reference TEXT,
  setup_tool_number TEXT,
  expected_diameter NUMERIC(18,6),
  unit_system TEXT NOT NULL CHECK (unit_system IN ('INCH','MILLIMETER')),
  radial_stock_to_leave NUMERIC(18,6),
  verified_actual_geometry_required BOOLEAN NOT NULL DEFAULT FALSE,
  policy_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','ARCHIVED')),
  archived_at TIMESTAMPTZ,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, tool_requirement_id),
  UNIQUE (tenant_id, job_operation_id, tool_requirement_id),
  FOREIGN KEY (tenant_id, job_operation_id) REFERENCES atlas_job_operations (tenant_id, job_operation_id),
  FOREIGN KEY (tenant_id, tool_type_id) REFERENCES atlas_tool_types (tenant_id, tool_type_id),
  FOREIGN KEY (tenant_id, required_holder_id) REFERENCES atlas_holders (tenant_id, holder_id)
  ,CONSTRAINT atlas_tool_requirements_canonical_id CHECK (tool_requirement_id LIKE 'TOOL-REQ-________-____-____-____-____________')
);
CREATE INDEX atlas_tool_requirements_operation_idx ON atlas_operation_tool_requirements (tenant_id, job_operation_id, status, tool_requirement_id);

CREATE TABLE atlas_operation_tool_executions (
  tenant_id TEXT NOT NULL,
  tool_execution_id TEXT NOT NULL,
  job_operation_id TEXT NOT NULL,
  tool_requirement_id TEXT NOT NULL,
  tool_instance_id TEXT NOT NULL,
  tool_assembly_id TEXT NOT NULL,
  holder_id TEXT NOT NULL,
  machine_asset_id TEXT,
  pocket_reference TEXT,
  verified_measurement_id TEXT,
  actual_diameter_snapshot NUMERIC(18,6),
  nominal_diameter_snapshot NUMERIC(18,6),
  unit_system TEXT NOT NULL CHECK (unit_system IN ('INCH','MILLIMETER')),
  tool_condition_snapshot TEXT NOT NULL,
  preflight_state TEXT NOT NULL CHECK (preflight_state IN ('READY','WARNING')),
  preflight_details_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  executed_at TIMESTAMPTZ NOT NULL,
  operator_user_id TEXT NOT NULL,
  correlation_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, tool_execution_id),
  FOREIGN KEY (tenant_id, job_operation_id) REFERENCES atlas_job_operations (tenant_id, job_operation_id),
  FOREIGN KEY (tenant_id, job_operation_id, tool_requirement_id) REFERENCES atlas_operation_tool_requirements (tenant_id, job_operation_id, tool_requirement_id),
  FOREIGN KEY (tenant_id, tool_assembly_id, holder_id, tool_instance_id) REFERENCES atlas_tool_assemblies (tenant_id, tool_assembly_id, holder_id, tool_instance_id),
  FOREIGN KEY (tenant_id, machine_asset_id) REFERENCES atlas_assets (tenant_id, asset_id),
  FOREIGN KEY (tenant_id, tool_instance_id, verified_measurement_id) REFERENCES atlas_tool_measurements (tenant_id, tool_instance_id, tool_measurement_id),
  FOREIGN KEY (operator_user_id) REFERENCES atlas_users (user_id)
  ,CONSTRAINT atlas_tool_executions_canonical_id CHECK (tool_execution_id LIKE 'TOOL-EXEC-________-____-____-____-____________')
);
CREATE INDEX atlas_tool_executions_operation_idx ON atlas_operation_tool_executions (tenant_id, job_operation_id, executed_at DESC, tool_execution_id DESC);
CREATE INDEX atlas_tool_executions_tool_idx ON atlas_operation_tool_executions (tenant_id, tool_instance_id, executed_at DESC, tool_execution_id DESC);

CREATE TABLE atlas_tool_identifiers (
  tenant_id TEXT NOT NULL,
  tool_identifier_id TEXT NOT NULL,
  resource_type TEXT NOT NULL CHECK (resource_type IN ('TOOL_INSTANCE','HOLDER')),
  tool_instance_id TEXT,
  holder_id TEXT,
  token_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','REVOKED')),
  issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ,
  PRIMARY KEY (tenant_id, tool_identifier_id),
  UNIQUE (tenant_id, token_hash),
  FOREIGN KEY (tenant_id, tool_instance_id) REFERENCES atlas_tool_instances (tenant_id, tool_instance_id),
  FOREIGN KEY (tenant_id, holder_id) REFERENCES atlas_holders (tenant_id, holder_id),
  CONSTRAINT atlas_tool_identifiers_resource CHECK ((resource_type='TOOL_INSTANCE' AND tool_instance_id IS NOT NULL AND holder_id IS NULL) OR (resource_type='HOLDER' AND holder_id IS NOT NULL AND tool_instance_id IS NULL))
  ,CONSTRAINT atlas_tool_identifiers_canonical_id CHECK (tool_identifier_id LIKE 'TOOL-ID-________-____-____-____-____________'),
  CONSTRAINT atlas_tool_identifiers_token_hash CHECK (token_hash LIKE '________________________________________________________________'),
  CONSTRAINT atlas_tool_identifiers_lifecycle CHECK ((status='ACTIVE' AND revoked_at IS NULL) OR (status='REVOKED' AND revoked_at IS NOT NULL))
);
CREATE INDEX atlas_tool_identifiers_resource_idx ON atlas_tool_identifiers (tenant_id, resource_type, status, tool_instance_id, holder_id);
`;

const wipBinsSql = `
CREATE TABLE atlas_wip_bins (
  tenant_id TEXT NOT NULL,
  wip_bin_id TEXT NOT NULL,
  bin_label TEXT NOT NULL CHECK (bin_label <> ''),
  status TEXT NOT NULL DEFAULT 'AVAILABLE' CHECK (status IN ('AVAILABLE','ASSIGNED','QUARANTINED','RETIRED')),
  current_location TEXT NOT NULL CHECK (current_location <> ''),
  notes TEXT,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_by_user_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  retired_at TIMESTAMPTZ,
  PRIMARY KEY (tenant_id, wip_bin_id),
  UNIQUE (tenant_id, bin_label),
  FOREIGN KEY (tenant_id) REFERENCES atlas_installation (tenant_id),
  FOREIGN KEY (created_by_user_id) REFERENCES atlas_users (user_id),
  CONSTRAINT atlas_wip_bins_canonical_id CHECK (wip_bin_id LIKE 'WIP-BIN-________-____-____-____-____________'),
  CONSTRAINT atlas_wip_bins_retired_state CHECK ((status='RETIRED' AND retired_at IS NOT NULL) OR (status<>'RETIRED' AND retired_at IS NULL))
);
CREATE INDEX atlas_wip_bins_location_idx ON atlas_wip_bins (tenant_id, current_location, status, wip_bin_id);
CREATE INDEX atlas_wip_bins_status_idx ON atlas_wip_bins (tenant_id, status, bin_label, wip_bin_id);

CREATE TABLE atlas_wip_bin_assignments (
  tenant_id TEXT NOT NULL,
  wip_bin_assignment_id TEXT NOT NULL,
  wip_bin_id TEXT NOT NULL,
  job_id TEXT NOT NULL,
  assigned_at TIMESTAMPTZ NOT NULL,
  assigned_by_user_id TEXT NOT NULL,
  released_at TIMESTAMPTZ,
  released_by_user_id TEXT,
  release_reason TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','RELEASED')),
  correlation_id TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  PRIMARY KEY (tenant_id, wip_bin_assignment_id),
  UNIQUE (tenant_id, wip_bin_id, wip_bin_assignment_id),
  UNIQUE (tenant_id, job_id, wip_bin_assignment_id),
  FOREIGN KEY (tenant_id, wip_bin_id) REFERENCES atlas_wip_bins (tenant_id, wip_bin_id),
  FOREIGN KEY (tenant_id, job_id) REFERENCES atlas_jobs (tenant_id, job_id),
  FOREIGN KEY (assigned_by_user_id) REFERENCES atlas_users (user_id),
  FOREIGN KEY (released_by_user_id) REFERENCES atlas_users (user_id),
  CONSTRAINT atlas_wip_bin_assignments_canonical_id CHECK (wip_bin_assignment_id LIKE 'WIP-ASGN-________-____-____-____-____________'),
  CONSTRAINT atlas_wip_bin_assignments_lifecycle CHECK ((status='ACTIVE' AND released_at IS NULL AND released_by_user_id IS NULL) OR (status='RELEASED' AND released_at IS NOT NULL AND released_by_user_id IS NOT NULL))
);
CREATE UNIQUE INDEX atlas_wip_bin_assignments_active_bin_idx ON atlas_wip_bin_assignments (tenant_id, wip_bin_id) WHERE status='ACTIVE';
CREATE UNIQUE INDEX atlas_wip_bin_assignments_active_job_idx ON atlas_wip_bin_assignments (tenant_id, job_id) WHERE status='ACTIVE';
CREATE INDEX atlas_wip_bin_assignments_job_history_idx ON atlas_wip_bin_assignments (tenant_id, job_id, assigned_at DESC, wip_bin_assignment_id DESC);
CREATE INDEX atlas_wip_bin_assignments_bin_history_idx ON atlas_wip_bin_assignments (tenant_id, wip_bin_id, assigned_at DESC, wip_bin_assignment_id DESC);

CREATE TABLE atlas_wip_bin_location_events (
  tenant_id TEXT NOT NULL,
  wip_bin_location_event_id TEXT NOT NULL,
  wip_bin_id TEXT NOT NULL,
  wip_bin_assignment_id TEXT,
  previous_location TEXT NOT NULL,
  next_location TEXT NOT NULL,
  moved_at TIMESTAMPTZ NOT NULL,
  moved_by_user_id TEXT NOT NULL,
  reason TEXT,
  correlation_id TEXT NOT NULL,
  PRIMARY KEY (tenant_id, wip_bin_location_event_id),
  FOREIGN KEY (tenant_id, wip_bin_id) REFERENCES atlas_wip_bins (tenant_id, wip_bin_id),
  FOREIGN KEY (tenant_id, wip_bin_id, wip_bin_assignment_id) REFERENCES atlas_wip_bin_assignments (tenant_id, wip_bin_id, wip_bin_assignment_id),
  FOREIGN KEY (moved_by_user_id) REFERENCES atlas_users (user_id),
  CONSTRAINT atlas_wip_bin_location_events_canonical_id CHECK (wip_bin_location_event_id LIKE 'WIP-LOC-________-____-____-____-____________'),
  CONSTRAINT atlas_wip_bin_location_events_changed CHECK (previous_location <> next_location)
);
CREATE INDEX atlas_wip_bin_location_history_idx ON atlas_wip_bin_location_events (tenant_id, wip_bin_id, moved_at DESC, wip_bin_location_event_id DESC);

CREATE TABLE atlas_wip_bin_identifiers (
  tenant_id TEXT NOT NULL,
  wip_bin_identifier_id TEXT NOT NULL,
  wip_bin_id TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','REVOKED')),
  issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ,
  PRIMARY KEY (tenant_id, wip_bin_identifier_id),
  UNIQUE (tenant_id, token_hash),
  FOREIGN KEY (tenant_id, wip_bin_id) REFERENCES atlas_wip_bins (tenant_id, wip_bin_id),
  CONSTRAINT atlas_wip_bin_identifiers_canonical_id CHECK (wip_bin_identifier_id LIKE 'WIP-ID-________-____-____-____-____________'),
  CONSTRAINT atlas_wip_bin_identifiers_token_hash CHECK (token_hash LIKE '________________________________________________________________'),
  CONSTRAINT atlas_wip_bin_identifiers_lifecycle CHECK ((status='ACTIVE' AND revoked_at IS NULL) OR (status='REVOKED' AND revoked_at IS NOT NULL))
);
CREATE INDEX atlas_wip_bin_identifiers_bin_idx ON atlas_wip_bin_identifiers (tenant_id, wip_bin_id, status, issued_at DESC);
`;

const crmActivityFollowUpSql = `
ALTER TABLE atlas_sales_activities ADD COLUMN direction TEXT;
ALTER TABLE atlas_sales_activities ADD COLUMN notes TEXT NOT NULL DEFAULT '';
ALTER TABLE atlas_sales_activities ADD COLUMN source_channel TEXT NOT NULL DEFAULT 'MANUAL';
ALTER TABLE atlas_sales_activities ADD COLUMN related_rfq_id TEXT;
ALTER TABLE atlas_sales_activities ADD COLUMN related_quote_id TEXT;
ALTER TABLE atlas_sales_activities ADD COLUMN related_job_id TEXT;
ALTER TABLE atlas_sales_activities ADD COLUMN next_action TEXT;
ALTER TABLE atlas_sales_activities ADD COLUMN next_action_due_at TIMESTAMPTZ;
ALTER TABLE atlas_sales_activities ADD COLUMN disposition TEXT;
ALTER TABLE atlas_sales_activities ADD COLUMN created_by_user_id TEXT;
ALTER TABLE atlas_sales_activities ADD COLUMN completed_at TIMESTAMPTZ;
ALTER TABLE atlas_sales_activities ADD COLUMN cancelled_at TIMESTAMPTZ;
ALTER TABLE atlas_sales_activities ADD COLUMN correlation_id TEXT;
ALTER TABLE atlas_sales_activities ADD CONSTRAINT atlas_sales_activity_rfq_fk FOREIGN KEY (tenant_id, related_rfq_id) REFERENCES atlas_rfqs (tenant_id, rfq_id);
ALTER TABLE atlas_sales_activities ADD CONSTRAINT atlas_sales_activity_quote_fk FOREIGN KEY (tenant_id, related_quote_id) REFERENCES atlas_quotes (tenant_id, quote_id);
ALTER TABLE atlas_sales_activities ADD CONSTRAINT atlas_sales_activity_job_fk FOREIGN KEY (tenant_id, related_job_id) REFERENCES atlas_jobs (tenant_id, job_id);
ALTER TABLE atlas_sales_activities ADD CONSTRAINT atlas_sales_activity_creator_fk FOREIGN KEY (created_by_user_id) REFERENCES atlas_users (user_id);
CREATE INDEX atlas_sales_activities_contact_timeline_idx ON atlas_sales_activities (tenant_id, contact_id, occurred_at DESC, sales_activity_id DESC) WHERE contact_id IS NOT NULL AND archived_at IS NULL;
CREATE INDEX atlas_sales_activities_customer_timeline_idx ON atlas_sales_activities (tenant_id, customer_id, occurred_at DESC, sales_activity_id DESC) WHERE customer_id IS NOT NULL AND archived_at IS NULL;
CREATE INDEX atlas_sales_activities_due_idx ON atlas_sales_activities (tenant_id, owner_user_id, next_action_due_at, sales_activity_id) WHERE status='OPEN' AND next_action_due_at IS NOT NULL AND archived_at IS NULL;
CREATE INDEX atlas_sales_activities_related_idx ON atlas_sales_activities (tenant_id, related_rfq_id, related_quote_id, related_job_id) WHERE archived_at IS NULL;

ALTER TABLE atlas_follow_ups ADD COLUMN next_action TEXT;
UPDATE atlas_follow_ups SET next_action=title WHERE next_action IS NULL;
ALTER TABLE atlas_follow_ups ALTER COLUMN next_action SET NOT NULL;
ALTER TABLE atlas_follow_ups ADD COLUMN cancellation_reason TEXT;
ALTER TABLE atlas_follow_ups ADD COLUMN correlation_id TEXT;
ALTER TABLE atlas_follow_ups ADD COLUMN created_by_user_id TEXT;
ALTER TABLE atlas_follow_ups ADD CONSTRAINT atlas_follow_up_creator_fk FOREIGN KEY (created_by_user_id) REFERENCES atlas_users (user_id);
CREATE INDEX atlas_follow_ups_customer_timeline_idx ON atlas_follow_ups (tenant_id, customer_id, due_at DESC, follow_up_id DESC) WHERE archived_at IS NULL;
CREATE INDEX atlas_follow_ups_contact_timeline_idx ON atlas_follow_ups (tenant_id, contact_id, due_at DESC, follow_up_id DESC) WHERE contact_id IS NOT NULL AND archived_at IS NULL;
CREATE INDEX atlas_follow_ups_owner_due_idx ON atlas_follow_ups (tenant_id, owner_user_id, due_at, follow_up_id) WHERE status='OPEN' AND archived_at IS NULL;

CREATE TABLE atlas_crm_activity_events (
  tenant_id TEXT NOT NULL,
  crm_activity_event_id TEXT NOT NULL,
  sales_activity_id TEXT,
  follow_up_id TEXT,
  event_type TEXT NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL,
  actor_user_id TEXT NOT NULL,
  correlation_id TEXT NOT NULL,
  previous_version INTEGER,
  new_version INTEGER NOT NULL,
  details_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (tenant_id, crm_activity_event_id),
  FOREIGN KEY (tenant_id, sales_activity_id) REFERENCES atlas_sales_activities (tenant_id, sales_activity_id),
  FOREIGN KEY (tenant_id, follow_up_id) REFERENCES atlas_follow_ups (tenant_id, follow_up_id),
  FOREIGN KEY (actor_user_id) REFERENCES atlas_users (user_id),
  CONSTRAINT atlas_crm_activity_events_canonical_id CHECK (crm_activity_event_id LIKE 'CRM-EVT-________-____-____-____-____________'),
  CONSTRAINT atlas_crm_activity_events_resource CHECK ((sales_activity_id IS NOT NULL AND follow_up_id IS NULL) OR (sales_activity_id IS NULL AND follow_up_id IS NOT NULL))
);
CREATE INDEX atlas_crm_activity_events_activity_idx ON atlas_crm_activity_events (tenant_id, sales_activity_id, occurred_at DESC, crm_activity_event_id DESC) WHERE sales_activity_id IS NOT NULL;
CREATE INDEX atlas_crm_activity_events_follow_up_idx ON atlas_crm_activity_events (tenant_id, follow_up_id, occurred_at DESC, crm_activity_event_id DESC) WHERE follow_up_id IS NOT NULL;
`;

const unifiedLeadIntakeSql = `
CREATE TABLE atlas_leads (
  tenant_id TEXT NOT NULL,
  lead_id TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('WEBSITE','EMAIL_IMPORT','PHONE','DEALER_REFERRAL','MANUAL','SOCIAL')),
  ingestion_key_hash TEXT NOT NULL,
  ingestion_payload_hash TEXT NOT NULL,
  source_reference TEXT,
  company_name TEXT,
  contact_name TEXT,
  email TEXT,
  phone TEXT,
  summary TEXT NOT NULL,
  owner_user_id TEXT,
  status TEXT NOT NULL DEFAULT 'NEW' CHECK (status IN ('NEW','QUALIFIED','CALLBACK_REQUIRED','CONTACTED','QUOTED','WON','LOST')),
  customer_id TEXT,
  contact_id TEXT,
  disposition TEXT,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_by_user_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  converted_at TIMESTAMPTZ,
  converted_by_user_id TEXT,
  archived_at TIMESTAMPTZ,
  PRIMARY KEY (tenant_id, lead_id),
  UNIQUE (tenant_id, ingestion_key_hash),
  FOREIGN KEY (tenant_id) REFERENCES atlas_installation (tenant_id),
  FOREIGN KEY (tenant_id, customer_id) REFERENCES atlas_customers (tenant_id, customer_id),
  FOREIGN KEY (tenant_id, customer_id, contact_id) REFERENCES atlas_contacts (tenant_id, customer_id, contact_id),
  FOREIGN KEY (owner_user_id) REFERENCES atlas_users (user_id),
  FOREIGN KEY (created_by_user_id) REFERENCES atlas_users (user_id),
  FOREIGN KEY (converted_by_user_id) REFERENCES atlas_users (user_id),
  CONSTRAINT atlas_leads_canonical_id CHECK (lead_id LIKE 'LEAD-________-____-____-____-____________'),
  CONSTRAINT atlas_leads_ingestion_hash CHECK (ingestion_key_hash LIKE '________________________________________________________________'),
  CONSTRAINT atlas_leads_payload_hash CHECK (ingestion_payload_hash LIKE '________________________________________________________________'),
  CONSTRAINT atlas_leads_conversion CHECK ((converted_at IS NULL AND converted_by_user_id IS NULL AND customer_id IS NULL AND contact_id IS NULL) OR (converted_at IS NOT NULL AND converted_by_user_id IS NOT NULL AND customer_id IS NOT NULL))
);
CREATE INDEX atlas_leads_queue_idx ON atlas_leads (tenant_id, status, owner_user_id, created_at, lead_id) WHERE archived_at IS NULL;
CREATE INDEX atlas_leads_source_idx ON atlas_leads (tenant_id, source, created_at DESC, lead_id DESC) WHERE archived_at IS NULL;
CREATE INDEX atlas_leads_customer_idx ON atlas_leads (tenant_id, customer_id, converted_at DESC, lead_id) WHERE customer_id IS NOT NULL;

CREATE TABLE atlas_lead_events (
  tenant_id TEXT NOT NULL,
  lead_event_id TEXT NOT NULL,
  lead_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL,
  actor_user_id TEXT NOT NULL,
  correlation_id TEXT NOT NULL,
  previous_status TEXT,
  next_status TEXT NOT NULL,
  previous_version INTEGER,
  new_version INTEGER NOT NULL,
  details_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (tenant_id, lead_event_id),
  FOREIGN KEY (tenant_id, lead_id) REFERENCES atlas_leads (tenant_id, lead_id),
  FOREIGN KEY (actor_user_id) REFERENCES atlas_users (user_id),
  CONSTRAINT atlas_lead_events_canonical_id CHECK (lead_event_id LIKE 'LEAD-EVT-________-____-____-____-____________')
);
CREATE INDEX atlas_lead_events_history_idx ON atlas_lead_events (tenant_id, lead_id, occurred_at DESC, lead_event_id DESC);

ALTER TABLE atlas_sales_activities ADD COLUMN lead_id TEXT;
ALTER TABLE atlas_sales_activities ADD CONSTRAINT atlas_sales_activity_lead_fk FOREIGN KEY (tenant_id, lead_id) REFERENCES atlas_leads (tenant_id, lead_id);
CREATE INDEX atlas_sales_activities_lead_timeline_idx ON atlas_sales_activities (tenant_id, lead_id, occurred_at DESC, sales_activity_id DESC) WHERE lead_id IS NOT NULL AND archived_at IS NULL;
ALTER TABLE atlas_follow_ups ADD COLUMN lead_id TEXT;
ALTER TABLE atlas_follow_ups ADD CONSTRAINT atlas_follow_up_lead_fk FOREIGN KEY (tenant_id, lead_id) REFERENCES atlas_leads (tenant_id, lead_id);
CREATE INDEX atlas_follow_ups_lead_due_idx ON atlas_follow_ups (tenant_id, lead_id, status, due_at, follow_up_id) WHERE lead_id IS NOT NULL AND archived_at IS NULL;
`;

const contextualAttachmentsSql = `
CREATE TABLE atlas_contextual_attachments (
  tenant_id TEXT NOT NULL,
  attachment_id TEXT NOT NULL,
  parent_type TEXT NOT NULL CHECK (parent_type IN ('TOOL_INSTANCE','TOOL_ASSEMBLY','PURCHASE_REQUEST','JOB','JOB_OPERATION')),
  parent_id TEXT NOT NULL,
  tool_instance_id TEXT,
  tool_assembly_id TEXT,
  purchase_request_id TEXT,
  job_id TEXT,
  job_operation_id TEXT,
  file_name TEXT NOT NULL,
  media_type TEXT NOT NULL,
  byte_size BIGINT NOT NULL CHECK (byte_size >= 0 AND byte_size <= 52428800),
  checksum_sha256 TEXT,
  category TEXT NOT NULL DEFAULT 'GENERAL' CHECK (category IN ('PHOTO','DRAWING','INSPECTION','RECEIPT','CERTIFICATE','GENERAL')),
  description TEXT,
  storage_provider TEXT NOT NULL CHECK (storage_provider IN ('S3','AZURE_BLOB','TEST')),
  storage_reference TEXT NOT NULL,
  upload_status TEXT NOT NULL DEFAULT 'PENDING' CHECK (upload_status IN ('PENDING','AVAILABLE','FAILED','ARCHIVED')),
  processing_status TEXT NOT NULL DEFAULT 'NOT_REQUESTED' CHECK (processing_status IN ('NOT_REQUESTED','PENDING','COMPLETE','FAILED')),
  processing_provenance_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  idempotency_key_hash TEXT NOT NULL,
  failure_code TEXT,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  uploaded_by_user_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  archived_at TIMESTAMPTZ,
  PRIMARY KEY (tenant_id, attachment_id),
  UNIQUE (tenant_id, idempotency_key_hash),
  UNIQUE (tenant_id, storage_provider, storage_reference),
  FOREIGN KEY (tenant_id) REFERENCES atlas_installation (tenant_id),
  FOREIGN KEY (uploaded_by_user_id) REFERENCES atlas_users (user_id),
  FOREIGN KEY (tenant_id, tool_instance_id) REFERENCES atlas_tool_instances (tenant_id, tool_instance_id),
  FOREIGN KEY (tenant_id, tool_assembly_id) REFERENCES atlas_tool_assemblies (tenant_id, tool_assembly_id),
  FOREIGN KEY (tenant_id, purchase_request_id) REFERENCES atlas_purchase_requests (tenant_id, purchase_request_id),
  FOREIGN KEY (tenant_id, job_id) REFERENCES atlas_jobs (tenant_id, job_id),
  FOREIGN KEY (tenant_id, job_operation_id) REFERENCES atlas_job_operations (tenant_id, job_operation_id),
  CONSTRAINT atlas_contextual_attachments_id CHECK (attachment_id LIKE 'ATTACH-________-____-____-____-____________'),
  CONSTRAINT atlas_contextual_attachments_hash CHECK (idempotency_key_hash LIKE '________________________________________________________________'),
  CONSTRAINT atlas_contextual_attachments_checksum CHECK (checksum_sha256 IS NULL OR checksum_sha256 LIKE '________________________________________________________________'),
  CONSTRAINT atlas_contextual_attachments_parent CHECK (
    (parent_type='TOOL_INSTANCE' AND parent_id=tool_instance_id AND tool_instance_id IS NOT NULL AND tool_assembly_id IS NULL AND purchase_request_id IS NULL AND job_id IS NULL AND job_operation_id IS NULL) OR
    (parent_type='TOOL_ASSEMBLY' AND parent_id=tool_assembly_id AND tool_instance_id IS NULL AND tool_assembly_id IS NOT NULL AND purchase_request_id IS NULL AND job_id IS NULL AND job_operation_id IS NULL) OR
    (parent_type='PURCHASE_REQUEST' AND parent_id=purchase_request_id AND tool_instance_id IS NULL AND tool_assembly_id IS NULL AND purchase_request_id IS NOT NULL AND job_id IS NULL AND job_operation_id IS NULL) OR
    (parent_type='JOB' AND parent_id=job_id AND tool_instance_id IS NULL AND tool_assembly_id IS NULL AND purchase_request_id IS NULL AND job_id IS NOT NULL AND job_operation_id IS NULL) OR
    (parent_type='JOB_OPERATION' AND parent_id=job_operation_id AND tool_instance_id IS NULL AND tool_assembly_id IS NULL AND purchase_request_id IS NULL AND job_id IS NULL AND job_operation_id IS NOT NULL)
  ),
  CONSTRAINT atlas_contextual_attachments_lifecycle CHECK ((upload_status='ARCHIVED' AND archived_at IS NOT NULL) OR (upload_status<>'ARCHIVED' AND archived_at IS NULL))
);
CREATE INDEX atlas_contextual_attachments_parent_idx ON atlas_contextual_attachments (tenant_id, parent_type, parent_id, created_at DESC, attachment_id DESC) WHERE upload_status<>'ARCHIVED';
CREATE INDEX atlas_contextual_attachments_uploader_idx ON atlas_contextual_attachments (tenant_id, uploaded_by_user_id, created_at DESC, attachment_id DESC) WHERE upload_status<>'ARCHIVED';
CREATE INDEX atlas_contextual_attachments_status_idx ON atlas_contextual_attachments (tenant_id, upload_status, processing_status, updated_at, attachment_id) WHERE upload_status IN ('PENDING','FAILED');

CREATE TABLE atlas_contextual_attachment_events (
  tenant_id TEXT NOT NULL,
  attachment_event_id TEXT NOT NULL,
  attachment_id TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('UPLOAD_STARTED','UPLOAD_COMPLETED','UPLOAD_FAILED','METADATA_UPDATED','ARCHIVED','PROCESSING_UPDATED')),
  occurred_at TIMESTAMPTZ NOT NULL,
  actor_user_id TEXT NOT NULL,
  correlation_id TEXT NOT NULL,
  previous_version INTEGER,
  new_version INTEGER NOT NULL,
  details_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (tenant_id, attachment_event_id),
  FOREIGN KEY (tenant_id, attachment_id) REFERENCES atlas_contextual_attachments (tenant_id, attachment_id),
  FOREIGN KEY (actor_user_id) REFERENCES atlas_users (user_id),
  CONSTRAINT atlas_contextual_attachment_events_id CHECK (attachment_event_id LIKE 'ATTACH-EVT-________-____-____-____-____________')
);
CREATE INDEX atlas_contextual_attachment_events_history_idx ON atlas_contextual_attachment_events (tenant_id, attachment_id, occurred_at DESC, attachment_event_id DESC);

CREATE TABLE atlas_tool_manual_entry_events (
  tenant_id TEXT NOT NULL,
  manual_entry_event_id TEXT NOT NULL,
  tool_instance_id TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('CREATED','UPDATED')),
  occurred_at TIMESTAMPTZ NOT NULL,
  actor_user_id TEXT NOT NULL,
  correlation_id TEXT NOT NULL,
  previous_version INTEGER,
  new_version INTEGER NOT NULL,
  details_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (tenant_id, manual_entry_event_id),
  FOREIGN KEY (tenant_id, tool_instance_id) REFERENCES atlas_tool_instances (tenant_id, tool_instance_id),
  FOREIGN KEY (actor_user_id) REFERENCES atlas_users (user_id),
  CONSTRAINT atlas_tool_manual_entry_events_id CHECK (manual_entry_event_id LIKE 'MANUAL-EVT-________-____-____-____-____________')
);
CREATE INDEX atlas_tool_manual_entry_events_history_idx ON atlas_tool_manual_entry_events (tenant_id, tool_instance_id, occurred_at DESC, manual_entry_event_id DESC);
`;

function migration(id, sql) {
  return Object.freeze({ id, sql, checksum: createHash('sha256').update(sql).digest('hex') });
}

export const DOMAIN_MIGRATIONS = Object.freeze([
  migration('0002_domain_identity', identitySql),
  migration('0003_domain_crm_commercial', crmCommercialSql),
  migration('0004_domain_operations', operationsSql),
  migration('0005_domain_supporting_workflows', supportSql),
  migration('0006_internal_jobs_and_assets', internalJobsAssetsSql),
  migration('0007_physical_tooling_traceability', physicalToolingSql),
  migration('0008_physical_wip_bins', wipBinsSql),
  migration('0009_crm_activity_follow_up', crmActivityFollowUpSql),
  migration('0010_unified_lead_intake', unifiedLeadIntakeSql),
  migration('0011_contextual_attachments', contextualAttachmentsSql)
]);
