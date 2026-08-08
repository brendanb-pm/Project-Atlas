# Customer Status Notifications

Notifications are evaluated only after VMOS accepts a canonical status change. An Asana move cannot notify a customer directly; rejected moves produce no notification.

`validated VMOS status -> rules -> durable CustomerCommunicationEvent -> approved/scheduled provider send`

Rules dedupe on JobID + VMOS status + NotificationRuleID, support configurable cooldown/delay and manual approval, and cancel pending messages when the status is reverted before send. Failed sends remain visible for retry; `BLOCKED` has no default customer rule. Initial policy: RECEIVED, IN_PROCESS, and COATING may send automatically after a short configurable delay; READY_FOR_PICKUP is configurable automatic or human approved. Templates—not permanent code strings—own wording.

The provider interface is injected and inactive in this sprint. Sending is a separate explicit provider action with retry policy and provider reference persistence.
