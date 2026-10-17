# npm 发布

包名：`@zpowertech/audio-player`，公开发布至 `https://registry.npmjs.org/`。
源码仓库：`zpowertech/audio-player`。使用 Node.js 24、npm 和固定版本的 Changesets CLI。

## 发布工作流

沿用 `antd-overlay` 的 Changesets → 版本 PR → GitHub Actions → npm Trusted Publishing 流程，保留本仓库的 npm 工具链与 Chrome 验证。

`.github/workflows/release.yml` 在 `main` 更新时运行，也可从 `main` 手动触发：

1. `prepare` 只具备源码读取权限，使用 Node.js 24、Rust 1.85.0 和 Chrome 执行完整 `npm run verify`。验证覆盖 Rust、Node、类型、tarball 独立安装、Vite / Webpack 和 Chrome。
2. 有待发布 changeset 时，`version` 创建或更新 `chore(release): 更新版本与变更日志` PR，同时更新版本、`CHANGELOG.md` 与 `package-lock.json`。该 job 使用 `fetch-depth: 0` 拉取完整提交历史，供 Changesets 查找 changeset 的来源提交，避免在 `persist-credentials: false` 下补拉历史时触发 Git 认证错误。
3. 没有 changeset 且当前版本尚未发布时，`prepare` 上传 Changesets 发布计划与 tarball，并逐字节核对它和 Chrome 已验证的安装包一致。
4. `publish` 在 `npm` 环境中使用 OIDC 发布准备好的 tarball，然后创建 Git Tag 与 GitHub Release。此 job 跳过安装脚本，不构建源码；只有它具备 `id-token: write`。

发布任务串行执行，验证失败不会发布。没有 changeset 且当前版本已存在于 npm 时，不会重复发布。首版沿用已有的 `0.1.0`，后续版本由 Changesets 管理。

## 仓库与 npm 配置

- GitHub `Settings → Actions → General`：允许 Actions 创建 PR，默认 workflow 权限保持只读。
- GitHub Environment `npm`：只允许 `main` 分支部署。
- npm 包 `Settings → Trusted publishing`：配置下表对应的 GitHub Actions。

| 字段 | 值 |
| --- | --- |
| Organization or user | `zpowertech` |
| Repository | `audio-player` |
| Workflow filename | `release.yml` |
| Environment name | `npm` |
| Allowed actions | 允许 `npm publish` |

也可在已登录 npm 的终端执行：

```sh
npm trust github @zpowertech/audio-player --repo=zpowertech/audio-player --file=release.yml --env=npm --allow-publish
```

首次创建包时，由具有 `@zpowertech` 发布权限的账号完成引导：

1. 在临时目录准备同名包，使用独立的 `0.0.0-bootstrap` 版本，通过 `npm stage publish <bootstrap-dir> --access public --tag bootstrap` 建立包记录。该版本只暂存，不批准发布；npm 会为新包生成 `0.0.0-stage` 占位版本。
2. 绑定 Trusted Publisher，保留引导暂存记录，直到正式版本成功发布。
3. 由 GitHub Actions 发布仓库中的正式版本 `0.1.0`，验证注册表和安装结果。
4. 正式版本存在后，用 `npm stage reject <stage-id>` 撤销引导暂存记录。npm 会要求 2FA 确认。

不要直接暂存待发布的正式版本，否则 Actions 会收到 `E409: Cannot publish over previously staged version`。也不要在首版发布前清空唯一的暂存记录：本次接入中，这会使新包无法查询且 OIDC 换取凭据失败。占位或暂存版本不代表首版已发布。

Trusted Publisher 新建后需在 2 天内完成首次成功发布。不需要向 GitHub Secrets 添加 `NPM_TOKEN` 或 `NODE_AUTH_TOKEN`。GitHub 仓库当前为私有仓库；OIDC 可用于发布公开 npm 包，但 npm 不为私有仓库生成 provenance 证明，因此工作流不强制传入 `--provenance`。

## 后续发布

1. 完成功能或修复后执行 `npm run changeset`，选择版本类型并填写中文变更说明。
2. 将 changeset 与代码一起提交并合入 `main`；等待 `Release` 创建版本 PR。
3. 检查版本号、变更日志与 lockfile，通过 CI 后合并版本 PR。若 GitHub 要求批准机器人 PR 的 workflow，维护者需先批准执行。
4. 合并后 `Release` 自动验证和发布；无需手动改版本、推送标签或在本地执行 `npm publish`。

纯文档、测试或 CI 修改无需新增版本 changeset。

发布失败时先查看日志。npm 尚未发布成功，可在原运行中选择 **Re-run failed jobs**；不要仅为重试修改版本号。若 npm 已成功而 Git Tag 或 GitHub Release 创建失败，先核对 npm 版本与来源，再补齐 GitHub 记录。也可在 `main` 手动运行 `Release`，重新计算待发布版本。

发布后分别确认 Actions 成功、npm 注册表中的版本和 `dist-tags`，再从 npm 安装验证导出与产物。`npm pack` 或本地验证成功不代表 npm 发布成功。

参考：[Changesets 自动发布](https://changesets.dev/guide/automating)、[npm Trusted Publishing](https://docs.npmjs.com/trusted-publishers/)、[npm staged publishing](https://docs.npmjs.com/staged-publishing/)。
