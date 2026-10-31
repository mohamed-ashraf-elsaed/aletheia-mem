# Notes on log.jsonl

Line keys match what the distro server's `src/log-export.ts` writes: timestamp, channel, tier, text, url, state, source, approvedBy. `approvedBy` is null because the approver was not recorded for these hand-done actions.

## Timestamp provenance (checked 2026-11-01)

| Line | Timestamp | Status |
|---|---|---|
| punkpeye/awesome-mcp-servers PR 17803 | 2026-10-27T17:30:58Z | verified: `gh api repos/punkpeye/awesome-mcp-servers/pulls/17803` created_at; state was `open`, not merged |
| Dev.to article | 2026-10-27T18:03:56Z | verified: Dev.to API `published_timestamp` |
| TensorBlock/awesome-mcp-servers PR 4715 | 2026-10-28T09:10:45Z | verified: `gh api` merged_at (created 2026-10-27T17:29:55Z) |
| Glama listing | 2026-10-27T17:43:48Z | UNVERIFIED: this is the commit time of the README Glama score badge (20:43:48 +03:00), the earliest repo evidence the listing existed. The real listing date was not fetched. |
| mcpservers.org listing | 2026-10-31T20:25:18Z | UNVERIFIED: this is the commit time (22:25:18 +02:00) of the first README "Listed in" mention. The real listing date was not fetched. |

## Not yet logged (UNVERIFIED, no links supplied)

- Reddit post(s): the owner has not supplied a link. Add a line when one exists.
- X thread: the owner has not supplied a link. Add a line when one exists.

Do not add lines for these without a real URL and date.
