# Releasing

How a new version of `aletheia-mem` reaches npm and GitHub. Steps marked **Owner** need the owner's npm login or
GitHub rights. Agents prepare files and run checks; they never publish, tag or push.

## Versioning

The project uses [semantic versioning](https://semver.org/spec/v2.0.0.html) in the 0.x range.

- **Patch** (0.1.0 to 0.1.1): fixes and documentation.
- **Minor** (0.1.x to 0.2.0): new features.
- **Breaking change** (also a minor bump while the version is 0.x, called out in the CHANGELOG under "Changed" or
  "Removed"): removing or renaming an API route, changing a CLI flag or command, or changing the database schema in a
  way an older database cannot be read without migration.
- 1.0.0 is not planned yet.

## Release sequence

1. **Prepare.** On `main` with a clean tree, write the release notes under `## [Unreleased]` in `CHANGELOG.md`, then run:

   ```bash
   bun scripts/release.mjs --prepare 0.1.1
   ```

   It refuses on a dirty tree, a branch other than `main`, a version that is not greater than the one in
   `package.json` and the CHANGELOG, or empty notes. It bumps `package.json` and moves the notes into
   `## [0.1.1] - <date>`. It does not commit. Review the diff and commit it: `git commit -am "release: 0.1.1"`.
2. **Run all checks.** `bun test`, `bun scripts/check-tasks.mjs`, `bun scripts/gen-tables.mjs --check`,
   `bun scripts/i18n-check.mjs`, `bun scripts/check-claims.mjs`, `bun scripts/check-docs-links.mjs`,
   `bun scripts/audit-deps.mjs`, `bun scripts/build-site.mjs`, `bun scripts/gen-status.mjs --check`, and
   `bun scripts/release.mjs --verify`. The last one checks that the versions agree, the tag is free, the tarball has
   the required files and is under 12 MB unpacked, README images are absolute https URLs, and the first 60 README
   lines hold no relative link.
3. **Owner: push.** `git push origin main`. Wait for the Test workflow to turn green.
4. **Owner: publish.** `npm publish --access public`. Publishing needs the owner's npm login and a one-time code
   (2FA on writes). A granular access token limited to this package, with the bypass-2FA option, works for
   automation (see the setup comment in `.github/workflows/release.yml`). A new version can take a few minutes to
   appear; `npx aletheia-mem` can fail with a not-found error until it does. This happened with 0.1.0.
5. **Owner: tag after the publish works.** Tagging first would leave a tag for a version that never shipped.

   ```bash
   git tag -a v0.1.1 -m "aletheia-mem 0.1.1"
   git push origin v0.1.1
   ```

   The tag push starts `.github/workflows/release.yml`. It tests, verifies, publishes only if trusted publishing or
   `NPM_TOKEN` is set up (otherwise it skips that step), and creates the GitHub release. If you published by hand in
   step 4, the workflow's publish step would fail with "version already exists"; leave trusted publishing and
   `NPM_TOKEN` unset until you want the workflow to publish.
6. **Owner: GitHub release.** If the workflow did not make one: `gh release create v0.1.1 --generate-notes`.
7. **Smoke test.** In a clean directory, after the version is visible:

   ```bash
   cd "$(mktemp -d)" && npx aletheia-mem@0.1.1 --version
   ```

   Then open `https://www.npmjs.com/package/aletheia-mem` and check the page (see `docs/tasks/unverified.md`).

## Rollback

- Never unpublish after 72 hours; npm refuses it, and it breaks anyone who depends on the version.
- A bad release: `npm deprecate aletheia-mem@0.1.1 "broken: use 0.1.2"` (owner). The version stays installable and
  shows the warning.
- Ship the fix as the next patch (`--prepare 0.1.2`). Never re-publish the same version number; npm does not allow it.
- Delete a wrong tag only if the version never reached npm: `git tag -d vX.Y.Z` and `git push origin :refs/tags/vX.Y.Z`.
