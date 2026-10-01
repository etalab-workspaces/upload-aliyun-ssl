/**
 * `config.yml` 的加载与校验：`ConfigSchema`（zod schema）是字段形状
 * 的唯一来源；`loadConfig` 负责从项目根目录读 `config.yml` 并跑校验，
 * 失败时抛 `ZodError`，错误路径在 `issues[].path`。
 */
import { YAML } from "bun";
import { z } from "zod";

/**
 * `config.yml` 的唯一校验来源。
 *
 * 证书与私钥路径收在 `pemFilePaths` 下，键名与 `PemReader` 内部的字面
 * 联合一致（`cert` / `key`），方便 `PemReader` 直接 `pemFilePaths[kind]`
 * 取路径。
 *
 * 导出给 `config.test.ts` 直接传 `unknown` 做断言（`loadConfig` 走真实
 * 文件 IO，不适合进单测）；业务代码一律用 {@link loadConfig}。
 */
export const ConfigSchema = z.object({
  pemFilePaths: z.object({
    cert: z.string().min(1, "不能为空"),
    key: z.string().min(1, "不能为空"),
  }),
  cdnDomainNames: z
    .array(z.string().min(1, "不能为空"))
    .min(1, "至少要配一个 CDN 加速域名")
    .refine(
      (domains) => new Set(domains).size === domains.length,
      "不能包含重复域名（重复项会被重复提交绑定）",
    ),
});

/** 通过校验后的配置。 */
type Config = z.infer<typeof ConfigSchema>;

/**
 * 从仓库根目录的 `config.yml` 加载并校验配置。
 *
 * 校验失败抛 `ZodError`；出错字段路径在 `error.issues[].path`（顶层字段是
 * 单元素数组，如 `["cdnDomainNames"]`；嵌套字段是路径数组，如
 * `["pemFilePaths", "cert"]`；数组下标作为 path 元素，如
 * `["cdnDomainNames", 1]`；整个输入类型不对时路径为空数组 `[]`）。
 */
export async function loadConfig(): Promise<Config> {
  const url = new URL("../config.yml", import.meta.url);
  return ConfigSchema.parse(YAML.parse(await Bun.file(url).text()));
}
