# ADR 0019 — Authoritative taxonomy and the Snapshot v2 writer

- Date: 2026-10-17
- Status: Accepted for B2 development; Production migration is a separate B3 gate
- Prerequisite: B1 `9236209` deployed with existing v1 input, confirmed by the operator

## Decision

Migration 00004 introduces SQLite schema **4**. Content payload_schema_version
stays **1**; the CMS public wire version becomes **2**. Migrations 1–3 and Snapshot
v1 remain unchanged. `tag_translations` stores only optional English translations
of existing tag identities. `note_groups` owns bilingual group metadata and order;
slugs are immutable and groups have no hard-delete operation. Audit's protected
table-copy migration adds `note_group` and restores its index/immutable triggers.

Notes reference the authority by groupSlug, without a new groupId in Revisions.
Save, restore-to-Draft and new submission/direct-publication snapshots resolve
the group and replace legacy display mirrors. Reviewed publication validates the
authority while selecting the exact immutable candidate. Historical DTOs remain
exact. Current Draft/list presentation resolves current metadata without writing
it back. Missing nonempty group references fail; an incomplete Draft may remain
ungrouped. A restored historical group must exist before restoring its Revision.

Admin-only taxonomy writes use the existing policy, actor reauthorization,
immediate transaction and publication fence before BEGIN. Audit and a generation
job commit together when selected active published Revisions use the changed
taxonomy. Unused taxonomy and Draft-only changes do not publish. Lists use ID
keyset pages of 100 and bounded server searches of slug/Chinese/English names.
English tag descriptions require an English name because a translation row cannot
have an empty name; removing both deletes only that translation. Group fields may
fall back independently. All Admin interface copy remains Chinese.

The existing Tag management form also serves the new Group page. Notes only
select existing groups and order. A published-note warning precedes selection:
changing group retains the old path redirect but changes the Giscus term; comments
are not migrated. A/A2 editor DOM, selection/Undo, queue and focus layout remain.

The exporter writes only v2: translated tags, only referenced groups, minimal
groupSlug/order Note payloads. It validates both directions of references and
unique IDs/slugs. Historical display mirrors may disagree and are not the v2
authority. Latest uses version 2; observation accepts old v1/new v2 markers during
rollout. Immutable keys, byte hashes, freshness/fence and Hook ordering remain.
The transient Development preview deliberately keeps its bounded v1 projection.

## Explicit data upgrade

`gopheratlas-taxonomy` offers read-only `plan`, explicit offline `apply`, and
read-only local `export`. It requires an explicit existing DB path, never reads
environment files and never calls R2/Hook. Plan compares all Note Drafts with
nonempty groupSlug and active selected published Notes, reports each conflicting
name/description/order, and does not inspect irrelevant historical versions as
authority. Incomplete ungrouped Drafts are counted/skipped.

Plan's fingerprint covers exact source payloads/versions and generation, and
survives schema 3→4. Apply rechecks under the immediate lock, requires an active
Admin actor, rejects conflicts/changed source/partial group initialization, and
atomically imports groups, Audit, readiness state and **one new generation**.
Allocating that generation is essential: v2 bytes must never reuse an existing
immutable v1 generation key. It does not republish articles or create Revisions.
Completed apply is explicitly detected and cannot run twice.

`taxonomy_state` blocks startup/readiness/export on an existing DB until apply
commits; a new empty DB initializes ready in the migration itself. There is no
startup import or automatic migration. Down refuses translations, groups,
completed imports or note_group Audit rather than deleting new data. Normal
upgrade recovery uses consistent backups and the publication high-water mark,
not destructive downgrade or overwriting latest.

## Alternatives and verification

Rewriting immutable Revision payloads, synthesizing group IDs per article and
silently choosing a conflicting source were rejected. Keeping a v1/v2 dual writer
would increase rollout ambiguity; the deployed B1 reader already supports both.
Development legacy import receives only the necessary adaptation to create its
explicitly planned groups through the Admin service, never raw content SQL.

Tests use isolated schema-3 databases, exact before/after historical rows,
conflict/stale/Audit rollback cases, irreversible-Down guards, policy/HTTP closure,
search paging, v2 graph/privacy and the existing worker/storage regression suite.
The [upgrade runbook](../operations/taxonomy-v2-upgrade.md) requires a protected
Production-copy rehearsal and separate approval before any B3 execution.
