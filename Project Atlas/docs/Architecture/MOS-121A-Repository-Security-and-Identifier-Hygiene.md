# MOS-121A Repository Security and Internal-Identifier Hygiene

## Scope and method

Release channel: **MAIN**. Baseline:
`abe0e71cb3d99daa93dfd5b885da89708eaef534`.

The Git remote was confirmed as `brendanb-pm/Project-Atlas` and the branch as
`main` before changes. The audit inspected all 123 tracked files across source,
documentation, tests, examples and committed configuration. Checks covered
credential signatures, token/key assignments, opaque Google identifiers,
deployment metadata, URLs, calendar/folder IDs, email/account literals, Script
Properties usage and ignore rules. Candidate values were classified rather than
assuming every opaque string was a secret.

This audit did not read, copy, rotate or modify production Script Properties,
credentials, providers or other production resources. Candidate values are not
reproduced here.

## Findings

| Classification | Finding | Disposition |
| --- | --- | --- |
| SECRET | No committed private key, OAuth client secret, API key, access/refresh token, password or app-specific password was detected in current MAIN. | No credential rotation requested. Continue secret-manager/Script Properties boundary. |
| INTERNAL IDENTIFIER | `Production-Deployment.md` contained a concrete production-specific value for `VMOS_SPREADSHEET_ID` rather than a placeholder. A spreadsheet ID identifies a resource but does not itself authorize access. | Replaced with `REPLACE_WITH_PRODUCTION_SPREADSHEET_ID`; documentation now states the real value belongs in deployed Script Properties or approved secure deployment configuration. The production property was not changed. |
| PUBLIC / NON-SENSITIVE CONFIGURATION | Script Property names, public provider endpoint, model name, sheet/header names, workflow identifiers, placeholder web-app URL and `.clasp.json.example` placeholder. | Retained. These values are necessary documentation or non-secret configuration. |
| FALSE POSITIVE | Test-only email domains (`example.com` and reserved `.test` domains), synthetic IDs/UUIDs, commit SHAs, long function/event names and placeholder deployment strings matched broad heuristics. | Retained; none grants production access or identifies a live account. |

No hard-coded live credential was found in `.gs` source. Runtime-sensitive
values are obtained through existing Script Properties/configuration mechanisms,
including spreadsheet, Drive root, API key, calendar, endpoint and mapping
configuration. Provider source contains no committed provider token.

## Deployment and local-file hygiene

The committed `appscript/.clasp.json.example` contains only an unambiguous
replacement placeholder. The real `appscript/.clasp.json` was already ignored
by the nested ignore file. A repository-root `.gitignore` now also excludes
local `.env` variants, real `.clasp.json` files and common exported OAuth,
credential and token JSON filenames while explicitly permitting `.env.example`.

The existing local `.env.local` remains untracked and was not inspected or
modified. Ignore verification confirms it is now excluded.

## Git-history exposure

The removed internal spreadsheet identifier was introduced with the deployment
document in commit `c0d06f0` and therefore remains in Git history and existing
clones. It is an internal resource identifier, not an authentication credential;
the audit found no demonstrated reason for destructive history rewriting or
credential rotation. Access continues to depend on Google authorization.

If later evidence shows that the value participates in an access-control bypass,
or if an actual credential is discovered, stop and perform a separately approved
rotation/history-remediation assessment. Do not rewrite shared history merely to
hide a non-secret identifier.

## Verification

- Current tracked content contains the placeholder, not the removed identifier.
- Credential-pattern and environment-identifier scans report no known live
  secret in current MAIN.
- `.env.local`, `.clasp.json`, credential exports and token exports are ignored.
- Repository diff/whitespace hygiene passes.
- Product behavior and production resources are unchanged.
