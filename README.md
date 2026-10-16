# @zpowertech/audio-player

浏览器音频播放 SDK。主入口只导出 `createAudioPlayer`，统一提供播放、暂停、续播和自动格式识别。

- MP3、WAV、AAC 等格式直接交给 `HTMLAudioElement` 渐进播放。
- SILK v3 使用 `fetch` 流 → 增量拆包 → Rust/WASM → Web Audio，在下载结束前开始播放。
- TypeScript、ESM、完整类型声明，**零运行时依赖**。React 仅用于开发示例。
- WASM 随包提供，首次 SILK 播放时按需加载、编译。使用方无需 Rust、复制资源或访问解码服务。
- 导入模块和创建播放器不会访问 DOM、创建音频设备、初始化 WASM 或请求音频；可用于 SSR。实际播放需要浏览器。

安装：`npm install @zpowertech/audio-player`。本地开发也可使用 `npm pack` 产物安装。

## 快速使用

```ts
import { createAudioPlayer } from '@zpowertech/audio-player';

const player = createAudioPlayer();

// 在点击事件内直接调用，保留浏览器的用户激活状态。
playButton.onclick = () => {
  void player.play('/voices/hello.silk').catch(error => {
    if (error.name !== 'AbortError') console.error(error.code, error.message);
  });
};
pauseButton.onclick = () => player.pause();
resumeButton.onclick = () => { void player.play().catch(console.error); };

const unsubscribe = player.subscribe(() => {
  const { status, currentTime, duration, error } = player.getSnapshot();
  // 根据实际 status 更新播放图标，不以按钮点击代替播放成功。
  console.log(status, currentTime, duration, error);
});

// 页面或应用退出时：
async function cleanup() {
  unsubscribe();
  await player.dispose();
}
```

`play()` 的 Promise 在实际开始播放后完成。后续缓冲、自然结束、播放中错误都通过订阅读取。取消旧操作会拒绝为 `AbortError`，应由调用方捕获。

## API

唯一运行时导出：

```ts
createAudioPlayer(): AudioPlayer
```

类型导出：`AudioPlayer`、`PlayerSnapshot`、`PlayerStatus`、`AudioPlayerError`、`AudioPlayerErrorCode`。不导出底层解码、WASM、音频节点、全局播放器或其他子路径。

| 实例方法 | 作用 |
| --- | --- |
| `play(url?: string): Promise<void>` | 播放、续播或切换 URL，自动识别格式 |
| `pause(): void` | 暂停，保留当前音频进度；重复调用无副作用 |
| `getSnapshot(): PlayerSnapshot` | 读取稳定、只读的状态快照 |
| `subscribe(listener): () => void` | 订阅状态变化，返回取消订阅函数 |
| `dispose(): Promise<void>` | 永久释放当前实例；重复调用返回同一个完成过程 |

```ts
interface PlayerSnapshot {
  readonly url: string | null; // 以 document.baseURI 解析后的绝对 URL
  readonly status:
    | 'idle' | 'loading' | 'playing' | 'paused' | 'buffering'
    | 'seeking' | 'ended' | 'error' | 'disposed';
  readonly currentTime: number; // 秒
  readonly duration: number | null; // 总时长未知时为 null
  readonly error: AudioPlayerError | null;
}
```

快照内容不变时引用不变。SILK 进度通知约每 250 ms 一次，控制状态立即通知；原生路径跟随浏览器媒体事件。销毁后仍可读取 `disposed` 快照，但不能再次播放，需要创建新实例。

## 播放规则

| 操作 | 行为 |
| --- | --- |
| 第一次传入 URL | 从 0 秒播放 |
| 暂停后 `play()` / 相同 URL | 从暂停位置续播 |
| 正在播放时 `play()` / 相同 URL | 保持播放 |
| 相同加载请求尚未完成时再次 `play()` | 复用当前 Promise |
| 切换 URL | 停止旧音频、清除旧缓存，从 0 秒播放 |
| A → B → A | A 从头播放，不保存每个 URL 的历史进度 |
| 播放结束后 `play()` | 从头播放 |
| 加载、缓冲期间 `pause()` | 取消本次播放意图，异步完成后也不会自行播放 |
| 新操作替代旧操作 | 旧 Promise 拒绝为 `AbortError`，不污染新状态 |
| 错误后再次 `play()` | 重新加载当前 URL，从头播放 |

每个实例同时只播放一个音频。聊天列表应共享一个活动实例；多个实例之间互不干扰。第一次播放必须传入 URL。`play` 仅接受可选的 URL 字符串，没有后续 options 参数，也不提供指定位置播放。

## 格式识别和流式行为

格式始终采用 `auto` 模式。`.silk` / `.slk` 链接走 SILK 路径，并验证真实文件头；其他链接（包括无后缀和 `blob:` URL）先尝试浏览器原生播放，只有格式不支持才进行 SILK 文件头探测。网络失败、播放权限错误不会作为格式回退条件，无需传入格式提示。

原生路径直接使用 URL，不先下载整段音频转换成 WAV。

SILK 首播预缓冲约 200 ms，PCM 提前排程约 1 秒，JS 待播放 PCM 约 2 秒；暂停后停止主动解码和读取，保留当前状态。网络不足时进入 `buffering`，时间线冻结，补足缓冲后继续。只有输入完成且所有音源实际结束才发布 `ended`。浏览器底层的网络缓存由浏览器管理。

SILK 三种文件头：`\x02#!SILK_V3`、`#!SILK_V3`、`!SILK_V3`。支持可选的有符号 `-1` 结束标记。残缺头、长度字段、包体、损坏包、结束标记后的多余数据都会明确报错。

SILK 播放结束后重播，优先复用**完整且经过验证的压缩缓存**从头解码；缓存不可用或已超出 32 MiB 上限时，重新请求 URL。完整解码前总时长为 `null`；聊天气泡可以继续显示消息数据中的时长。

当前范围是有限音频文件的渐进播放，不包含实时通信、播放列表、混音、录音、编码、HLS/DASH 引擎或移动端后台播放保证。首版使用小块 `AudioBufferSourceNode` 排程，主线程长时间阻塞仍可能导致缓冲耗尽。

## Chrome 验证范围

后续浏览器验证统一使用 Chrome，Playwright 固定 `channel: 'chrome'`。下表是 **2026-10-16 在 macOS 上使用仓库真实音频样本的结果**。`✓` 表示开始播放并自然结束；`—` 表示浏览器拒绝该编码，SDK 返回 `NOT_SUPPORTED`。格式支持不由扩展名或 `canPlayType()` 的返回值代替实测。

| 容器 / 编码 | Chrome 155 |
| --- | --- |
| SILK v3 / 单声道 | ✓ |
| WAV / 16-bit PCM | ✓ |
| MP3 | ✓ |
| M4A / AAC-LC | ✓ |
| AAC / ADTS | ✓ |
| FLAC | ✓ |
| Ogg / Vorbis | ✓ |
| Ogg / Opus | ✓ |
| WebM / Opus | ✓ |
| M4A / ALAC | — |
| AMR、WMA、APE 等 | 不提供解码器 |
| HLS / DASH | 无跨浏览器协议适配 |

实际版本、场景和历史记录见 [验证说明](docs/verification.md)。AAC 等格式受操作系统解码能力影响；其他系统和旧版本需要独立验收。其他浏览器的旧记录仅作为历史参考，不属于当前持续验证范围。

SDK 不添加 SILK 以外的解码器，因此不承诺浏览器本来不支持的格式。支持表针对已列出的容器与编码组合，不代表该扩展名下任意编码。

## React / vwork-web

核心包没有 React 依赖。可参考可运行的 [聊天语音示例](examples/react/usePlayVoice.ts)：

```tsx
const { playing, loading, error, togglePlay } = usePlayVoice(content.url);
return <button onClick={togglePlay}>{loading ? '加载中' : playing ? '暂停' : '播放'}</button>;
```

示例保留 `useId()` 区分消息，应用共享一个活动播放器。相同消息继续播放；切换消息时，示例先销毁旧实例、创建新实例，再调用 `play(url)`，保证不同消息即使 URL 相同也从头播放。状态通过 `useSyncExternalStore` 订阅；服务端使用稳定初始快照。消息列表只订阅状态和消息身份，不因每次进度通知全部重渲染。

应用销毁时释放共享播放器，不要在每个消息组件卸载时销毁它；虚拟列表滚动卸载消息不应切断整个播放器。

## URL、跨域、权限和资源所有权

支持 HTTP(S)、相对 URL、`blob:` 和 `data:`。`File` 可由调用方创建 Blob URL：

```ts
const url = URL.createObjectURL(file);
try {
  await player.play(url);
  // 等待用户操作或订阅 ended；play() 完成只表示开始，不是结束。
} catch (error) {
  console.error(error);
}
// 确认不再使用后：先切换音频或销毁播放器，再 URL.revokeObjectURL(url)。
```

调用方创建的 Blob URL 始终由调用方释放，播放器不会撤销它。内部音源、AudioContext、请求、缓存由 SDK 管理，`dispose()` 统一释放。

SILK 使用 `fetch` 读取字节，需要服务器允许 CORS；原生 `<audio>` 能播放某跨域 URL，不代表 JavaScript 能读取它。首版适合普通 URL、签名 URL 和同源资源，没有统一的自定义请求头接口。跨域带凭据访问需由业务同源代理或可直接访问的签名 URL 解决。

应直接在用户点击事件中调用 `play()`，不要先等待自己的请求再调用。自动路由可能在点击时临时创建 AudioContext，为随后 SILK 回退保留播放权限；原生播放成功后立即关闭，且不会初始化 WASM。

错误包含稳定 `code`、`message` 和可用的原始 `cause`：

| code | 含义 |
| --- | --- |
| `INVALID_ARGUMENT` | URL 为空、类型错误、无法解析或协议不支持；不影响正在进行的有效请求 |
| `NO_SOURCE` | 尚未提供音频 URL |
| `NOT_SUPPORTED` | 环境、格式或必要能力不支持 |
| `NETWORK` | 可识别的 HTTP、CORS 或流读取失败 |
| `AUTOPLAY_BLOCKED` | 浏览器拒绝播放，需用户再次点击 |
| `DECODE` | 容器损坏、截断或解码失败 |
| `WASM_INIT` | 解码器初始化失败，可重试 |
| `DISPOSED` | 使用了已销毁实例 |

原生媒体错误只能按浏览器提供的错误码分类；浏览器将网络问题报告为“不支持”时，SDK 无法获得被隐藏的响应细节。

## 本地开发、构建与验证

开发工具使用 Node.js 24、npm，以及项目固定的 Rust 1.85.0。浏览器消费者不需要 Rust。

```sh
npm ci
rustup toolchain install 1.85.0 --profile minimal --target wasm32-unknown-unknown
npm run build
npm run serve
```

打开 Vite 提示的 `/examples/`，可播放远程 URL、本地文件并体验 React 聊天列表。演示使用构建后的 `dist`，修改 TypeScript 后需要重新 `npm run build`。

```sh
# 已安装 Chrome 时可跳过；Linux CI 使用 --with-deps 安装系统依赖。
npx playwright install chrome
npm run verify
```

`verify` 依次执行：构建、Rust、Node、示例类型检查、npm tarball 独立安装、Vite / Webpack 构建，以及 Chrome 的核心播放、安装包和示例交互验证。三套 Playwright 配置均只运行 `chrome` 项目，所有浏览器测试使用本地样本和服务器，无需远程音频服务。

```sh
# 单独运行 Chrome 核心播放回归（先完成构建）
npx playwright test --project=chrome

# Chrome 手工验收页
node scripts/test-server.mjs
# 在 Chrome 打开 http://127.0.0.1:4280/test/browser/manual.html，逐项点击。
# 结果同时显示在页面，并保存到 output/manual-results.json。

# 生成可分发包，prepack 自动生成完整产物；不会发布
npm pack
# 在另一个项目中安装生成的 tgz：
npm install /absolute/path/to/zpowertech-audio-player-0.1.0.tgz
```

验证 CI 在 Linux 执行完整 `verify`，在 Windows 执行核心播放回归，浏览器均为 Chrome。`test:browser` 的安装包用例需要先运行 `test:package`。测试生成物、缓存和 tarball 不进入 Git。

默认 WASM 内嵌模块从同一次 Rust 构建生成；构建使用 `--locked`。发布文件限于 `dist`、README、许可证与 npm 元数据，没有安装时构建脚本。Vite / Webpack 5 默认无需额外 WASM 资源配置，已覆盖 `/nested/` 子路径。

## npm 发布

发布流程为 **Changesets → 版本 PR → GitHub Actions → npm Trusted Publishing**，与 `antd-overlay` 的流程保持一致。

需要发布功能或修复时运行 `npm run changeset`，填写中文变更说明并随代码提交。合入 `main` 后，`Release` 工作流自动创建或更新版本 PR；检查版本与变更日志并合并后，工作流使用 OIDC 发布 npm 包，再创建 Git Tag 和 GitHub Release。无需配置 `NPM_TOKEN`。

完整验证和打包在无 npm 发布权限的 job 中执行，发布 job 只上传已通过独立安装和 Chrome 验证的相同 tarball。首次发布使用 `0.1.0`；当前版本已发布且没有 changeset 时不会重复发布。首次配置、后续发布与失败重试见 [发布说明](docs/publishing.md)。

## 来源

Rust 解码器、C ABI 和部分 WASM 适配代码继承自 `zpowertech/silk-wasm`，保留 MIT 许可证和 [源码来源记录](docs/decoder-origin.md)。本仓库独立构建和运行，不依赖原仓库的目录；此次实现未修改原仓库。播放器和增量网络链路在此仓库实现。
