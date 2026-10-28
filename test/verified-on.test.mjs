// the connector registry records verifiedOn, toolVersion and evidence per connector, and a
// verification is labelled stale when it is old or the running version is newer than the pinned one.
import { describe, expect, test } from "bun:test";
import { TOOLS, verificationStatus } from "../src/hub/tools.mjs";

describe("connector verification registry", () => {
  const now = Date.parse("2026-10-27");

  test("an old verifiedOn is labelled stale", () => {
    const status = verificationStatus({ rules: { verifiedOn: "2020-01-01" } }, { now });
    expect(status.status).toBe("stale");
    expect(status.label).toBe("stale");
  });

  test("a missing verifiedOn is labelled unverified", () => {
    expect(verificationStatus({ rules: { verifiedOn: null } }, { now }).status).toBe("unverified");
    expect(verificationStatus({}, { now }).status).toBe("unverified");
  });

  test("a recent verifiedOn is labelled verified", () => {
    expect(verificationStatus({ rules: { verifiedOn: "2026-10-26" } }, { now }).status).toBe("verified");
  });

  test("a running version newer than the pinned version is stale", () => {
    const tool = { rules: { verifiedOn: "2026-10-26", toolVersion: "1.0.0" } };
    expect(verificationStatus(tool, { now, currentVersion: "2.0.0" }).status).toBe("stale");
    expect(verificationStatus(tool, { now, currentVersion: "1.0.0" }).status).toBe("verified");
  });

  test("every registry entry records verifiedOn, toolVersion and evidence", () => {
    for (const tool of TOOLS) {
      expect(tool.rules).toHaveProperty("verifiedOn");
      expect(tool.rules).toHaveProperty("toolVersion");
      expect(tool.rules).toHaveProperty("evidence");
    }
  });

  test("unverified connectors say so", () => {
    for (const id of ["copilot", "aider", "agents-md"]) {
      expect(verificationStatus(TOOLS.find((tool) => tool.id === id), { now }).status).toBe("unverified");
    }
  });
});
