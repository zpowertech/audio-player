---
"@zpowertech/audio-player": patch
---

修复 SILK 分块播放时独立重采样造成的拼接毛刺。复用有状态的流式重采样器，将 PCM 和 AudioContext 统一为 48 kHz，保留渐进首播、暂停续播、断流恢复和缓存重播能力。
