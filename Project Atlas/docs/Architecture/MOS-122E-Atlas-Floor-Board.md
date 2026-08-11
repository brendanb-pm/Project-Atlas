# MOS-122E Atlas Floor Board

The Atlas-native Floor Board is a dedicated large-format route backed by `FloorBoardService_`, not the financial Operations Dashboard and not an Asana view. Atlas Jobs remain authoritative.

The read model performs four repository reads per snapshot (Jobs, Customers, active QR/workflow assignments, and JobEvents), collapses events server-side to the latest event per Job, excludes old completed work, and caps output at 120 items by default with a hard ceiling of 200. It returns result counts, truncation, a monotonic content revision, as-of time, and a snapshot/delta-compatible contract. An unchanged cursor returns no items. A changed cursor requests authoritative replacement; a future bounded adapter can provide retained deltas without changing the UI contract.

Lanes map only existing status values: blocked/problem/stopped; running/in-process/active; ready/planned/queued; waiting/on-hold/pending; recent complete; and an explicit new/intake fallback for unclassified current work. Blocked cards use text, a heavy border, and contrast rather than color alone. The board exposes no QR bearer token, financial data, provider identity, or tenant-specific language.

Refresh preserves the last visible board, prevents overlapping requests, reports stale failure safely, and retries after 30 seconds. The route omits desktop navigation chrome, supports keyboard-linked Job opening, reduced motion, 1920/1440 large displays, and a 1024-pixel two-column fallback. Mobile is a simplified one-column fallback.

Local code/render-contract tests cover bounded output, classification, latest-event projection, safe unchanged refresh, blocked prominence, failure preservation, responsive rules, reduced motion, tenant neutrality, and absence of Asana coupling. Live Apps Script/Sheets performance and physical 90-inch display validation remain MOS-122H activation evidence.

No production resource changed.
