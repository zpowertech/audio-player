# 首版验证记录

日期：2026-10-16。所有音频均来自仓库测试样本，无远程解码服务。

## `play(url?: string)` 接口回归

本次接口仅保留可选 URL 字符串，格式统一自动识别；移除公开的 `PlayOptions`、`startTime` 和 `format` 参数。示例、手工验收页和测试调用已同步迁移。

- 构建、28 项 Node 测试、React 示例类型检查通过。
- `npm run test:package` 通过：独立安装产物、类型检查、Vite / Webpack 生产构建正常；类型用例明确拒绝旧对象参数和第二个 options 参数。
- Chromium、WebKit 各 29 项核心用例通过，覆盖无参续播、相同 URL 保持进度、切换与重播、非法输入、SILK 后缀及无后缀 / Blob / data URL 自动识别。
- Chromium、WebKit 共 8 项安装包浏览器用例、4 项示例交互用例通过；React 示例验证不同消息即使 URL 相同也从头播放，并释放旧实例。
- Firefox 在启动阶段报 `Could not find profile folder`，使用临时隔离应用副本后仍复现，未进入测试页面。本次未获得 Firefox 的核心、安装包及示例运行结果。

## 初始 API 历史验证

以下为接口简化前的原始验证记录，其中指定位置播放已从公开 API 移除。Chrome、Edge、Safari 的记录保留为历史结果，不代表本次接口变更已在这些浏览器重新验收。

- Rust：24 项测试；完整和逐包解码保持 16 kHz、80,000 samples、5 秒，并与参考 PCM 逐样本相同。
- Node：28 项测试；三种头、网络分块、截断、损坏、结束标记、编译失败重试、缓存上限、SSR 和主入口导出。
- 浏览器核心：Chromium、Firefox、WebKit、Chrome、Edge 各 28 项，共 140 项，涵盖渐进首播、缓冲冻结与恢复、暂停续播、切换与取消、精确定位 PCM、初始化重试、自动播放错误、Blob/data URL 和真实格式文件。
- 安装包：在离线且 Rust 不可用的消费者项目中安装 `npm pack` 产物，检查导出、类型、无运行时依赖和无安装构建脚本。Vite / Webpack 5 的开发、生产和 `/nested/` 部署共 12 项浏览器用例。
- 示例：普通页面与 React 聊天列表在三引擎中共 6 项交互用例，并通过 React 示例类型检查。
- Safari：实际 Safari 27.0.1 点击独立验收页，完成 SILK/原生播放控制、无后缀回退和 8 种编码文件，共 11 项。原始结果见 [safari-verification.json](safari-verification.json)。

补充回归：断流时同时发布 `buffering` 状态与实际停止位置，避免 UI 在缓冲期间补跳上一帧的进度；三引擎各重复 3 次通过。

## 平台与结果范围

本地操作系统为 macOS 27.0.1（Apple Silicon）。自动化使用隔离浏览器配置，不读取个人资料。

| 浏览器 | 本地验证方式 |
| --- | --- |
| Chromium 156.0.8078.4 | Playwright headless shell |
| Firefox 157 | Playwright Firefox；使用隔离应用标识，避免系统 profile 冲突 |
| WebKit | Playwright WebKit；测试 UA Version/27.2 |
| Chrome 155 | 本机正式版，Playwright `channel=chrome` |
| Edge 155.0.4283.60 | 微软官方 pkg 校验 SHA-256 后解包到临时目录运行；未安装到系统 |
| Safari 27.0.1 | 原生 Safari 窗口的本地手工验收页；没有开启系统远程自动化 |

格式结果见 README。自动化验证实际媒体解码、时间线和结束事件，不等同于所有设备上的主观听感评审。Windows CI 工作流已配置；本地报告不代表云端 CI 或 Windows 已实际执行。移动端、旧版本、后台长时间调度和实时直播不在首版保证范围。

## 重现

```sh
npm ci
rustup toolchain install 1.85.0 --profile minimal --target wasm32-unknown-unknown
npx playwright install --with-deps chromium firefox webkit
npm run verify
```

可选 `AUDIO_TEST_CHANNELS=chrome,msedge` 启用已安装的真实品牌浏览器。必要时以 `AUDIO_TEST_FIREFOX_EXECUTABLE` 或 `AUDIO_TEST_EDGE_EXECUTABLE` 指定隔离可执行文件，不改变生产 SDK 的行为。

Safari 执行 `node scripts/test-server.mjs` 后打开 `/test/browser/manual.html`，逐项点击；结果保存到 `output/manual-results.json`。Playwright 的详细 JSON、日志、截图和失败 trace 保存在被 Git 忽略的 `output/` / `test-results/` 中。

## 仓库隔离

新仓库所有实现、构建和测试均在独立目录进行，不依赖来源仓库的路径或 node_modules。来源解码源码的指纹见 `decoder-source-sha256.json`。

执行过程中只读核对发现来源仓库 `scripts/serve-test.mjs` 和 `test/browser/sdk.spec.mjs` 被并行更新；本任务未写入这两个文件，也未覆盖其内容。该差异不涉及迁入的解码器源码。
