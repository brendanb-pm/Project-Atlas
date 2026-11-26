# Azure acceptance preparation

This package targets `rg-atlas-mos140c-acceptance` in the qualified subscription. Use Azure Portal in the authenticated acceptance directory. Infrastructure deployment, DNS changes, provider calls and synthetic sign-in require a separately approved test window.

**Deployment gate (2026-11-24): NO-GO.** The template requires an explicit region and VM SKU. See [regional qualification](#regional-qualification) before selecting deployment parameters.

## Planned infrastructure

- Ubuntu Server 24.04 LTS on a verified x64 SKU with at least 4 GiB RAM and a 64 GiB Standard SSD OS disk. Use a single operator IPv4 address with an explicit `/32` for SSH and allow HTTP and HTTPS for Caddy. Verify the SSH source in the reviewed parameter set. Use an SSH public key and keep password authentication disabled.
- PostgreSQL Flexible Server 17 on Burstable `Standard_B1ms` with 32 GiB, seven-day backup retention, and public access disabled. PostgreSQL uses a delegated subnet and a linked private DNS zone. The application uses the server's Azure FQDN for hostname verification and the current Azure PostgreSQL CA chain. Keep a separate migration login and use the existing marker, seed, and runtime grants in the [hosted runbook](../README.md).
- Existing Compose and Caddy run the combined Atlas runtime. A DNS owner must confirm and publish the dedicated hostname only after approval. The runtime's configured origin must match the HTTPS URL.
- Keep the existing S3 gateway with a dedicated private bucket and scoped credentials, plus an approved HTTPS AI gateway with scoped credentials and a synthetic-use budget. Azure Blob uses a different protocol and needs a gateway binding and integration tests before substitution. The Azure template creates neither storage nor AI resources.

## Validate offline and review before any deployment

Run `./Test-Templates.ps1 -Bicep /path/to/bicep` using the standalone Microsoft Bicep compiler. Use `bicep build main.bicep --outfile /restricted/main.json` to generate the Portal upload. Keep resulting ARM JSON and local parameter or secret files outside the checkout. Static validation does not check subscription quotas or regional capacity.

In Azure Portal, verify that the resource group is in the intended subscription and directory. Confirm compute quota and availability for the exact `vmSize` and verify Flexible Server 17 with Burstable B1ms and private networking in the same `location`. After explicit deployment approval, use the Portal custom template experience to load the compiled ARM template and review scope, parameters, charges, and resources before submission. Supply the database bootstrap credential only via an approved secure parameter or secret store. Keep bootstrap and migration credentials off the runtime mount.

Merge `entra.settings.example.json` into the existing runtime settings using the verified acceptance directory and application IDs. Verify the exact Web callback `https://atlas-acceptance.greyfirsystems.com/auth/callback`. Use the existing OIDC credentials through the file-based secret mount. Keep the dedicated synthetic users and distinct editor and reader roles. Run the packaged browser session capture and API rehearsal from the [hosted runbook](../README.md). Full operator UI acceptance remains a separate dependency.

## Deployment order and approval gates

1. **Subscription qualification.** In Azure Portal, check registration of Compute, Networking and DBforPostgreSQL. Register a missing provider only with approval. For a single candidate region, confirm regional and VM-family vCPU headroom, a selectable 4 GiB Ubuntu x64 VM and exact Ubuntu image version, one Standard static IPv4, and selection of PostgreSQL 17, B1ms, 32 GiB and delegated private access. Save the portal evidence. Validate the actual trial offer and expiry and the cost of the selected meters. Quotas do not guarantee allocation capacity.
2. **Authorize spend and inputs.** Obtain approval for the 72-hour window, total server cost below $50, and the resource group and SKU list. Review the current $75 alert and seek approval before changing it. Confirm the dedicated hostname and DNS owner, operator SSH public key and single IPv4 source `/32`, test identities and verified OIDC issuer/subjects, dedicated private S3 bucket and prefix-scoped credential, and approved AI HTTPS endpoint, model, token and spending limit. Approve any identity creation or permission changes separately. VNet integration uses same-VNet routing, a delegated subnet and a private DNS zone/link. It requires no private endpoint, VPN, NAT gateway or DNS resolver for this topology. The VM's Standard public IP supplies explicit outbound connectivity.
3. **Review and deploy only after approval.** Use Portal Custom Deployment in the verified resource group. Review the compiled artifact, exact Ubuntu image version and plan before submitting. Supply the bootstrap credential as a secure parameter. Confirm the deployment succeeds and the public IP belongs to the VM NIC. Confirm the database has no public access and the private zone is linked to the intended VNet. From the VM, verify the Azure database FQDN resolves privately and connect using `psql` with `sslmode=verify-full` and the current Azure CA chain. Keep the bootstrap identity outside the application mounts.
4. **Bootstrap and start.** Install Docker Engine and Compose on the approved Ubuntu host. Record the application commit and resolved image digests for repeat runs. Create the marked database and distinct application and migration users as described in the hosted runbook. Put `settings-json`, the role-specific `database-password` and `database-ca` in each restricted mount. Add `oidc-subjects-json` only to the migration mount. Add `oidc-client-secret`, `s3-credentials-json` and `ai-gateway-token` only to the runtime mount. Configure `ACCEPTANCE_HOST`, `ACCEPTANCE_RUNTIME_CONFIG`, and `ACCEPTANCE_MIGRATION_CONFIG`. Point the dedicated DNS record to the reviewed static IP. Run Compose configuration validation and the one-shot migration, apply `runtime-grants.sql` as the migration owner, and start the application and Caddy. Verify `https://atlas-acceptance.greyfirsystems.com/ready`, private database access and the migration ledger before sign-in.
5. **Accept and stop.** Complete synthetic sign-in through Entra and run the hosted API rehearsal. Verify read-only and cross-tenant denials, evidence upload and regrind persistence. Restart the app and verify the persisted result. Work-order screens belong to MOS-141. Full MOS-140C operator acceptance requires a hosted tooling screen covering search, details/evidence, regrind, history and locator rotation, plus keyboard and rendered checks. API success qualifies only the API.
6. **Rollback and teardown.** On failure, stop ingress and the application, preserve sanitized logs, and verify the VM is deallocated in the portal. Keep applied migrations and stop if readiness reports a schema mismatch. Use the combined migration-aware artifact for recovery. Do not run a down migration or point an older single-story artifact at the combined database. Follow the separate deletion approval and inventory procedure below.

## Cost and cleanup

Illustrative West US 2 public retail prices in USD for 730 running hours, before tax and trial credits. Confirm the actual offer in the Portal before deployment.

| Component | Rate and planning estimate |
|---|---|
| Linux B2s | $0.0416/hour, about $30.37/month |
| PostgreSQL B1ms | $0.017/hour, about $12.41/month |
| PostgreSQL storage | $0.12/GiB-month, about $3.84 for 32 GiB |
| OS disk | E6 Standard SSD LRS, about $4.80/month plus disk operations |
| Standard public IPv4 | $0.005/hour, about $3.65/month |
| Other | Private DNS zone and queries, public DNS if applicable, outbound traffic, backup overage, storage, and AI billed separately |

Target less than $50/month in total server charges before trial credits. The always-on baseline is approximately $55 before extras. Keep the 4 GiB VM and plan a 72-hour acceptance window. With the other priced items conservatively counted for a full month, 72 VM hours bring the baseline to about $27.70, leaving about $22 for extras. Even 480 VM hours bring the baseline to about $44.67, leaving only about $5 for extras. Confirm the full estimate before approving an extension. See [Azure Retail Prices](https://learn.microsoft.com/en-us/rest/api/cost-management/retail-prices/azure-retail-prices) and [PostgreSQL pricing](https://azure.microsoft.com/en-us/pricing/details/postgresql/flexible-server/). Trial credit and free-service eligibility depend on the active offer and meter. External S3 and AI services require their own spending approvals.

Align the resource-group budget to $50 with actual thresholds of 50%, 80%, and 100% and a forecast threshold of 100% before provisioning. The existing portal budget was set to $75 and requires a separate update. The budget sends alerts and does not stop spending. Budget evaluation and notice delivery can lag. Verify the VM shows Stopped (deallocated) when the test window ends.

After the approved test window, archive sanitized results. Verify the subscription, the exact group name and all six ownership tags, and inventory the resources in that group. After separate cleanup approval, delete only that dedicated group from its Overview and confirm it disappears from the subscription's resource-group list. Check the subscription's disks, static IPs, backups, and DNS records for leftovers. VM deallocation alone leaves potential disk, IP, database, DNS and backup charges. Separately remove only the dedicated external records and synthetic data, revoke scoped credentials and delete local browser state as described in the hosted runbook.

## Regional qualification

Azure Portal showed `Microsoft.DBforPostgreSQL` as Registered. The VM picker used Ubuntu Server 24.04 LTS x64 Gen2 and non-zonal placement. The PostgreSQL wizard was inspected without submitting a deployment.

| Region | B2als v2 VM (2 vCPU, 4 GiB) | PostgreSQL 17, B1ms, 32 GiB, private VNet | Result |
|---|---|---|---|
| West US 2 | Selectable, $27.45/month | Subscription denied | NO-GO |
| West US 3 | Size not available, $27.45/month displayed | Options selectable, $12.41 compute + $3.68 storage/month | NO-GO |
| Central US | Size not available, $31.03/month displayed | Options selectable, $14.02 compute + $4.16 storage/month | NO-GO |
| East US 2 | Size not available, $27.45/month displayed | Subscription denied | NO-GO |

The exact database error for each denied region was `Subscription 'Azure subscription 1' is not allowed to provision in '<region>'.` In Central US the default Premium SSD v2 disabled Burstable. Selecting Premium SSD exposed B1ms and 32 GiB. West US 3 already exposed Premium SSD with Burstable. Preserve delegated private access and private DNS when testing another region.

All four regions showed 0 of 4 regional vCPUs, 0 of 4 Standard Basv2-family vCPUs, 0 of 3 Standard public IPv4 addresses and 0 of 1,000 VNets in use. Despite this headroom, the picker disabled B2als v2, B2ls v2, B2s and F2s v2 in West US 3 and Central US. Trial-eligible B1s and B2ats v2 have 1 GiB RAM and do not meet this workload's 4 GiB target.

West US 3 is the first region to recheck for a qualifying VM. Its 730-hour planning baseline is about **$52.49** before credits. Running the VM for 72 hours with the other fixed meters counted for a full month models **$27.75**. Central US models **$58.16** and **$30.19**, respectively. These estimates combine wizard prices with $4.80 for the E6 disk, $3.65 for Standard IPv4 and a $0.50 private DNS zone allowance. Allow separately for disk operations, DNS queries, egress and any backup overage. The same-VNet design needs no separately metered Private Endpoint or NAT gateway. External S3 and AI charges are separate.

VM and database wizard prices are estimates before trial benefits. The portal showed $200 credit remaining, and the exact credit expiry and meter applicability still need a billing readback. Model approval before credits. A budget alert leaves charges accruing. Record renewed portal evidence before entering the required region and VM SKU parameters.
