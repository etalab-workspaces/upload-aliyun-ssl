# AGENTS.md

本文件为在本项目中工作的编码 Agent（人或 AI）提供协作指引。请在修改代码、提交或运行命令前先通读一遍。

## 1. 项目概述

**AliCloud SSL Uploader** —— 一个 Node.js + TypeScript 工具，将 `acme.sh` / `certbot` 等 acme 客户端生成的泛域名证书上传到阿里云 SSL 证书服务（CAS），并自动将证书绑定到一个或多个阿里云 CDN 域名上。

典型用法是作为 acme 客户端的 `--renew-hook`（acme.sh）或 deploy hook（certbot）调用入口脚本。

## 2. 技术栈

- 语言: TypeScript 5.5+（`strict: true`、`target: ESNext`、`module: NodeNext`）
- 模块系统: ESM（`"type": "module"`），引入使用 `.js` 后缀
- 运行时: Node.js 20+
- 包管理: 仓库内已生成 `pnpm-lock.yaml`，建议使用 `pnpm`；`npm install` 也能跑
- 主要依赖:
  - `@alicloud/cas20200407` —— 阿里云 SSL 证书服务 SDK
  - `@alicloud/cdn20180510` —— 阿里云 CDN SDK
  - `@alicloud/openapi-client` —— 阿里云 openapi 客户端基类
  - `dotenv` —— 加载 `.env`
  - `yaml` —— 解析 YAML 配置
  - `zod` —— 配置项运行时校验
  - `@biomejs/biome` —— 格式化 + lint（原 ESLint + Prettier，已移除）

## 3. 目录结构

```
.
├── src/                       # 源码（唯一的输入目录）
│   ├── index.ts               # 入口：读证书 → CAS 上传 → CDN 绑定
│   ├── Config.ts              # 加载 config.yml + .env，并用 zod 校验
│   ├── Cas.ts                 # 阿里云 CAS 客户端封装
│   └── CDN.ts                 # 阿里云 CDN 客户端封装
├── dist/                      # tsc 编译产物（已 gitignore）
├── types/                     # .d.ts 声明文件产物（已 gitignore）
├── tsconfig.json              # 基础配置
├── tsconfig.development.json  # 开发模式（sourceMap + 增量编译）
├── tsconfig.production.json   # 生产构建（产出 .d.ts）
├── biome.json                 # Biome 配置（格式化 + lint + import 排序）
├── .editorconfig
├── config.yml.example         # 业务配置样例
├── .env.example               # 凭据样例
└── README.md                  # 用户使用文档
```

## 4. 常用命令

| 用途 | 命令 |
| --- | --- |
| 安装依赖 | `pnpm install` / `npm install` |
| 启动监听式开发编译 | `pnpm dev` |
| 生产构建（含 .d.ts） | `pnpm build` |
| Lint（Biome 检查） | `pnpm lint` |
| Lint 自动修复 | `pnpm lint:fix` |
| 仅格式化 | `pnpm format` |
| 单测 | `pnpm test` / `pnpm test:watch` |

构建产物位于 `dist/index.js`，生产环境通过 `node dist/index.js` 运行。

## 5. 配置文件

### 5.1 `.env`（**不要提交**）

```
ACCESS_KEY_ID=""
ACCESS_KEY_SECRET=""
```

由 `src/Config.ts` 通过 `import "dotenv/config"` 加载。值来自阿里云 RAM 控制台生成的 AccessKey，必须对 RAM 用户授予：

- **管理云盾证书服务（CAS）** 的权限
- **管理 CDN** 的权限

### 5.2 `config.yml`（**不要提交**）

从 `config.yml.example` 复制：

```yaml
certFilePath: /path/to/certfile
keyFilePath: /path/to/keyfile
cdnDomainNames:
  - www.example1.com
  - www.example2.com
```

读取时使用相对路径基准 `new URL("../config.yml", import.meta.url)`，即默认从**项目根目录**解析。

### 5.3 配置校验

`Config.parseConfig()` 用 `zod` 严格校验 `accessKeyId`、`accessKeySecret`、`certFilePath`、`keyFilePath`、`cdnDomainNames: string[]` 任一字段缺失或类型不匹配都会抛错，必须先修好再继续。

## 6. 源码约定

- **入口顺序**（见 `src/index.ts`）：
  1. 读取 `config.yml` + `.env`
  2. 同步读 `cert`/`key` 文件（`fs.readFileSync`，`utf-8`）
  3. 证书名格式：`cert-${Date.now()}`，避免重名
  4. 先 `Cas.uploadUserCertificate`，再 `CDN.batchSetCdnDomainServerCertificate`
  5. 失败立即抛错，不静默吞掉
- **模块导入**：ESM 模式下 TypeScript 编译保留 `.js` 后缀（`./Cas.js`），新增模块遵循同一惯例。
- **SDK 使用**：所有阿里云 SDK 客户端在构造函数内 `new openApi.Config(...)` 并设置 `endpoint`（`cas.aliyuncs.com` / `cdn.aliyuncs.com`），不要把凭据落地到全局变量。
- **错误处理**：当前实现不捕获异常，让顶层 `node` 进程以非零退出码结束，便于在 acme.sh hook 中识别失败。**不要**为追求「不阻塞」吞掉 SDK 错误。
- **副作用**：`CDN.batchSetCdnDomainServerCertificate` 会对列表里所有域名一次性绑定证书，调用前要确认 `cdnDomainNames` 与目标环境一致，避免误把证书应用到错误域名。

## 7. 代码风格

- 缩进 2 空格、LF 行尾、UTF-8（见 `.editorconfig`）
- 工程工具已从 ESLint + Prettier 迁移到 **Biome**（`@biomejs/biome`），配置集中在 `biome.json`：
  - 格式化：`indentStyle: "space"`、`indentWidth: 2`、`lineWidth: 100`、`quoteStyle: "double"`、`semicolons: "always"`、`trailingCommas: "es5"`（等价于原 `.prettierrc`）
  - Lint：使用 `recommended` 预设规则集；`dist/`、`types/`、`coverage/` 已通过 `files.includes` 忽略，并遵循 `.gitignore`（`vcs.useIgnoreFile`）
  - 导入排序：`assist.actions.source.organizeImports` 开启，`pnpm lint:fix` 会一并整理
- 命令：`pnpm lint`（等价 `biome check`，CI 可用 `biome ci`）、`pnpm lint:fix`、`pnpm format`
- VS Code 推荐扩展：`editorconfig.editorconfig`、`biomejs.biome`

修改代码前请保证 `pnpm lint` 与 `pnpm build` 均无错误。

## 8. 测试

- 测试运行器：Node 内置 `node:test`（`node --enable-source-maps --test dist/`），所以**测试源文件必须放在 `src/` 下并以 `.test.ts` 命名**，确保会被 `tsconfig.production.json` 排除后由构建产物运行。
- 编写 SDK 调用相关用例请 mock `@alicloud/cas20200407` / `@alicloud/cdn20180510`，避免在 CI 中真实调用阿里云 API。
- 新增功能应同时补充最小用例；纯配置类的改动（如 `Config.ts`）建议加 schema 校验用例。

## 9. 提交与分支

- 使用 **Conventional Commits**（`commitizen` / `cz-conventional-changelog` 已移除，直接用 `git commit` 撰写规范信息）。
- 提交信息示例：`feat: support multiple CDN domain batch update`、`fix: handle missing cert file`。
- 直接修改 `main` 不被允许，所有变更走 PR / 特性分支。

## 10. 敏感数据与发布

以下文件/目录**不得**提交：

- `.env`、`config.yml`（实际值，含真实凭据和域名）
- `node_modules/`、`dist/`、`types/`、`coverage/`、`tmp/`
- 编辑器目录：`.vscode/*`（保留 `extensions.json`）

发布产物由 `package.json` 的 `files` 字段限定为 `["dist", "types"]`。修改发布边界前请确认 README 与示例仍可对齐。

## 11. 文档维护

- `README.md` 面向最终使用者，重点描述使用流程与权限申请步骤，**不要**在此文件里写开发细节。
- 内部架构、命令、约定 → 写入本 `AGENTS.md`。

---

如发现本文件与实际项目状态不一致（例如新增了构建脚本、新的 SDK 封装或新的配置项），请同步更新 `AGENTS.md`，保持文档先行于实现。