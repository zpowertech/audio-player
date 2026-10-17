# 测试音频

`test.slk` 与 `test_16000.pcm` 来自原仓库参考样本（16 kHz、80,000 samples、5 秒）。`voice.wav` 是参考 PCM 的标准 WAV 封装。

`test_48000.pcm` 是同一个 `test.slk` 经 [kn007/silk-v3-decoder](https://github.com/kn007/silk-v3-decoder/tree/master/silk) 中的 Skype SILK C SDK 1.0.9.6 解码得到的独立参考（48 kHz、单声道、16-bit little-endian、240,000 samples、5 秒）。用于验证逐包重采样、暂停续播和重播的完整 PCM，以及浏览器分块渲染的边界连续性；测试不依赖 C SDK 或远程服务。

生成命令：`silk/decoder test/fixtures/test.slk test/fixtures/test_48000.pcm -Fs_API 48000 -quiet`。SHA-256：`0149299dcdc79622a2c900e19bd7c74083d7d9cfb21acb48e59dde45f8f7106c`。

`tone.wav` 是代码生成的 1 秒、44.1 kHz、单声道、16-bit PCM、440 Hz 正弦波。其余 `tone.*` 是该合成波形使用 `@ffmpeg-installer/darwin-arm64@4.1.5` 提供的 FFmpeg 二进制转换得到，无外部媒体版权内容。生成方式见 `scripts/generate-fixtures.py`；运行正常测试无需 FFmpeg。
