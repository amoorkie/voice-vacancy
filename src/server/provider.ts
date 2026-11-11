// Единственная граница внешней сети. URL и модель задаются только серверной конфигурацией.
export class ApiError extends Error {
  constructor(
    public code: string,
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export type ProviderConfig = {
  key: string;
  model: string;
  baseUrl: string;
  fetcher?: typeof fetch;
};

/** Выполняет одну ограниченную попытку без повторов и не раскрывает upstream body клиенту. */
export async function completeJson(
  config: ProviderConfig,
  prompt: string,
  input: unknown,
  maxTokens: number,
  signal: AbortSignal,
) {
  const response = await (config.fetcher ?? fetch)(
    `${config.baseUrl}/chat/completions`,
    {
      method: "POST",
      redirect: "error",
      signal,
      headers: {
        Authorization: `Bearer ${config.key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: config.model,
        messages: [
          { role: "system", content: prompt },
          { role: "user", content: JSON.stringify(input) },
        ],
        response_format: { type: "json_object" },
        max_completion_tokens: maxTokens,
        reasoning_effort: "low",
        stream: false,
        store: false,
      }),
    },
  );
  const reader = response.body?.getReader();
  if (!reader)
    throw new ApiError(
      "provider-unavailable",
      502,
      "Сервис не вернул ответ. Ваш текст сохранён.",
    );
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.length;
      if (bytes > 256000) {
        await reader.cancel();
        throw new ApiError(
          "invalid-provider-output",
          502,
          "Ответ сервиса слишком большой.",
        );
      }
      chunks.push(chunk.value);
    }
  } finally {
    reader.releaseLock();
  }
  let data: any;
  try {
    data = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new ApiError(
      "invalid-provider-output",
      502,
      "Сервис вернул неправильный формат. Можно повторить вручную.",
    );
  }
  if (!response.ok) {
    const code = String(data?.code ?? data?.error?.code ?? "");
    if (code === "INSUFFICIENT_BALANCE")
      throw new ApiError(
        "provider-balance",
        503,
        "На счёте API недостаточно средств. Ваш текст сохранён.",
      );
    if (response.status === 404)
      throw new ApiError(
        "provider-model",
        503,
        "В группе API нет доступного для этого ключа провайдера модели. Ваш текст сохранён.",
      );
    if (response.status === 401 || response.status === 403)
      throw new ApiError(
        "provider-access",
        503,
        "API не разрешает этот запрос. Проверьте ключ и доступ к модели.",
      );
    throw new ApiError(
      "provider-unavailable",
      503,
      "Сервис временно недоступен. Ваш текст сохранён.",
    );
  }
  const choice = data?.choices?.[0];
  if (
    choice?.finish_reason !== "stop" ||
    typeof choice?.message?.content !== "string" ||
    !choice.message.content.trim() ||
    choice.message.refusal
  )
    throw new ApiError(
      "invalid-provider-output",
      502,
      "Сервис вернул неполный ответ. Ваш текст сохранён.",
    );
  try {
    return JSON.parse(choice.message.content);
  } catch {
    throw new ApiError(
      "invalid-provider-output",
      502,
      "Не удалось проверить ответ сервиса. Ваш текст сохранён.",
    );
  }
}
