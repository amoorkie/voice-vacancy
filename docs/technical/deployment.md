# Размещение прототипа

Я показываю кабинет по адресу https://amo0orkie.ru/iskra/. Это отдельный сервис на сервере портфолио. Сервер слушает только 127.0.0.1:4327, HTTPS обслуживает nginx.

## Что хранится где

| Артефакт | Место |
| --- | --- |
| Код и история PR | GitHub amoorkie/voice-vacancy, main |
| Собранные релизы | /var/www/voice-vacancy/releases/<SHA> |
| Активный релиз | /var/www/voice-vacancy/current |
| Отдельный Node | /opt/voice-vacancy/node-v26.13.0-linux-x64 |
| Сервис | voice-vacancy.service, пользователь voice-vacancy |
| Закрытая конфигурация | /etc/voice-vacancy/app.env, права 0600 |
| Постоянный счётчик API | /var/lib/voice-vacancy/api-budget.json |
| Маршрут nginx | /etc/nginx/snippets/iskra.conf |

Конфиги сервиса и маршрута лежат в [deploy/portfolio](../../deploy/portfolio). Ключа API в архиве релиза и Git нет. В env задаю AI_ENABLED, WIKIVIBE_API_KEY, WIKIVIBE_API_BASE, WIKIVIBE_MODEL, AI_MAX_CALLS, PUBLIC_ORIGIN и AI_BUDGET_PATH. Для этой выкладки PUBLIC_ORIGIN=https://amo0orkie.ru, AI_BUDGET_PATH=/var/lib/voice-vacancy/api-budget.json, HOST=127.0.0.1, PORT=4327. Счётчик переносится из локальной проверки и сохраняется между релизами.

## Выпуск

1. Проверяю типы, тесты, сборку и сценарий в браузере. Сливаю принятые PR в main и выбираю его SHA.
2. Собираю клиент с базовым путём /iskra/, сервер — обычной TypeScript-сборкой. Добавляю package.json, package-lock.json и release.json с SHA. Статический клиент собирается на рабочем компьютере.
3. Передаю архив по проверенному SSH-доступу portfolio-new. Сверяю SHA-256, распаковываю в новый каталог релиза. Ставлю runtime-зависимости через отдельный Node 26 и npm ci --omit=dev --ignore-scripts.
4. Для первого запуска устанавливаю libatomic1, отдельного пользователя, Node, unit и env. Node скачиваю с nodejs.org, проверяю SHASUMS256.
5. Переключаю current атомарной заменой символьной ссылки, запускаю сервис. Проверяю /health и запрос с публичным Host/Origin на loopback.
6. Устанавливаю snippet nginx. Перед reload сохраняю прежний конфиг и выполняю nginx -t. Проверяю HTTPS, загрузку ресурсов, создание черновика, отмену, правки, копирование и скачивание. Сверяю состояние portfolio.service и ссылку его активного релиза до и после.

## Откат

При следующем выпуске сохраняю previous. Для отката направляю current на предыдущий каталог и перезапускаю только voice-vacancy.service. При первой установке можно убрать include iskra.conf из HTTPS server после резервной копии, выполнить nginx -t и reload. Env и журнал использованных API-попыток сохраняю. Архивы и каталоги прежних релизов остаются на диске.

## Ограничения показа

Запись работает с настоящим микрофоном, расшифровка выполняется на сервере. Генерация обращается к моему API. Ответы не сохраняются между перезагрузками вкладки. Общий лимит API задаю через AI_MAX_CALLS, расход не обнуляется при смене релиза.


## Настоящий голос

В `/opt/voice-vacancy/asr-venv` установлено отдельное Python-окружение по [asr-requirements.txt](../../deploy/portfolio/asr-requirements.txt). Модель base скачана в `/opt/voice-vacancy/asr-models`. Дистрибутив и документация — [faster-whisper](https://github.com/SYSTRAN/faster-whisper), лицензия MIT. Модель и окружение остаются на сервере между релизами.

В env сервиса задаю `ASR_ENABLED=true`, `ASR_PYTHON=/opt/voice-vacancy/asr-venv/bin/python`, `ASR_MODEL_PATH=/opt/voice-vacancy/asr-models/base`. Worker [transcribe.py](../../deploy/portfolio/transcribe.py) включён в каждый релиз. Python получает WAV в stdin и возвращает JSON. CPU ограничен одним потоком, приоритет сервиса понижен относительно портфолио. Запросы распознавания не расходуют платный лимит DeepSeek.

Проверяю, что `/api/config` сообщает `voice=microphone`, документ разрешает `microphone=(self)`, Nginx допускает тело до 6 МБ и использует `proxy_request_buffering off`. Для проверки использую синтетическую русскую фразу и тишину.
