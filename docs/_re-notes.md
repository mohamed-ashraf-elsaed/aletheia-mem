# Appendix: how the original was reverse engineered

The trail, so the work can be repeated against a newer claude-mem. Nothing here is needed to run the clone.

1. `curl -i localhost:<port>/` returned a Vite shell titled "My Work · claude-mem"; `ss -ltnp` showed a Bun
   process; its command line named `.../claude-mem/15.2.0/scripts/worker-service.cjs`.
2. The bundle's API strings (`grep -oE '/api/[A-Za-z0-9_/.:-]*'`) gave the page's six endpoints.
   `new EventSource(...)` and `addEventListener('work-view'|'heartbeat')` gave the event names.
3. `worker-service.cjs.map` has no `sourcesContent`, but its `sources` list names every original module
   (`src/services/work-view/*.mjs`, `WorkViewRoutes.ts`, ...). Decoding the VLQ `mappings` gives each module's
   byte range in the minified file. Slicing and formatting each range with prettier made the work-view
   modules readable (identifiers stay mangled).
4. `skills/request-progress/scripts/request-groups.mjs` ships unminified (131 KB, comments intact) and holds the
   ledger code. The two `SKILL.md` files are the model prompts. `skills/owner-goals/scripts/*.py` do goal
   export and save.
5. The database schema came from `sqlite_master` (read-only, structure only). Row data was not copied.
6. `/api/work-view` from the live worker was saved and compared with the clone's output until the diff was empty
   (see 09-verification.md). That comparison, not reading, is what makes the claim "same behaviour".
7. A mismatch between a query and the schema (finding F1) was found because the live snapshot reported 0
   observations while the database held 401.
