"""Regenerate deterministic source tones; FFmpeg must be installed to encode variants."""
import math
from pathlib import Path
import struct
import subprocess
import wave
root = Path(__file__).resolve().parent.parent / 'test' / 'fixtures'
with wave.open(str(root / 'tone.wav'), 'wb') as file:
    file.setnchannels(1)
    file.setsampwidth(2)
    file.setframerate(44100)
    file.writeframes(b''.join(struct.pack('<h', int(3000 * math.sin(i * 2 * math.pi * 440 / 44100))) for i in range(44100)))
with wave.open(str(root / 'voice.wav'), 'wb') as file:
    file.setnchannels(1)
    file.setsampwidth(2)
    file.setframerate(16000)
    file.writeframes((root / 'test_16000.pcm').read_bytes())
for extension, codec in [('mp3','libmp3lame'),('m4a','aac'),('aac','aac'),('flac','flac'),('ogg','libvorbis'),('opus','libopus'),('webm','libopus'),('alac.m4a','alac')]:
    subprocess.run(['ffmpeg','-y','-i',str(root/'tone.wav'),'-c:a',codec,str(root/('tone.'+extension))],check=True)
