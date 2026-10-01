/**
 * PEM 文件读取器：从 `config.yml` 给出的路径读出证书 / 私钥文本，保留
 * 原始换行（CAS 要求 PEM 文本原样上传）。只做"文件存在 / 非空"两项与
 * IO 相关的检查；acme.sh 生成的 PEM 默认是完整且标签正确的，不再做内容
 * 校验——如有异常，aliyun CLI 会拒收并给出更权威的报错。
 */
export class PemReader {
  constructor(private readonly pemFilePaths: Record<"cert" | "key", string>) {}

  /** 读取并体检配置指定的证书与私钥，保留原始换行。 */
  async readPair(): Promise<{ cert: string; key: string }> {
    const [cert, key] = await Promise.all([
      this.read("cert"),
      this.read("key"),
    ]);
    return { cert, key };
  }

  /** 读取配置里该种类对应的 PEM 文件，做两项 IO 体检后返回原始文本。 */
  private async read(kind: "cert" | "key"): Promise<string> {
    const filePath = this.pemFilePaths[kind];
    const file = Bun.file(filePath);

    if (!(await file.exists())) {
      throw new Error(
        `${kind === "cert" ? "证书" : "私钥"}文件不存在：${filePath}`,
      );
    }

    const text = await file.text();
    if (text.trim() === "") {
      throw new Error(
        `${kind === "cert" ? "证书" : "私钥"}文件为空：${filePath}`,
      );
    }

    return text;
  }
}
