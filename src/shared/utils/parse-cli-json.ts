import type { z } from "zod";

/**
 * 把 CLI 的 stdout 按 schema 解析成对象。纯函数，便于单测。
 *
 * 不用 `.json()` 是因为它抛的 `SyntaxError` 不带任何上下文：CLI 的输出
 * 格式由 `~/.aliyun/config.json` 里的 `output` 字段决定（默认 `json`，
 * 也可设成 `text` / 表格），一旦不是 JSON，裸 `.json()` 只会给出一句
 * 难以定位的 "Unexpected token"。
 */
export function parseCliJson<T>(
  text: string,
  schema: z.ZodType<T>,
  api: string,
): T {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error(
      [
        `${api} 的响应不是合法 JSON。`,
        "aliyun CLI 的输出格式由 ~/.aliyun/config.json 的 output 字段决定（json / text / 表格），请确认它设为 json。",
        `原始输出（前 200 字符）：${text.slice(0, 200)}`,
      ].join("\n"),
    );
  }
  return schema.parse(raw);
}
