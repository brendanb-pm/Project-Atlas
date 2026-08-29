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

function migration(id, sql) {
  return Object.freeze({ id, sql, checksum: createHash('sha256').update(sql).digest('hex') });
}

export const DOMAIN_MIGRATIONS = Object.freeze([
  migration('0002_domain_identity', identitySql),
  migration('0003_domain_crm_commercial', crmCommercialSql),
  migration('0004_domain_operations', operationsSql),
  migration('0005_domain_supporting_workflows', supportSql),
  migration('0006_internal_jobs_and_assets', internalJobsAssetsSql)
]);
