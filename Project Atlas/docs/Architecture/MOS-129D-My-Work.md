# MOS-129D My Work

My Work is Atlas's bounded personal execution mode. Mission Control remains the organizational exception surface; My Work includes only work canonically owned by, assigned to, or requiring action from the authenticated Atlas actor.

## Initial sources

- Follow-Ups whose canonical `ownerUserId` is the authenticated actor and whose status is actionable.
- active Jobs whose canonical `ownerUserId` or operator identity is the authenticated actor, including overdue and blocked work.
- pending Purchase Requests when the actor has `PURCHASE_APPROVE` and is not the requester, preserving the canonical separation-of-duties rule.

Commercial, Finance, Firearms, and Tenant Admin are excluded because their current models do not establish actor-specific ownership or required-action assignment. Adding organizational alerts from those domains would duplicate Mission Control. They can join My Work only after their canonical domain gains explicit personal responsibility semantics.

## Contract and ordering

Every item contains a domain type, human-readable label and context, inclusion reason, due time, urgency, business status, one navigation action, and authoritative destination. It does not define a universal lifecycle or mutation API.

Ordering is deterministic: overdue, blocked, due today, waiting on the actor, due tomorrow, this week, then other assigned work. Ties use due date, domain type, and stable item key. The server caps each source at 25 and the combined queue at 50. Overflow is disclosed rather than silently hidden.

## Authority and resilience

`getMyWork()` obtains tenant, actor, and capabilities from the authoritative Atlas session. It accepts no user or tenant parameter. Module-specific sources are excluded until they have canonical personal-action semantics. Each destination reauthorizes independently. Source failures are isolated, stale callbacks are rejected by a request generation, and only the active request owns `aria-busy`.

The repository adapters currently scan some tenant workbooks before projecting bounded results. This is documented MOS-120 adapter debt; My Work does not send global datasets to the browser, introduce polling, or perform N+1 hydration.

Sales/PM, Purchasing, and Finance personas now land on My Work. Shop Operators continue to land deterministically on Shop Floor, Owner/Manager on Mission Control, and isolated Tenant Admin users on Administration.
