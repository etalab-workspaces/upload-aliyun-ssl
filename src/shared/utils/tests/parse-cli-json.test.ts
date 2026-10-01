import { describe, expect, test } from "bun:test";
import { z } from "zod";

import { parseCliJson } from "../parse-cli-json.js";

const Schema = z.object({ CertId: z.number().int() });

describe("parseCliJson", () => {
  test("合法 JSON 按 schema 解析", () => {
    expect(parseCliJson('{"CertId":12345}', Schema, "Test")).toEqual({
      CertId: 12345,
    });
  });

  test("非 JSON 输出时给出可操作的报错，而不是 SyntaxError", () => {
    const text = "输出格式已切到 text 模式\nsome text output";
    expect(() => parseCliJson(text, Schema, "UploadUserCertificate")).toThrow(
      /UploadUserCertificate 的响应不是合法 JSON/,
    );
    expect(() => parseCliJson(text, Schema, "UploadUserCertificate")).toThrow(
      /output 字段/,
    );
  });

  test("空响应同样报“不是合法 JSON”", () => {
    expect(() => parseCliJson("", Schema, "Test")).toThrow(/不是合法 JSON/);
  });

  test("报错里只截取前 200 字符，避免把证书内容刷屏", () => {
    const text = `${"x".repeat(300)}TAIL_MARKER`;
    try {
      parseCliJson(text, Schema, "Test");
      throw new Error("本该抛错");
    } catch (error) {
      const message = (error as Error).message;
      expect(message).toContain("x".repeat(200));
      expect(message).not.toContain("TAIL_MARKER");
    }
  });

  test("JSON 合法但字段缺失时抛 ZodError", () => {
    expect(() => parseCliJson('{"RequestId":"x"}', Schema, "Test")).toThrow();
  });
});
