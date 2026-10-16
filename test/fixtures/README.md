# 测试音频

`test.slk` 与 `test_16000.pcm` 来自原仓库参考样本（16 kHz、80,000 samples、5 秒）。`voice.wav` 是参考 PCM 的标准 WAV 封装。

`tone.wav` 是代码生成的 1 秒、44.1 kHz、单声道、16-bit PCM、440 Hz 正弦波。其余 `tone.*` 是该合成波形使用 `@ffmpeg-installer/darwin-arm64@4.1.5` 提供的 FFmpeg 二进制转换得到，无外部媒体版权内容。生成方式见 `scripts/generate-fixtures.py`；运行正常测试无需 FFmpeg。
