# Passport Recognition (Узбекистан)

Веб-приложение для распознавания паспортов Узбекистана через камеру телефона:
OCR машиночитаемой зоны (MRZ) + транслитерация ФИО с латиницы на русский.

## Стек
- Express.js сервер (`server/index.js`), отдаёт статику из `public/` и проксирует запросы к Yandex Vision OCR (ключ хранится только на сервере).
- Yandex Vision OCR REST API (`https://ocr.api.cloud.yandex.net/ocr/v1/recognizeText`), languageCodes `["en","ru","uz"]`, model `page`.
- Frontend: `public/index.html` + `public/app.js` + `public/style.css` — камера (getUserMedia), рамка для MRZ, fallback на загрузку файла.

## Структура
- `server/index.js` — Express, эндпоинт `POST /api/recognize` (multer upload `image`).
- `server/mrz.js` — парсер MRZ TD3 (2 строки по 44 символа, ICAO check digit, weights [7,3,1]).
- `server/transliterate.js` — транслитерация узбекской латиницы в кириллицу (digraphs: yo/yu/ya/sh/ch/kh/ng, o'/g').
- `public/` — фронтенд.

## Переменные окружения (`.env`, не коммитится)
```
PORT=3001
YANDEX_API_KEY=...
YANDEX_FOLDER_ID=...
```
Сервисный аккаунт в Yandex Cloud должен иметь роль `ai.vision.user`, ключ со scope `yc.ai.vision.execute`.

## Запуск
```
npm install
npm run dev   # node --watch server/index.js
```

## Деплой
- Railway: проект `passport-recognition`, auto-deploy из GitHub при пуше в `main`.
- Прод: https://passport-recognition-production.up.railway.app
- GitHub: https://github.com/V1201010/passport-recognition (репозиторий публичный, секреты не коммитятся — `.env` в `.gitignore`).

## Заметки по реализации
- `formatDate(yymmdd, { expiryAlwaysFuture })` — для срока действия паспорта всегда 2000+yy, для даты рождения — сравнение с текущим годом (19XX/20XX).
- `findMrzLines` принимает строки длиной 30–50 символов (OCR иногда добавляет лишние `<`), затем паддит/обрезает до 44.
- Камера: разрешение `1920x1080`, `focusMode: continuous`, визуальная рамка для MRZ — для повышения качества OCR.
