import { loadConfig } from "./config.js";
import { PemReader } from "./PemReader.js";
import { setCdnDomainSSLCertificate } from "./set-cdn-ssl-cert.js";
import { ensureAliyunCli } from "./shared/utils/index.js";
import { uploadUserCertificate } from "./upload-pem.js";

/**
 * acme.sh / certbot 的 deploy hook 入口。
 * 任一步骤失败立即抛错，由 Bun 顶层以非零退出码结束，便于 acme.sh
 * `--renew-hook` 中识别失败。
 */

// 1. 预检 aliyun CLI 是否可用（不可用时后续报错很难懂，先在这里拦掉）
await ensureAliyunCli();

// 2. 加载 config.yml（loadConfig 已校验必填字段）
const config = await loadConfig();

// 3. 读证书与私钥（PemReader 校验存在 / 非空），保留原始换行
const { cert, key } = await new PemReader(config.pemFilePaths).readPair();

// 4. 生成 cert-${Date.now()} 作为唯一证书名
const certName = `cert-${Date.now()}`;

// 5. 调用 CAS upload-user-certificate 上传证书，从响应中拿到 CertId
const { CertId, RequestId: uploadRequestId } = await uploadUserCertificate({
  name: certName,
  cert,
  key,
});
console.log(
  `Uploaded certificate: ${certName} (CertId: ${CertId}, RequestId: ${uploadRequestId ?? "n/a"})`,
);

// 6. 遍历 cdnDomainNames，对每个域名单独调用 CDN set-cdn-domain-ssl-certificate
for (const domainName of config.cdnDomainNames) {
  const { RequestId } = await setCdnDomainSSLCertificate({
    domainName,
    certName,
    certId: CertId,
    certType: "cas",
    sslProtocol: "on",
  });
  console.log(
    `Applied certificate to CDN: ${domainName} (RequestId: ${RequestId ?? "n/a"})`,
  );
}
