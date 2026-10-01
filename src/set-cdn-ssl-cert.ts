import { $ } from "bun";
import { z } from "zod";

import { parseCliJson } from "./shared/utils/index.js";

/**
 * `set-cdn-domain-ssl-certificate` 的响应。该接口成功时只回一个
 * `RequestId`，失败时 CLI 以非零退出码结束（错误信息进 `ShellError.stderr`）。
 */
const SetCdnCertResponseSchema = z.object({
  RequestId: z.string().optional(),
});

/**
 * 给 CDN 加速域名绑定 SSL 证书。CLI ≥ 3.3.0 的 kebab-case 子命令；
 * 当 `certType=cas` 时，`--cert-id` 必填（从
 * {@link import("./upload-pem.js").uploadUserCertificate} 返回的
 * `CertId` 取值），`--cert-name` 同步传入便于在控制台追溯。
 *
 * 该接口一次只接受一个域名（v9.x SDK 之后已移除批量版本），
 * `src/index.ts` 通过 `for...of` 循环逐个提交，任一失败即终止。
 *
 * Bun Shell 默认在子进程退出码非零时抛 `ShellError`，错误对象自带
 * `exitCode` / `stdout` / `stderr`，正好满足 acme.sh hook 失败识别需要。
 *
 * @see https://api.aliyun.com/api-tools/cli/Cdn/2018-05-10/SetCdnDomainSSLCertificate
 * @see https://api.aliyun.com/document/Cdn/2018-05-10/SetCdnDomainSSLCertificate
 */
export async function setCdnDomainSSLCertificate(args: {
  /** 要绑定证书的 CDN 加速域名。 */
  domainName: string;
  /** CAS 中的证书名，与上传时一致。 */
  certName: string;
  /** CAS 分配的数字证书 ID。 */
  certId: number;
  /** 证书来源：`cas` 表示从 CAS 拉取，`upload` 表示随请求上传。 */
  certType: "cas" | "upload";
  /** HTTPS 功能开关：`on` 启用、`off` 关闭。 */
  sslProtocol: "on" | "off";
}): Promise<{ RequestId?: string }> {
  const raw = await $`aliyun cdn set-cdn-domain-ssl-certificate \
    --domain-name ${args.domainName} \
    --cert-name ${args.certName} \
    --cert-id ${args.certId} \
    --cert-type ${args.certType} \
    --ssl-protocol ${args.sslProtocol}`.text();
  // 拿到 RequestId 供 acme.sh hook 失败时找阿里云工单，否则响应被完全丢弃
  return parseCliJson(
    raw,
    SetCdnCertResponseSchema,
    "SetCdnDomainSSLCertificate",
  );
}
