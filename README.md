# Upload AliCloud SSL

将 acme.sh / certbot 等 acme 客户端签发的证书上传到阿里云数字证书管理服务（CAS），并自动绑定到一个或多个阿里云 CDN 加速域名。

实现方式：通过 [Bun](https://bun.com/) 调用本地安装的 [阿里云 CLI](https://help.aliyun.com/zh/cli)（≥ 3.3.0 的 kebab-case 插件版）。

## 前置条件

1. 安装 [Bun](https://bun.com/)（1.4+）。
1. 根据 [快速使用阿里云 CLI](https://help.aliyun.com/zh/cli/quickly-start-using-alibaba-cloud-cli) 安装阿里云 CLI 并且配置身份凭证

## 使用流程

1. 安装阿里云 CLI（≥ 3.3.0）：

   ```bash
   # Linux/macOS 一键安装
   curl -fsSL https://aliyuncli.alicdn.com/install.sh | bash
   ```

   验证：

   ```bash
   aliyun --version
   ```

1. 在 https://ram.console.aliyun.com/users 创建 RAM 用户，对其授权：
   - **管理云盾证书服务（CAS）**：`AliyunYundunCertFullAccess`（或等价自定义策略）
   - **管理 CDN**：`AliyunCDNFullAccess`（或等价自定义策略）

   创建 AccessKey，记录 `AccessKey ID` 与 `AccessKey Secret`。

1. 在本地配置阿里云 CLI 凭证：

   ```bash
   aliyun configure
   # 依次输入 AccessKey ID、AccessKey Secret、默认 Region（cn-hangzhou）
   ```

1. 安装本项目依赖：

   ```bash
   bun install
   ```

1. 复制样例配置文件，按需修改：

   ```bash
   cp config.yml.example config.yml
   ```

   `config.yml` 内容示例：

   ```yaml
   pemFilePaths:
     cert: /etc/letsencrypt/live/example.com/fullchain.pem
     key: /etc/letsencrypt/live/example.com/privkey.pem
   cdnDomainNames:
     - www.example.com
     - cdn.example.com
   ```

   必填：`pemFilePaths`（cert / key 两个子字段）、`cdnDomainNames`。

1. 运行上传：

   ```bash
   bun start
   # 等价于 bun run src/index.ts
   ```

   脚本会：
   - 调用 `aliyun cas upload-user-certificate` 把证书上传到 CAS
   - 从响应中拿到 `CertId`，逐个域名调用
     `aliyun cdn set-cdn-domain-ssl-certificate` 绑定 CDN HTTPS

   任何一步失败会以非零状态码退出。

### 清理过期证书

每次续期都会在 CAS 里新增一张上传证书。脚本本身不做清理——一年自动签发下来的证书数量有限，积几年到控制台或 `aliyun cas list-certificates` 里手动挑过期 + 未在用的删即可。动手前先确认 `UsingProductList` 为空、CDN 反查返回的 `CertId` 集合里没有它。

### 在 acme.sh 中接入

在 acme.sh 的 `--renew-hook` 脚本中调用本项目即可，例如：

```sh
#!/usr/bin/env bash
set -e
cd /path/to/upload-aliyun-ssl
bun start
```

在签发/续期证书时通过 `--renew-hook "/path/to/your-hook.sh"` 注册。

## 常用脚本

| 命令            | 作用                                     |
| --------------- | ---------------------------------------- |
| `bun start`     | 运行 `src/index.ts`                      |
| `bun run check` | Biome lint + format 检查                 |
| `bun test`      | 跑单测（只覆盖纯逻辑，不需要阿里云凭据） |

## 依赖

- [Bun](https://bun.com/) ≥ 1.4：内置 TypeScript / 测试运行器 / 子进程管理
- [阿里云 CLI](https://help.aliyun.com/zh/cli) ≥ 3.3.0：实际调用阿里云 OpenAPI
- [zod](https://zod.dev/)：校验 `config.yml` 与 CLI 响应
- `config.yml` 解析用 Bun 内置的 `Bun.YAML`，无需额外依赖
