# ADR-0010: Reviewed result editions and personal report access

Date: 2026-10-06

Status: Accepted

Results owns immutable grading-policy revisions and independently reviewed report editions. It consumes completed, locked marks through Examinations, with Enrollment/People/Academics contracts for identities and labels. Published records freeze their inputs rather than computing from mutable marks on each read. A source fingerprint and shared parent examination lock prevent stale approval or publication after corrections.

Draft reports allow remarks and recalculation. Another account approves the preparer's/submittor's work. Publishing atomically supersedes the previous edition; withdrawal retains staff history while removing family access. Rejected mark corrections also advance the examination source version, conservatively requiring review work to be refreshed.

Student/guardian report access derives from current authenticated profile links. Guardian relationships must currently permit portal access; family readers never receive draft, superseded, withdrawn, unrelated, or cross-tenant reports. Each PDF export repeats access checks and records an event; PDFs are generated from the frozen snapshot without public URLs or shared caching.

Percentage bands and overall thresholds are school-configurable. Absence fails the subject, exemptions leave the denominator, and incomplete assessment coverage never becomes a pass award. This preserves honest results when date-effective examination rosters differ, without fabricating missing marks or reinterpreting completed enrollment history.
