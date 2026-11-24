# Azure acceptance preparation

This package targets `rg-atlas-mos140c-acceptance` in West US 2. Use Azure Portal in the authenticated acceptance directory. Infrastructure deployment, DNS changes, provider calls and synthetic sign-in require a separately approved test window.

## Planned infrastructure

- Ubuntu Server 24.04 LTS on `Standard_B2s` with 2 vCPU, 4 GiB RAM and a 64 GiB Standard SSD OS disk. Use a single operator IPv4 address with an explicit `/32` for SSH and allow HTTP and HTTPS for Caddy. Verify the SSH source in the reviewed parameter set. Use an SSH public key and keep password authentication disabled.
- PostgreSQL Flexible Server 17 on Burstable `Standard_B1ms` with 32 GiB, seven-day backup retention, and public access disabled. PostgreSQL uses a delegated subnet and a linked private DNS zone. The application uses the server's Azure FQDN for hostname verification and the current Azure PostgreSQL CA chain. Keep a separate migration login and use the existing marker, seed, and runtime grants in the [hosted runbook](../README.md).
- Existing Compose and Caddy run the combined Atlas runtime. A DNS owner must confirm and publish the dedicated hostname only after approval. The runtime's configured origin must match the HTTPS URL.
- Keep the existing S3 gateway with a dedicated private bucket and scoped credentials, plus an approved HTTPS AI gateway with scoped credentials and a synthetic-use budget. Azure Blob uses a different protocol and needs a gateway binding and integration tests before substitution. The Azure template creates neither storage nor AI resources.

## Validate offline and review before any deployment

Run `bicep build main.bicep` and `bicep build budget.bicep` using the standalone Microsoft Bicep compiler. Keep resulting ARM JSON and local parameter or secret files outside the checkout. Static validation does not check subscription quotas or regional capacity.

In Azure Portal, verify that the resource group is in the intended subscription and directory. Confirm compute quota and availability for `Standard_B2s` and check that Flexible Server 17 with Burstable B1ms and private networking is selectable for the subscription in West US 2. Resolve any capacity or trial restrictions before proposing a different SKU. After explicit deployment approval, use the Portal custom template experience to load the compiled ARM template and review scope, parameters, charges, and resources before submission. Supply the database bootstrap credential only via an approved secure parameter or secret store. Keep bootstrap and migration credentials off the runtime mount.

Merge `entra.settings.example.json` into the existing runtime settings using the verified acceptance directory and application IDs. Verify the exact Web callback `https://atlas-acceptance.greyfirsystems.com/auth/callback`. Use the existing OIDC credentials through the file-based secret mount. Keep the dedicated synthetic users and distinct editor and reader roles. Run the packaged browser session capture and API rehearsal from the [hosted runbook](../README.md). Full operator UI acceptance remains a separate dependency.

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
