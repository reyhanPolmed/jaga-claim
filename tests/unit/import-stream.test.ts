import { describe, expect, it } from "vitest";
import { previewCuratedJsonlStream } from "../../src/lib/services/import-service";

function stream(bytes: Uint8Array) {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
}

describe("curated import stream boundaries", () => {
  it("rejects invalid UTF-8", async () => {
    await expect(previewCuratedJsonlStream(stream(Uint8Array.from([0xc3, 0x28])), "bad.jsonl"))
      .rejects.toMatchObject({ code: "INVALID_UTF8", status: 400 });
  });

  it("rejects bytes above the configured limit before parsing", async () => {
    await expect(previewCuratedJsonlStream(stream(new TextEncoder().encode("{}")), "large.jsonl", {
      maxBytes: 1,
      maxLines: 10,
    })).rejects.toMatchObject({ code: "FILE_TOO_LARGE", status: 413 });
  });

  it("rejects line counts above the configured limit", async () => {
    await expect(previewCuratedJsonlStream(stream(new TextEncoder().encode("{}\n{}")), "many.jsonl", {
      maxBytes: 100,
      maxLines: 1,
    })).rejects.toMatchObject({ code: "TOO_MANY_LINES", status: 413 });
  });
});
