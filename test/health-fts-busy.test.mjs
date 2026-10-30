// /healthz and `aletheia doctor` must not report corruption when quick_check trips over an index that another process
// is writing. A real failure (a damaged index that does not answer queries) must still be reported.
import { describe, expect, test } from "bun:test";
import { healthReport } from "../src/hub/health.mjs";

const stub = ({ quickCheck, matchWorks = true }) => {
  let call = 0;
  return {
    db: {
      prepare(sql) {
        if (sql.startsWith("PRAGMA quick_check")) return { all: () => quickCheck(call++).map((value) => ({ quick_check: value })) };
        if (sql.includes("MATCH")) return { all: () => { if (!matchWorks) throw new Error("fts5: corruption found"); return []; } };
        return { all: () => [], get: () => ({ n: 0 }) };
      },
    },
  };
};
const fts = (n) => [`fts5: corruption found reading blob ${n} from table "memories_fts"`];

describe("health check and busy FTS indexes", () => {
  test("a one-off FTS complaint is retried and the database reports ok", () => {
    const report = healthReport(stub({ quickCheck: (call) => (call === 0 ? fts(1) : ["ok"]) }));
    expect(report.status).toBe("ok");
    expect(report.db.detail).toBe("quick_check ok");
  });
  test("repeated FTS complaints with a working FTS query are accepted and say so", () => {
    const report = healthReport(stub({ quickCheck: (call) => fts(call) }));
    expect(report.status).toBe("ok");
    expect(report.db.detail).toContain("FTS integrity check skipped");
  });
  test("repeated FTS complaints with a failing FTS query are an error", () => {
    const report = healthReport(stub({ quickCheck: (call) => fts(call), matchWorks: false }));
    expect(report.status).toBe("error");
    expect(report.db.detail).toContain("fts5");
  });
  test("a complaint about a normal table is never retried away", () => {
    const report = healthReport(stub({ quickCheck: () => ["row 1 missing from index idx_x"] }));
    expect(report.status).toBe("error");
  });
});
