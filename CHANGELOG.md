# @zpowertech/audio-player

## 0.1.1

### Patch Changes

- b11b40b: 修复 SILK 分块播放时独立重采样造成的拼接毛刺。复用有状态的流式重采样器，将 PCM 和 AudioContext 统一为 48 kHz，保留渐进首播、暂停续播、断流恢复和缓存重播能力。

## 0.1.0

### Minor Changes

- 提供 `createAudioPlayer()`，支持自动识别音频格式、播放、暂停、续播与状态订阅。
- 内嵌 SILK WASM 解码器，支持渐进解码播放和完整压缩数据缓存；其他格式使用浏览器原生播放能力。
- 提供 TypeScript 类型、SSR 安全初始化及普通页面和 React 示例，通过 Chrome 与 Vite / Webpack 安装包验证。
