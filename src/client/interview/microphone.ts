// Настоящая запись и отправка аудио отделены от тестового адаптера и подтверждения ответа.
import type { Action, Attempt } from "../../domain/session";
import type { RuntimeConfig } from "../owner-adapter";

/** Формирует WAV PCM16 mono, который сервер может проверить перед распознаванием. */
export function encodeWave(samples: Float32Array, rate = 16000) {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const label = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i++)
      view.setUint8(offset + i, value.charCodeAt(i));
  };
  label(0, "RIFF");
  view.setUint32(4, buffer.byteLength - 8, true);
  label(8, "WAVE");
  label(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  label(36, "data");
  view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const value = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * 2, value * (value < 0 ? 32768 : 32767), true);
  }
  return new Uint8Array(buffer);
}

/** Управляет одним разрешением, аудиопотоком и запросом. Отмена освобождает даже поздно полученный микрофон. */
export function openMicrophone(
  attempt: Attempt,
  config: RuntimeConfig,
  fillEmpty: boolean,
  deliver: (action: Action) => void,
  level: (value: number) => void,
) {
  let cancelled = false;
  let stopped = false;
  let stream: MediaStream | undefined;
  let context: AudioContext | undefined;
  let source: MediaStreamAudioSourceNode | undefined;
  let recorder: AudioWorkletNode | undefined;
  let samples: Float32Array[] = [];
  let frames = 0;
  let speechSeconds = 0;
  let lastLevel = 0;
  const controller = new AbortController();

  /** Завершает локальный захват без сохранения аудио на диск. */
  function release() {
    if (recorder) recorder.port.onmessage = null;
    source?.disconnect();
    recorder?.disconnect();
    stream?.getTracks().forEach((track) => {
      track.onended = null;
      track.stop();
    });
    if (context && context.state !== "closed") void context.close();
    level(0);
  }
  /** Ошибка относится к исходной попытке и не заменяет введённый пользователем текст. */
  function fail(text: string) {
    if (!cancelled) deliver({ type: "failure", id: attempt.id, text });
  }
  const ready = (async () => {
    if (!navigator.mediaDevices?.getUserMedia || !window.AudioWorkletNode)
      throw new Error(
        "Этот браузер не поддерживает запись. Напишите ответ текстом.",
      );
    stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
      },
    });
    if (cancelled) {
      release();
      return;
    }
    context = new AudioContext();
    await context.audioWorklet.addModule(
      import.meta.env.BASE_URL + "audio-capture.js",
    );
    if (cancelled) {
      release();
      return;
    }
    recorder = new AudioWorkletNode(context, "voice-capture");
    source = context.createMediaStreamSource(stream);
    recorder.port.onmessage = (event: MessageEvent<Float32Array>) => {
      if (stopped || cancelled || !context) return;
      const block = event.data;
      if (frames + block.length > context.sampleRate * 120) return;
      samples.push(block);
      frames += block.length;
      const rms = Math.sqrt(
        block.reduce((sum, value) => sum + value * value, 0) / block.length,
      );
      if (rms > 0.008) speechSeconds += block.length / context.sampleRate;
      if (performance.now() - lastLevel > 80) {
        lastLevel = performance.now();
        level(Math.min(1, rms * 12));
      }
    };
    stream.getAudioTracks().forEach((track) => {
      track.onended = () =>
        fail("Микрофон отключён. Подключите его и повторите запись.");
    });
    source.connect(recorder);
    recorder.connect(context.destination);
    await context.resume();
  })();
  // Обработчик установлен сразу, чтобы отказ разрешения не оставлял необработанный Promise.
  void ready.catch((error) => {
    release();
    fail(
      error?.name === "NotAllowedError"
        ? "Разрешите доступ к микрофону в браузере или напишите ответ."
        : error?.name === "NotFoundError"
          ? "Микрофон не найден. Подключите его или напишите ответ."
          : "Не удалось включить микрофон. Проверьте разрешение или напишите ответ.",
    );
  });

  /** Останавливает захват, отбрасывает тишину и отправляет ровно одну запись своему серверу. */
  async function stop() {
    if (stopped || cancelled) return;
    try {
      await ready;
      if (cancelled || !context) return;
      stopped = true;
      const rate = context.sampleRate;
      release();
      if (speechSeconds < 0.18 || frames < rate * 0.3) {
        samples = [];
        fail("Речь не обнаружена. Попробуйте ещё раз или напишите ответ.");
        return;
      }
      const input = new Float32Array(frames);
      let offset = 0;
      for (const block of samples) {
        input.set(block, offset);
        offset += block.length;
      }
      samples = [];
      const offline = new OfflineAudioContext(
        1,
        Math.ceil((frames * 16000) / rate),
        16000,
      );
      const audio = offline.createBuffer(1, frames, rate);
      audio.copyToChannel(input, 0);
      const player = offline.createBufferSource();
      player.buffer = audio;
      player.connect(offline.destination);
      player.start();
      const rendered = await offline.startRendering();
      if (cancelled) return;
      const wave = encodeWave(rendered.getChannelData(0));
      let binary = "";
      for (let i = 0; i < wave.length; i += 32768)
        binary += String.fromCharCode(...wave.subarray(i, i + 32768));
      const timer = window.setTimeout(() => controller.abort(), 50000);
      try {
        const response = await fetch(
          import.meta.env.BASE_URL + "api/transcriptions",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Demo-Token": config.csrfToken,
            },
            body: JSON.stringify({
              requestId: attempt.id,
              sessionId: attempt.sessionId,
              questionId: ["Q1", "Q2", "Q3", "Q4"][attempt.question],
              revision: attempt.revision,
              audio: btoa(binary),
            }),
            signal: controller.signal,
          },
        );
        const data = await response.json();
        if (cancelled) return;
        if (!response.ok)
          throw new Error(data.message || "Не удалось распознать запись.");
        if (
          data.requestId !== attempt.id ||
          data.sessionId !== attempt.sessionId ||
          typeof data.text !== "string" ||
          !data.text.trim()
        )
          throw new Error(
            "Речь не обнаружена. Повторите запись или напишите ответ.",
          );
        deliver({
          type: "transcript",
          id: attempt.id,
          text: data.text,
          fillEmpty,
        });
      } finally {
        window.clearTimeout(timer);
      }
    } catch (error) {
      fail(
        controller.signal.aborted
          ? "Распознавание заняло слишком долго. Повторите запись."
          : error instanceof Error
            ? error.message
            : "Не удалось распознать речь.",
      );
    }
  }
  /** Удаляет аудио из памяти и прерывает запрос при смене темы, текста или выходе. */
  function cancel() {
    cancelled = true;
    samples = [];
    controller.abort();
    release();
  }
  return { stop, cancel };
}
