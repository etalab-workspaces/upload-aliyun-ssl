import { $ } from "bun";

/**
 * 预检 `aliyun` CLI 是否可用。
 *
 * 没有这步时，CLI 未安装会在第一个 API 调用处抛
 * `ShellError: Failed with exit code 127`（或 Bun 自己的
 * `command not found`），acme.sh 用户看不出到底缺什么。
 */
export async function ensureAliyunCli(): Promise<void> {
  const probe = await $`aliyun version`.nothrow().quiet();
  if (probe.exitCode === 0) return;

  throw new Error(
    [
      `aliyun CLI 不可用（\`aliyun version\` 退出码 ${probe.exitCode}）。`,
      "请先安装并完成 `aliyun configure`：https://help.aliyun.com/zh/cli",
    ].join(""),
  );
}
