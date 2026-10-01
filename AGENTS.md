# AGENTS.md

本文件为在本项目中工作的编码 Agent（人或 AI）提供协作指引。请在修改代码、提交或运行命令前先通读一遍。

## 1. 项目概述

**upload-aliyun-ssl** —— 通过 Bun 调用本地阿里云 CLI，把 acme.sh / certbot 等 acme 客户端签发的证书上传到阿里云 SSL 证书服务（CAS），并自动绑定到一个或多个 CDN 加速域名。

典型用法是作为 acme 客户端的 `--renew-hook`（acme.sh）或 deploy hook（certbot）调用入口脚本。

## 2. 技术栈

- 运行时: **Bun** ≥ 1.4（自带 TypeScript、子进程、子测试运行器）
- 包管理: `bun install` / `bun add`；不再使用 `npm` / `pnpm` / `yarn`
- 模块系统: ESM（`"type": "module"`），Bun 运行时无需编译即可直接运行 `.ts`
- Shell 调用: 直接用 Bun 内置的 `$` 模板字面量（`import { $ } from "bun"`），链式调用 `.text()` / `.json()` 等
- 主要依赖:
  - `zod` —— `src/config.ts` 里的 `ConfigSchema` 单一来源，承担 3 字段的 `config.yml` 校验与 TS 类型推导；调用方通过 `ZodError.issues[].path` 拿到出错字段路径
  - `yaml` 由 Bun ≥ 1.2.21 内置的 `Bun.YAML.parse` 取代，**不**作为依赖安装
- devDep:
  - `@types/bun` —— TypeScript 类型提示
  - `typescript` —— `bun run typecheck` 调用，仅走 `tsc` 类型检查（`tsconfig.json` 的 `noEmit: true` 保证不发产物）
  - `@biomejs/biome`（钉死版本，无 caret）—— 唯一格式化和 lint 工具；CLI 走 `biome check` / `biome ci` / `biome format --write` / `biome lint`，npm scripts 包装在 §4
- 不再使用:
  - `@alicloud/cas20200407`、`@alicloud/cdn20180510`、`@alicloud/openapi-core` —— 全部改走 CLI
  - `dotenv`、`typescript` —— 由 Bun / 手写校验替代
  - `yaml` —— 由 `Bun.YAML.parse` / `import yaml from "./x.yml"` 替代
  - 手写的 `requireStringField` / `requireDomainList` —— 由 zod schema 取代；后续给配置加新字段时，**优先扩 `ConfigSchema`**，不要回退到手写校验

## 3. 目录结构

```
.
├── src/                   # 源码（唯一的输入目录）
│   ├── index.ts           # 入口：预检 CLI → 读证书 → CAS 上传 → CDN 绑定
│   ├── config.ts          # 加载 config.yml（loadConfig + ConfigSchema）
│   ├── PemReader.ts       # PemReader：读证书/私钥文件（IO）并做存在 / 非空检查
│   ├── upload-pem.ts      # uploadUserCertificate：调用 aliyun cas upload-user-certificate 上传证书
│   ├── set-cdn-ssl-cert.ts # setCdnDomainSSLCertificate：给加速域名绑定 SSL 证书
│   ├── shared/            # 跨模块共享的东西
│   │   └── utils/             # 跨模块函数
│   │       ├── index.ts           # barrel：再导出下面三项
│   │       ├── ensure-cli.ts      # ensureAliyunCli()：预检 aliyun CLI 可用性
│   │       └── parse-cli-json.ts  # parseCliJson()：按 zod schema 解析 CLI stdout
│   └── tests/             # 跨模块纯逻辑单测（bun test 自动发现 *.test.ts）
│       ├── parse-cli-json.test.ts  # parseCliJson
│       └── config.test.ts     # ConfigSchema
├── config.yml.example     # 业务配置样例
├── README.md              # 用户使用文档
└── AGENTS.md              # 协作指引（本文件）
```

## 4. 常用命令

| 用途 | 命令 |
| --- | --- |
| 安装依赖 | `bun install` |
| 上传证书 | `bun start`（等价 `bun run src/index.ts`） |
| 单测 | `bun test` / `bun test --watch` |
| lint + format 检查 | `bun run check`（等价 `biome check`，CI 里改成 `biome ci`） |
| 仅 lint | `bun run lint`（等价 `biome lint`） |
| 自动修复格式 + 简单 lint | `bun run format`（等价 `biome format --write`；等价还有 `biome check --write`，会跑 import 排序） |
| 类型检查 | `bun run typecheck`（等价 `tsc`） |

无需 `pnpm build` 等步骤——Bun 直接执行 `.ts`。`tsc` 只走校验路径（`tsconfig.json` 里 `noEmit: true`），不发产物。lint / format 走 Biome（见 §4）。

## 5. 配置文件

### 5.1 `aliyun configure`（推荐）

```bash
aliyun configure --profile <name>   # 可选：写入独立 profile
```

凭据落到 `~/.aliyun/config.json`，与本项目解耦。

### 5.2 `config.yml`（**不要提交**）

从 `config.yml.example` 复制：

```yaml
pemFilePaths:
  cert: /path/to/certfile
  key: /path/to/keyfile
cdnDomainNames:
  - www.example1.com
  - www.example2.com
```

读取时使用相对路径基准 `new URL("../config.yml", import.meta.url)`，即默认从**项目根目录**解析。

### 5.3 配置校验

`src/config.ts` 对外暴露 `loadConfig()`，并把 `ConfigSchema`（zod schema）与 `Config`（`z.infer` 出的类型）一起 `export` 供 `config.test.ts` 直接传 `unknown` 做断言；业务代码一律走 `loadConfig()`，不要自己 `import ConfigSchema` 解析别的文件。校验失败抛 `ZodError`，出错字段路径在 `error.issues[].path`（顶层字段为单元素数组，如 `["cdnDomainNames"]`；嵌套字段是路径数组，如 `["pemFilePaths", "cert"]`；数组下标作为 path 元素，如 `["cdnDomainNames", 1]`；整个输入类型不对时路径为空数组 `[]`）。

新增配置字段时同步更新 `config.yml.example`、README 与 `config.test.ts`。

## 6. 源码约定

- **入口顺序**（见 `src/index.ts`）：
  1. `ensureAliyunCli()` → 预检 `aliyun version`，CLI 缺失/未配置时直接给可操作报错
  2. `loadConfig()` → 校验 `config.yml`
  3. `new PemReader(config.pemFilePaths).readPair()` → 读 `cert`/`key`，检查存在 / 非空
  4. 证书名格式：`cert-${Date.now()}`，避免重名
  5. `uploadUserCertificate({ name, cert, key })` → 从响应中取 `CertId`
  6. `for (domainName of cdnDomainNames)` 循环调用 `setCdnDomainSSLCertificate({ domainName, certName, certId, certType: "cas", sslProtocol: "on" })`
  7. 失败立即抛错，由 Bun 以非零退出码结束

  每次 CLI 调用都会把 `RequestId` 打进日志，acme.sh hook 失败时可直接拿它找阿里云工单。

- **⚠️ Bun Shell 模板字面量是「脚本」，换行 = 命令分隔符。** `$` 内部按 shell 脚本解析，`a\n--flag v` 会被当成两条命令（第二条报 `command not found: --flag`）。多行命令**必须**用反斜杠续行：

  ```ts
  // ✅ 正确：反斜杠续行
  await $`aliyun cas list-certificates \
    --show-size ${PAGE_SIZE}`.json();

  // ❌ 错误：换行被当成新命令，只有第一条 `aliyun cas list-certificates` 会执行
  await $`aliyun cas list-certificates
    --show-size ${PAGE_SIZE}`.json();
  ```

  纯靠 `biome check` / `tsc` / 单测都拦不住这类错误（`echo a⏎echo b` 与 `echo a; echo b` 输出完全一致）。改完 shell 调用后，用 stub 掉 `aliyun` 的脚本跑一次看 argv。

- **不要为 `aliyun` 调用加 wrapper / mock**：Bun Shell 的 `$` 是编译期模板字面量，`mock.module("bun")` 拦不住，硬包一层纯函数只为测试反而是给将来挖雷。CAS / CDN 都是几行的薄函数，行为正确与否取决于 `aliyun` 二进制本身，CI 里没法在没有凭据时验证——直接在 README 告诉用户怎么实跑即可。改写命令结构时可以用 `--cli-dry-run` 验证参数名（无需凭据、不发请求），或用 stub 脚本打印 argv。

- **CLI 响应一律过 zod，不要裸 `as` 断言。** `ShellPromise.json()` 的签名是 `Promise<any>`，`response as SomeType` 没有任何检查保护；而且 CLI 输出格式受 `~/.aliyun/config.json` 里的 `output` 字段影响（非 JSON 时 `.json()` 只会抛一句 `Unexpected token`）。因此统一走 `parseCliJson(text, schema, api)`（`shared/utils/parse-cli-json.ts`）：先 `.text()` 拿原文，再解析 + 校验，报错里带上是哪个 API、截断到 200 字符的原始输出。已接入：CAS 上传/列表、CDN 绑定/查询。
- **CLI 枚举值大小写不统一，且 `--cli-dry-run` 不校验枚举**：`list-user-certificate-order --status` 用大写 `EXPIRED`，`list-certificates --certificate-status` 用小写 `expired`。传错值 dry-run 照样 exit 0，只有真实调用才报错。
- **CLI 命令固定为 kebab-case 插件版**（CLI ≥ 3.3.0 推荐写法）：
  - `aliyun cas upload-user-certificate --name ... --cert ... --key ...`
  - `aliyun cdn set-cdn-domain-ssl-certificate --domain-name ... --cert-name ... --cert-id ... --cert-type cas --ssl-protocol on`
  - 每个 `${...}` 插值都按字面量字符串传入，PEM 内容里的换行、`=`、引号不会被 shell 再解析（参见 aliyun/aliyun-cli#1232；v3.0.275 起 `--cert "PEM"` 不再需要等号语法）
- **`--region` 是 CLI 的 Global Parameter，不是 API 参数**：脚本不传，CLI 默认从 `~/.aliyun/config.json` 的 `defaultRegion` 拿；硬写死 region 反而会锁住多 region 用户。同一份脚本对 CAS 上传 == LIST / 删除、CDN 绑定 / 查询全都成立。
- **不要为 `aliyun` 调用加 wrapper / mock**：Bun Shell 的 `$` 是编译期模板字面量，`mock.module("bun")` 拦不住，硬包一层纯函数只为测试反而是给将来挖雷。这里 CAS / CDN 都是几行的薄函数，行为正确与否取决于 `aliyun` 二进制本身，CI 里没法在没有凭据时验证——直接在 README 告诉用户怎么实跑即可。
- **不要手写 YAML 解析**：Bun ≥ 1.2.21 自带 `Bun.YAML.parse`，也可以直接 `import config from "./config.yml"`。`yaml` 第三方依赖完全没有存在的必要。
- **不要 `import { readFileSync } from "node:fs"`**：Bun 原生 `Bun.file(path).text()` 在 Linux 上能走 sendfile / splice，比 Node fs 快；项目里所有读文件场景（`config.yml` / cert / key）都走它。
- **`fileURLToPath(import.meta.url)` 这一步通常是多余的。** `Bun.file()` 直接吃 `file://` URL，做读文件这种 IO 场景时不需要先把 URL 折回字符串：

  ```ts
  // 多此一举
  const path = fileURLToPath(new URL("../config.yml", import.meta.url));
  await Bun.file(path).text();

  // 一行
  const url = new URL("../config.yml", import.meta.url);
  await Bun.file(url).text();
  ```

  URL 永远是 `/`，`Bun.file` 内部处理 Windows 路径转换，比 `${import.meta.dir}/../x` 的模板拼接更可推。

- **但 `node:path` 不要无脑砍。** Bun 没有把 path 工具暴露到 `Bun.path` 命名空间，但其自家文档明确建议 "`Use the 'path' module to manipulate paths`"。`node:path` 的 `join` / `dirname` / `basename` / `resolve` 在 Bun 内部用 Rust 重写，比 Node 还快约 3×——做不带 IO 的路径运算时仍然是首选：

  ```ts
  import { join, dirname, basename } from "node:path";
  ```

  判定标准：如果这个路径最终是要喂给 `Bun.file()` / `fetch()` 这类接受 URL 的 API，优先 `new URL(...)`；否则照常用 `node:path`。
- **错误处理**：不捕获异常，让顶层 `bun` 进程以非零退出码结束，便于 acme.sh hook 中识别失败。Bun Shell 自带的 `ShellError` 已经把 `exitCode` / `stdout` / `stderr` 透出。
- **PEM 处理只做 IO 体检**：acme.sh 生成的 PEM 默认是完整且标签正确的，不再做内容校验——如有异常，aliyun CLI 会拒收并给出更权威的报错。`PemReader`（`src/PemReader.ts`）只负责"文件存在 / 非空"两项 IO 检查。`pemFilePaths` 的子键 `cert` / `key` 是 `PemReader` 构造参数 `Record<"cert" | "key", string>` 的同一字面联合，加新种类要同步改 `config.ts` 的 schema 和 `PemReader.ts` 的 `Record<...>`。
- **`setCdnDomainSSLCertificate` 单次只绑定一个域名**；`src/index.ts` 用 `for` 循环逐个提交，任一域名失败都会中断后续域名。调用前要确认 `cdnDomainNames` 与目标环境一致，避免误把证书应用到错误域名。
- **过期证书不在脚本里清理**：acme.sh 一年自动签下来的证书数量有限，脚本只负责"上传 + 绑定"两件事，过期证书由运维积一阵手动去 CAS 控制台或 `aliyun cas list-certificates` 里挑——避免删除逻辑里出 bug 误删在用证书打掉线上 HTTPS。

- **⚠️ 阿里云 CLI 的 schema（`--help --cli-section response`）不一定等于真实响应。** 一处已踩坑：`describe-domain-certificate-info` 的 `CertInfos` 在 schema 里是 array，真实响应是包装对象 `{"CertInfo": [...]}`。

  改完解析后拿真实 `aliyun` 输出跑一遍，别只信 schema。

## 7. 代码风格

- 缩进 2 空格、LF 行尾、UTF-8（见 `.editorconfig`）
- 唯一 lint / format 工具：Biome v2（`biome.json`）。不允许另起 ESLint / Prettier 配置；提交前本地下跑一遍 `bun run check`，CI 走 `biome ci`。
- import 排序：`biome check --write` 会按 alphabetical 把 external 与本地分组、组内重排。不要把 reorder 拆到独立 commit 里。
- 模块导入：ESM + Bun，导入本地模块不带 `.js` 后缀也可以，Bun 会自动解析 `.ts`。**新增模块仍带 `.js` 后缀**，与编译后形态保持一致，便于以后用 `bun build --target=node` 输出跨运行时产物。

## 8. 测试

- 测试运行器：内置 `bun test`，**测试源文件以 `.test.ts` 命名**，**统一就近放在待测试代码所在目录的 `tests/` 子目录里**：例如 `src/shared/utils/parse-cli-json.ts` → `src/shared/utils/tests/parse-cli-json.test.ts`；对顶层单一文件（如 `src/config.ts`），其 `tests/` 子目录就是 `src/tests/`，即 `src/tests/config.test.ts`。不要在 `src/tests/` 下堆与多模块耦合的「跨模块测试目录」——任何模块的测试都应该就近放在自己的 `tests/` 里。测试用相对路径引用源码（`import { x } from "../xxx.js"`）。
- **只对纯逻辑写测试**：`loadConfig`、`PemReader` 的 `read` / `readPair`（带 IO）、以及所有走 `aliyun` 二进制的封装（`uploadUserCertificate` / `setCdnDomainSSLCertificate`）都不做单测。策略性逻辑要尽量写得像纯函数（输入→输出）以便覆盖，比如 `parseCliJson`。
- **不要对 CLI 封装函数写 mock 单测**：Bun Shell 的 `$` 是编译期模板字面量，没法用 `mock.module("bun")` 拦截；强行抽一层 wrapper 只为 spy 是过度工程。CAS / CDN 调用直接走真实路径，靠 README + 用户实跑验收；命令结构改动用 stub 脚本 + `--cli-dry-run` 人工验证。

## 9. 提交与分支

- 使用 **Conventional Commits**，例如：
  - `feat: switch to aliyun CLI for cert upload`
  - `refactor: replace alicloud SDKs with bun shell`
- 直接修改 `main` 不被允许，所有变更走 PR / 特性分支。

## 10. 敏感数据与发布

以下文件/目录**不得**提交：

- `config.yml`（实际值，含真实凭据和域名）
- `node_modules/`、`.bun/`
- 编辑器目录：`.vscode/*`（保留 `extensions.json`）

本项目不发布 npm 包；如果后续要发布，由 `package.json` 的 `files` 字段限定。

## 11. 文档维护

- `README.md` 面向最终使用者，重点描述使用流程与权限申请步骤，**不要**在此文件里写开发细节。
- 内部架构、命令、约定 → 写入本 `AGENTS.md`。

---

如发现本文件与实际项目状态不一致（例如新增了构建脚本、新的 CLI 封装或新的配置项），请同步更新 `AGENTS.md`，保持文档先行于实现。