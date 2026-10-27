# Install smoke check (macOS and no-Bun)

Status: **NOT RUN BY AUTHOR**. The published package `aletheia-mem@0.1.0` was smoke-tested only on the author's
Linux machine with Bun 1.3.10 (see [tasks/unverified.md](tasks/unverified.md) item 60 and
[tasks/T-080.md](tasks/T-080.md)). These are the exact commands and the expected output for the two remaining
machines; neither has been run.

The CLI prints its version with:

```bash
npx aletheia-mem --version
```

Expected output when it works:

```
0.1.0
```

## macOS

The command is the same. `npx` needs Node.js and npm, and the package's own bin needs Bun (its shebang is
`#!/usr/bin/env bun`), so install both before running.

```bash
# once, if not already installed
brew install node bun

# the check
npx aletheia-mem --version
```

Expected: `0.1.0`.

**NOT RUN BY AUTHOR.** macOS was never opened for this check.

## A machine without Bun

The package requires Bun at runtime; without it the bin cannot start. Run the same command to confirm that it fails
loudly rather than printing a version:

```bash
npx aletheia-mem --version
```

Expected: the command fails with an error naming the missing `bun` interpreter (for example
`env: 'bun': No such file or directory`, or npm's equivalent), **not** `0.1.0`.

**NOT RUN BY AUTHOR.** No machine without Bun was used.
