# @zpowertech/audio-player

## 0.1.0

### Minor Changes

- 提供 `createAudioPlayer()`，支持自动识别音频格式、播放、暂停、续播与状态订阅。
- 内嵌 SILK WASM 解码器，支持渐进解码播放和完整压缩数据缓存；其他格式使用浏览器原生播放能力。
- 提供 TypeScript 类型、SSR 安全初始化及普通页面和 React 示例，通过 Chrome 与 Vite / Webpack 安装包验证。
