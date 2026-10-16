# 验证范围与记录

日期：2026-10-16。所有音频均来自仓库测试样本，无远程解码服务。

## 当前验证策略

后续浏览器验证仅使用正式版 Chrome。核心播放、安装包和示例三套 Playwright 配置均只包含 `chrome` 项目，固定 `browserName: 'chromium'`、`channel: 'chrome'`；其中 `browserName` 是 Playwright 的引擎标识，实际启动本机 Chrome。

- 本地自动化使用隔离配置，不读取个人浏览器资料。
- Linux CI 执行完整 `npm run verify`，Windows CI 执行 Chrome 核心播放回归。
- 手工验收也在 Chrome 中进行。其他浏览器的旧结果保留在下方历史记录中，不作为当前回归结论。

## Chrome 回归结果

2026-10-16 在 macOS 27.0.1（Apple Silicon）、Chrome 155.0.8059.84 上执行 `npm run verify`，完整通过：

- 构建、24 项 Rust 测试、28 项 Node 测试、React 示例类型检查。
- tarball 独立安装、公开类型与导出检查，以及 Vite / Webpack 生产构建。
- Chrome：29 项核心播放、4 项安装包、2 项示例交互，共 35 项；普通页面和 React 示例截图均已生成。

格式样本结果与 README 的 Chrome 验证表一致。CI 配置已更新为仅 Chrome；本轮结果来自本地，Linux / Windows 云端执行结果需在推送后另行确认。

## 重现

开发环境使用 Node.js 24、npm 和 Rust 1.85.0。安装 Chrome 后运行：

```sh
npm ci
rustup toolchain install 1.85.0 --profile minimal --target wasm32-unknown-unknown
# 已安装 Chrome 时可跳过；Linux CI 使用 npx playwright install --with-deps chrome。
npx playwright install chrome
npm run verify
```

`verify` 包含构建、24 项 Rust 测试、28 项 Node 测试、React 示例类型检查、tarball 独立安装与 Vite / Webpack 构建，以及 Chrome 的 29 项核心、4 项安装包、2 项示例用例。只运行浏览器回归时，先完成 `npm run build` 和 `npm run test:package`，再执行 `npm run test:browser`。

手工验收先执行 `node scripts/test-server.mjs`，再用 Chrome 打开 `http://127.0.0.1:4280/test/browser/manual.html` 并逐项点击；结果保存到 `output/manual-results.json`。Playwright 的详细 JSON、日志、截图和失败 trace 保存在被 Git 忽略的 `output/` / `test-results/` 中。

## 历史记录：`play(url?: string)` 接口回归

以下为切换到仅 Chrome 验证之前的记录。该轮接口仅保留可选 URL 字符串，格式统一自动识别；移除公开的 `PlayOptions`、`startTime` 和 `format` 参数。示例、手工验收页和测试调用已同步迁移。

- 构建、28 项 Node 测试、React 示例类型检查通过。
- `npm run test:package` 通过：独立安装产物、类型检查、Vite / Webpack 生产构建正常；类型用例明确拒绝旧对象参数和第二个 options 参数。
- Chromium、WebKit 各 29 项核心用例通过，覆盖无参续播、相同 URL 保持进度、切换与重播、非法输入、SILK 后缀及无后缀 / Blob / data URL 自动识别。
- Chromium、WebKit 共 8 项安装包浏览器用例、4 项示例交互用例通过；React 示例验证不同消息即使 URL 相同也从头播放，并释放旧实例。
- Firefox 在启动阶段报 `Could not find profile folder`，使用临时隔离应用副本后仍复现，未进入测试页面。该轮未获得 Firefox 的核心、安装包及示例运行结果。

## 历史记录：初始 API

以下为接口简化前的原始验证记录，其中指定位置播放已从公开 API 移除。这些结果只适用于当时的代码和测试范围。

- Rust：24 项测试；完整和逐包解码保持 16 kHz、80,000 samples、5 秒，并与参考 PCM 逐样本相同。
- Node：28 项测试；三种头、网络分块、截断、损坏、结束标记、编译失败重试、缓存上限、SSR 和主入口导出。
- 浏览器核心：Chromium、Firefox、WebKit、Chrome、Edge 各 28 项，共 140 项，涵盖渐进首播、缓冲冻结与恢复、暂停续播、切换与取消、精确定位 PCM、初始化重试、自动播放错误、Blob/data URL 和真实格式文件。
- 安装包：在离线且 Rust 不可用的消费者项目中安装 `npm pack` 产物，检查导出、类型、无运行时依赖和无安装构建脚本。Vite / Webpack 5 的开发、生产和 `/nested/` 部署共 12 项浏览器用例。
- 示例：普通页面与 React 聊天列表在三引擎中共 6 项交互用例，并通过 React 示例类型检查。
- Safari：实际 Safari 27.0.1 点击独立验收页，完成 SILK/原生播放控制、无后缀回退和 8 种编码文件，共 11 项。原始结果见 [safari-verification.json](safari-verification.json)。

补充回归：断流时同时发布 `buffering` 状态与实际停止位置，避免 UI 在缓冲期间补跳上一帧的进度；三引擎各重复 3 次通过。

### 历史平台与结果范围

本地操作系统为 macOS 27.0.1（Apple Silicon）。自动化使用隔离浏览器配置，不读取个人资料。

| 浏览器 | 本地验证方式 |
| --- | --- |
| Chromium 156.0.8078.4 | Playwright headless shell |
| Firefox 157 | Playwright Firefox；使用隔离应用标识，避免系统 profile 冲突 |
| WebKit | Playwright WebKit；测试 UA Version/27.2 |
| Chrome 155 | 本机正式版，Playwright `channel=chrome` |
| Edge 155.0.4283.60 | 微软官方 pkg 校验 SHA-256 后解包到临时目录运行；未安装到系统 |
| Safari 27.0.1 | 原生 Safari 窗口的本地手工验收页；没有开启系统远程自动化 |

当前 Chrome 格式结果见 README。自动化验证实际媒体解码、时间线和结束事件，不等同于所有设备上的主观听感评审。本地报告不代表云端 CI 或 Windows 已实际执行。移动端、旧版本、后台长时间调度和实时直播不在首版保证范围。

## 仓库隔离

新仓库所有实现、构建和测试均在独立目录进行，不依赖来源仓库的路径或 node_modules。来源解码源码的指纹见 `decoder-source-sha256.json`。

执行过程中只读核对发现来源仓库 `scripts/serve-test.mjs` 和 `test/browser/sdk.spec.mjs` 被并行更新；本任务未写入这两个文件，也未覆盖其内容。该差异不涉及迁入的解码器源码。
