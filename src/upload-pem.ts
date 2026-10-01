import { $ } from "bun";
import { z } from "zod";

import { parseCliJson } from "./shared/utils/index.js";

/**
 * `upload-user-certificate` 的响应（API 字段保持 PascalCase）。
 */
const UploadCertResponseSchema = z.object({
  /** 阿里云为该证书分配的全局 ID，绑定 CDN 时必须使用。 */
  CertId: z.number().int(),
  RequestId: z.string().optional(),
});

/**
 * 通过 Bun Shell 调用 `aliyun cas upload-user-certificate`：CLI ≥ 3.3.0
 * 的 kebab-case 子命令；参数 `--name` / `--cert` / `--key` 与 API 字段对应。
 *
 * Bun Shell 把每个 `${...}` 插值都视作单个字面量字符串，PEM 内容里的换行、
 * `=`、引号都不会被再解析（参见 aliyun/aliyun-cli#1232，v3.0.275 起
 * `--cert "PEM"` 不再需要等号语法）。
 *
 * 响应通过 `parseCliJson` 走 zod schema 校验，而不是裸断言
 * `response as Foo`：`ShellPromise.json()` 签名是 `Promise<any>`，裸断言
 * 不受任何保护，CLI 输出格式受用户 `~/.aliyun/config.json` 里 `output`
 * 配置影响——一旦不是 JSON 或响应里没有 `CertId`，裸断言会把 `undefined`
 * 一路带到 CDN 绑定命令。
 *
 * @see https://api.aliyun.com/api-tools/cli/cas/2020-04-07/UploadUserCertificate
 * @see https://api.aliyun.com/document/cas/2020-04-07/UploadUserCertificate
 */
export async function uploadUserCertificate(args: {
  /** 自定义证书名，长度 ≤ 63，同一用户内不可重名。 */
  name: string;
  /** PEM 格式的证书内容，可包含换行。 */
  cert: string;
  /** PEM 格式的私钥内容，可包含换行。 */
  key: string;
}): Promise<z.infer<typeof UploadCertResponseSchema>> {
  const raw = await $`aliyun cas upload-user-certificate \
    --name ${args.name} \
    --cert ${args.cert} \
    --key ${args.key}`.text();
  return parseCliJson(raw, UploadCertResponseSchema, "UploadUserCertificate");
}
