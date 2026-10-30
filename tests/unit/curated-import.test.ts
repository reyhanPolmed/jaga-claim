import { describe, it, expect } from "vitest";
import {
  curatedRowSchema,
  detectForbiddenFields,
  computePayloadChecksum,
  canonicalizeJson,
} from "../../src/lib/contracts/curated-import";

describe("curated-import-v1: Row Validation & Forbidden Fields", () => {
  const validRow = {
    schema_version: "jaga-claim-curated-v1",
    claim_id: "CLM_0123456789abcdefabcd",
    participant_key: "PST_abcdef0123456789abcd",
    source_revision: 1,
    snapshot_at: "2026-10-25T03:00:00Z",
    episode: {
      admission_date: "2026-10-20",
      discharge_date: "2026-10-24",
      service_level: "RITL",
      provider_type: "1",
      provider_region: "31",
      care_class: "3",
      tariff_regional: "1",
    },
    diagnoses: {
      primary_icd10: "J168",
      secondary_icd10: [],
    },
    casemix: {
      inacbg_code: "J-4-16-III",
      severity: "III",
    },
    procedures: {
      procedure_type: "9396",
      special_codes: {},
    },
    financial_pre_submit: {
      billed_cost: 17187600,
      cbg_tariff: 17187600,
      special_tariffs: {},
    },
  };

  it("validates a compliant curated record", () => {
    const res = curatedRowSchema.safeParse(validRow);
    expect(res.success).toBe(true);
  });

  it("detects and rejects raw identifiers (FKL02, PSTV01)", () => {
    const forbiddenFKL02 = { ...validRow, FKL02: "12345678" };
    expect(detectForbiddenFields(forbiddenFKL02)?.code).toBe("RAW_IDENTIFIER_FORBIDDEN");

    const forbiddenPSTV01 = { ...validRow, PSTV01: "98765432" };
    expect(detectForbiddenFields(forbiddenPSTV01)?.code).toBe("RAW_IDENTIFIER_FORBIDDEN");
  });

  it("detects and rejects post-adjudication fields (FKL48, verified_cost)", () => {
    const forbiddenFKL48 = { ...validRow, FKL48: 15000000 };
    expect(detectForbiddenFields(forbiddenFKL48)?.code).toBe("POST_ADJUDICATION_FIELD_FORBIDDEN");

    const forbiddenCost = { ...validRow, verified_cost: 15000000 };
    expect(detectForbiddenFields(forbiddenCost)?.code).toBe("POST_ADJUDICATION_FIELD_FORBIDDEN");
  });

  it("rejects unsupported schema_version", () => {
    const wrongVersion = { ...validRow, schema_version: "v2-invalid" };
    const res = curatedRowSchema.safeParse(wrongVersion);
    expect(res.success).toBe(false);
  });

  it("rejects revision < 1", () => {
    const zeroRev = { ...validRow, source_revision: 0 };
    const res = curatedRowSchema.safeParse(zeroRev);
    expect(res.success).toBe(false);
  });

  it("rejects invalid date range (discharge before admission)", () => {
    const invalidDates = {
      ...validRow,
      episode: {
        ...validRow.episode,
        admission_date: "2026-10-25",
        discharge_date: "2026-10-20",
      },
    };
    const res = curatedRowSchema.safeParse(invalidDates);
    expect(res.success).toBe(false);
  });
});

describe("curated-import-v1: Canonical Checksum Calculation", () => {
  it("produces deterministic canonical JSON independent of key ordering", () => {
    const obj1 = { b: 2, a: 1, c: { y: "bar", x: "foo" } };
    const obj2 = { a: 1, c: { x: "foo", y: "bar" }, b: 2 };

    expect(canonicalizeJson(obj1)).toBe(canonicalizeJson(obj2));
    expect(canonicalizeJson(obj1)).toBe('{"a":1,"b":2,"c":{"x":"foo","y":"bar"}}');
  });

  it("produces identical checksum for identical clinical payload", () => {
    const row1: any = {
      episode: { admission_date: "2026-10-20", discharge_date: "2026-10-24" },
      diagnoses: { primary_icd10: "J168", secondary_icd10: [] },
      casemix: { inacbg_code: "J-4-16-III" },
      procedures: { special_codes: {} },
      financial_pre_submit: { billed_cost: 17187600, special_tariffs: {} },
    };

    const row2: any = {
      financial_pre_submit: { special_tariffs: {}, billed_cost: 17187600 },
      procedures: { special_codes: {} },
      casemix: { inacbg_code: "J-4-16-III" },
      diagnoses: { secondary_icd10: [], primary_icd10: "J168" },
      episode: { discharge_date: "2026-10-24", admission_date: "2026-10-20" },
    };

    expect(computePayloadChecksum(row1)).toBe(computePayloadChecksum(row2));
  });
});
