# Legacy import — Development only

Production scope changed on 2026-09-22: the user will start afresh, without old
content migration. This tool is not part of the domain cutover; see ADR 0015.

The importer reads an exact local checkout of the old repository. It never fetches
the original external article bodies. Plan and apply are separate commands:

```sh
node scripts/legacy-import.mjs plan --source <legacy-checkout> --owner <active-admin-id> --author 福狼=<author-id> --output .cache/legacy-import-plan.json
node scripts/legacy-import.mjs apply --source <legacy-checkout> --owner <active-admin-id> --author 福狼=<author-id> --database <development-db>
```

Use an explicitly migrated Development database with an existing active Admin
and mapped Author profiles. The owner must be the active Admin running the import.
Legacy external source author names remain metadata; they do not create CMS users.
The Note author mapping is explicit. Do not invent a GitHub identity for a real
person. Stop that database's CMS before apply; apply also requires the configured
CMS listener to be free. It does not run migrations or start services.

Plan reads no `.env`, DB or network and is repeatable. Inspect errors, warnings,
all preserved paths, source dates, author mappings, Topic recommendation counts,
group metadata, tags and images before apply. Site-owned About/Contribute/Logo
inputs are listed separately; they are adapted into repository-owned Astro pages,
not inserted as ordinary Content. Keep detailed plans in ignored `.cache`, never
in an Audit event. Errors identify source file/field/classification, not secrets.

Apply loads root `.env` with process precedence and supports `--database` as an
explicit Development override. It uses persistent FileStore beside that DB; no
R2 configuration is used. A disposable DB and fake storage are used by
automated tests. Any requested real Development apply must name its author mapping
and target DB; it is distinct from the fake-storage verification rehearsal.

The normal asset service downloads/validates three supported legacy images,
derives immutable SHA keys, uploads/deduplicates, and rewrites exact Markdown AST
destinations. The whole download batch is bounded at 128 MiB and individual files
retain existing 10 MiB/dimension limits. Binary metadata is retained. Failed image
download prevents content creation; network I/O never occurs in a SQLite write tx.

After tags, apply creates Curated, Topic, then Note through ordinary service
commands. It publishes direct revisions without fake approvals. Historical
Content/publication dates are restored transactionally; Audit and Revision dates
show the actual import. The ordinary generation/jobs remain durable. Apply never
uploads snapshots or calls the Hook. On the next CMS start, the normal worker
coalesces and exports them to local storage; Development never invokes a Hook.

Do not run apply twice: content identities, routes and Tag conflicts stop a repeat.
Note group metadata is checked against both the plan and existing published Notes
before the first asset/content mutation. Private, Tailnet/CGNAT and special-purpose
image destinations are rejected without weakening ordinary Markdown validation.
Per-content transactions do not make the entire import atomic. On failure, inspect
the reported counts and database before retrying; preserve its backup. A disposable
database may be recreated by its operator. Content-addressed orphan assets need no
rollback network deletion.

Legacy baseline at `e1a623b`: 27 curated articles, seven topics, one note, 118 tags,
three images, 27 Topic entries, 11 recommended entries. The route report preserves
126 old Topic/Note/Tag URLs and adds 27 Curated archive URLs. In particular,
`benchmarking-and-comparisons` uses the old category exception and the original
Note path is `/notes/cybersecurity/crs-for-fiber-service/`.

After import run `make dev`: check the three Admin product lines, source links,
Topic order, groups, historic dates, images, Draft Preview and generation refresh.
The browser visual comparison is against the old site, in both themes and at
desktop/narrow widths. Human visual acceptance is still required.

The CLI rejects Production mode and remains unchanged. P0-6 now covers domain
cutover and new-site acceptance only. Never point this Development importer or
implementation tests at Production SQLite; no production import extension is needed.
