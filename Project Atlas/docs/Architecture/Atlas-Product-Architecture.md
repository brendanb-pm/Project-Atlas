# Project Atlas Product Architecture

## Product boundaries

| Boundary | Responsibility | Must not contain |
|---|---|---|
| Project Atlas Platform | Configurable product and contracts | Vitality-only assumptions |
| VMOS | Vitality Atlas deployment/configuration | Platform-wide business constants |
| Platform Core | tenant/brand config, identity, audit, repository/storage/provider contracts | Industry-specific fields |
| Manufacturing Core | generic manufacturing commercial and operational entities | Firearm/coating-specific attributes |
| Firearms Module | firearm intake, inspection, authorization, optic/parts, specialized tablet UX | Generic Job schema changes |
| Coatings Module | coating system, color, prep, masking, blast, cure, finish, QC | Mandatory core terminology |
| Integrations | optional provider adapters | Canonical system-of-record writes outside services |

## Tenant/brand configuration contract

```text
TenantBrandConfiguration
  organizationName, productDisplayName, deploymentDisplayName
  logoLightReference, logoDarkReference
  primaryColor, secondaryColor, accentColor
  typography (optional), enabledModules[], terminologyOverrides{}
```

The UI resolves its labels/assets/theme from this configuration. A specialized module can supply its own experience and default palette, but must do so as a tenant/module configuration, not generic business logic.

## Future-ready boundaries

Repositories accept an abstract storage implementation; services expose domain commands; integrations translate provider events into validated commands. A future tenant key belongs at configuration/repository selection and audit boundaries. It must not be inferred from the browser, a sheet tab, brand styling, or external-board metadata.
