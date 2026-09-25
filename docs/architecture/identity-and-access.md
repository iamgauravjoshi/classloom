# Identity and access

A login account is distinct from a student, guardian, or staff record. An account may have memberships in several tenants; a guardian may relate to several students. Portal accounts can be provisioned after domain records exist.

Phase 2 will introduce opaque revocable sessions stored server-side and sent through secure HttpOnly cookies. Phase 3 adds explicit permissions with tenant, campus, academic, and relationship scopes. Authorization also checks workflow state, such as whether marks are still editable. Every sensitive API enforces authorization independently of UI visibility. Role/permission changes, attendance corrections, result publishing, payment adjustments, and exports generate audit records.
