import { describe, expect, test } from "bun:test";
import { ZodError } from "zod";

import { ConfigSchema } from "../config.js";

/** 取第一个校验错误对应的字段路径，便于断言出错字段。 */
function issuePaths(raw: unknown): PropertyKey[][] {
  try {
    ConfigSchema.parse(raw);
  } catch (error) {
    if (error instanceof ZodError) {
      return error.issues.map((issue) => [...issue.path]);
    }
    throw error;
  }
  throw new Error("本该抛 ZodError");
}

const valid = {
  pemFilePaths: {
    cert: "/etc/letsencrypt/live/example.com/fullchain.pem",
    key: "/etc/letsencrypt/live/example.com/privkey.pem",
  },
  cdnDomainNames: ["www.example.com", "cdn.example.com"],
};

describe("ConfigSchema", () => {
  test("缺字段时报出该字段的路径", () => {
    expect(
      issuePaths({
        pemFilePaths: { key: "/k" },
        cdnDomainNames: ["a.com"],
      }),
    ).toEqual([["pemFilePaths", "cert"]]);
    expect(
      issuePaths({
        pemFilePaths: { cert: "/c" },
        cdnDomainNames: ["a.com"],
      }),
    ).toEqual([["pemFilePaths", "key"]]);
  });

  test("空字符串字段被拒绝", () => {
    expect(
      issuePaths({
        ...valid,
        pemFilePaths: { cert: "", key: valid.pemFilePaths.key },
      }),
    ).toEqual([["pemFilePaths", "cert"]]);
  });

  test("cdnDomainNames 为空数组被拒绝", () => {
    expect(issuePaths({ ...valid, cdnDomainNames: [] })).toEqual([
      ["cdnDomainNames"],
    ]);
  });

  test("cdnDomainNames 含重复域名被拒绝", () => {
    const paths = issuePaths({
      ...valid,
      cdnDomainNames: ["www.example.com", "www.example.com"],
    });
    expect(paths).toEqual([["cdnDomainNames"]]);
  });

  test("非对象输入被拒绝（错误挂在根路径 []）", () => {
    expect(issuePaths("- just\n- a\n- list\n")).toEqual([[]]);
    expect(issuePaths(null)).toEqual([[]]);
    expect(issuePaths("just a string")).toEqual([[]]);
  });
});
