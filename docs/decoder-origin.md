# 解码器来源

Rust SILK 解码器、C ABI、TypeScript WASM 适配层及参考样本来自 `zpowertech/silk-wasm` 的 2026-10-16 工作区（包括当时已有的未提交修复）。

来源 HEAD：`27f51a24ecd087b0a20027a65cde7de633ae62d2`。源码快照的 SHA-256 清单见 `decoder-source-sha256.json`。保留原 MIT 许可证。新仓库独立构建，不引用来源仓库路径。后续解码修复需要主动同步。

首次提交前清理了 `decode_core.rs`、`plc.rs`、`sdk_api.rs`、`tables_control.rs` 和 `tables_pulses.rs` 末尾的多余空行；指纹清单保留原始来源快照，不包含这项格式清理。
