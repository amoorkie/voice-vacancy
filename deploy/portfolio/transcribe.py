"""Распознаю WAV из stdin на CPU. Аудио и расшифровка остаются в памяти процесса."""
import io
import json
import sys
from faster_whisper import WhisperModel


def main():
    """Ограничиваю ввод, включаю VAD и отдаю только JSON без записи пользовательских данных."""
    audio = sys.stdin.buffer.read(3_840_045)
    if len(audio) > 3_840_044:
        raise ValueError("Audio limit")
    model = WhisperModel(
        sys.argv[1], device="cpu", compute_type="int8", cpu_threads=1, num_workers=1,
        local_files_only=True,
    )
    segments, _ = model.transcribe(
        io.BytesIO(audio), language="ru", beam_size=1, temperature=0,
        condition_on_previous_text=False, vad_filter=True,
        vad_parameters={"min_speech_duration_ms": 200, "min_silence_duration_ms": 400},
    )
    text = " ".join(segment.text.strip() for segment in segments
                    if segment.no_speech_prob < 0.7).strip()
    print(json.dumps({"text": text}, ensure_ascii=False))


if __name__ == "__main__":
    main()
