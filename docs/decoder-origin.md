# 解码器来源

Rust SILK 解码器、C ABI、TypeScript WASM 适配层及参考样本来自 `zpowertech/silk-wasm` 的 2026-10-16 工作区（包括当时已有的未提交修复）。

来源 HEAD：`27f51a24ecd087b0a20027a65cde7de633ae62d2`。源码快照的 SHA-256 清单见 `decoder-source-sha256.json`。保留原 MIT 许可证。新仓库独立构建，不引用来源仓库路径。后续解码修复需要主动同步。

首次提交前清理了 `decode_core.rs`、`plc.rs`、`sdk_api.rs`、`tables_control.rs` 和 `tables_pulses.rs` 末尾的多余空行；指纹清单保留原始来源快照，不包含这项格式清理。

2026-10-17：本仓库的内部 C ABI `silk_stream_new` 与 TypeScript `stream` 增加输出采样率参数，默认 `0` 保留原生解码行为。播放器指定 48 kHz，复用已有 Rust 重采样器的跨包状态，避免 Web Audio 对每个 PCM 小块独立重采样。此变更未修改来源仓库或原始源码指纹清单，也未增加公开 API。
