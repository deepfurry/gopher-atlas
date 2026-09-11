# ADR 0007 — Admin editorial UX over existing domain commands

Date: 2026-09-11. Status: Accepted; implemented in P0-3.

## Context

P0-2 already owns the transactional editorial state machine. An editor must
preserve unsaved text while respecting full-snapshot versions, and a reviewer
must never accidentally inspect somebody else's changing Draft. Publication
still ends at SQLite; ADR 0006 is unchanged.

## Decision

- Keep both migrations and schema version 2 unchanged. Services continue to call
  sqlc directly. Add bounded query filters, batch author labels, author directory,
  and immutable pending/history Review detail projections only.
- Central policy projects available Content and Review actions. React consumes
  these booleans; mutations reauthorize against the database inside transactions.
  Metadata assignment/featured flags and revision restore eligibility are also
  server-derived. Author profile administration reuses identity validation/Audit.
- Separate shell/providers/router from content, reviews, tags, people and audit.
  TanStack Query owns server data; React Hook Form owns the current in-memory
  form. No new global client state store or alternate transport is introduced.
- Queue full snapshots with a 1.7-second idle debounce, one request in flight,
  coalesced subsequent edits and server-returned versions. Manual save and
  workflow flush share the queue. A 409 pauses retries until explicit reload;
  navigation guards and copy controls protect local work. No Draft storage API.
- UIW is a source-only textarea editor with a command allowlist. All previews use
  react-markdown/GFM and shared safety helpers, with no raw HTML execution.
  Reject unsafe images before creating an img element, including unsaved input.
  Alias UIW's default preview to the same safe renderer and reject forbidden
  preview/editor modules in the production build graph. Debounce feedback/preview
  parsing by 200 ms; the Go validator remains authoritative.
- Lazy route chunks remain part of the Go embed. RouterProvider explicitly uses
  `useTransitions={false}` with the existing pinned React/Router versions: the
  default transition retained the old table on first lazy editor navigation in
  both browser verification and the regression test. No dependency upgrade is
  needed; route changes remain guarded before they commit.

## Alternatives and consequences

Duplicating the role/state matrix in React would drift from server policy.
Parallel PUTs or automatically retrying an old version would risk overwrites.
Browser-persisted Draft recovery would expand the private-content storage surface.
The default UIW preview includes a raw HTML parser, so it is not used.

The client preserves local work only while its tab remains alive. It offers copy,
explicit reload and navigation warnings, not automatic merging or offline editing.
Published-in-CMS status and editorial state are separate. Assets, R2, publication
jobs, public builds and import remain outside this phase.
