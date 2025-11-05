# Табель учёта сотрудников

Минимальный проект для учёта прихода и ухода сотрудников с сохранением данных в Google Sheets и фиксацией геолокации.

## Возможности

- ✅ Отметка прихода и ухода сотрудников
- ✅ Автоматическое сохранение в Google Sheets
- ✅ Фиксация геолокации (широта, долгота, точность)
- ✅ Простой и понятный интерфейс
- ✅ Адаптивный дизайн для мобильных устройств
- ✅ Готово к деплою на Google Cloud Run

## Структура проекта

```
/
├── server.js            # Express-сервер
├── package.json
├── .env.example         # пример конфигурации
└── /public
    ├── index.html       # страница отметки
    ├── script.js        # логика клиента
    └── styles.css       # стили
```

## Требования

- Node.js 14+ 
- Google Cloud аккаунт с доступом к Google Sheets API
- Сервисный аккаунт Google Cloud

## Настройка Google Sheets

1. Создайте новую таблицу в Google Sheets
2. Создайте лист с названием **"Events"**
3. В первой строке добавьте заголовки:
   ```
   timestamp | employee_code | action | worksite | source | latitude | longitude | accuracy
   ```
4. Скопируйте ID таблицы из URL:
   ```
   https://docs.google.com/spreadsheets/d/[SHEET_ID]/edit
   ```

## Настройка сервисного аккаунта

1. Перейдите в [Google Cloud Console](https://console.cloud.google.com/)
2. Создайте новый проект или выберите существующий
3. Включите **Google Sheets API**
4. Перейдите в **IAM & Admin** → **Service Accounts**
5. Создайте новый сервисный аккаунт или используйте существующий
6. Создайте ключ (JSON) для сервисного аккаунта
7. Откройте скачанный JSON файл и скопируйте:
   - `client_email` → `GOOGLE_SERVICE_ACCOUNT_EMAIL`
   - `private_key` → `GOOGLE_PRIVATE_KEY` (в одну строку, замените `\n` на `\\n`)
8. Откройте вашу Google Sheets таблицу и поделитесь ею с email сервисного аккаунта (права "Редактор")

## Локальный запуск

1. Клонируйте репозиторий или распакуйте проект

2. Установите зависимости:
   ```bash
   npm install
   ```

3. Создайте файл `.env` на основе `.env.example`:
   ```bash
   cp .env.example .env
   ```

4. Заполните переменные окружения в `.env`:
   ```env
   PORT=3000
   SHEET_ID=your_sheet_id_here
   GOOGLE_SERVICE_ACCOUNT_EMAIL=your-service-account@your-project.iam.gserviceaccount.com
   GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
   ```

5. Запустите сервер:
   ```bash
   npm start
   ```

6. Откройте браузер: `http://localhost:3000`

## Деплой на Google Cloud Run

### Способ 1: Через Google Cloud Console

1. **Подготовьте репозиторий:**
   - Создайте репозиторий на GitHub
   - Загрузите код проекта

2. **Создайте сервис Cloud Run:**
   - Перейдите в [Cloud Run](https://console.cloud.google.com/run)
   - Нажмите **Создать сервис**
   - Выберите **Развернуть из исходного репозитория**
   - Подключите ваш GitHub репозиторий
   - Выберите ветку (обычно `main` или `master`)

3. **Настройте сборку:**
   - **Среда выполнения:** Node.js
   - **Команда запуска:** `node server.js`
   - **Порт:** `3000`

4. **Добавьте переменные окружения:**
   - В разделе **Переменные и секреты** добавьте:
     - `PORT` = `3000`
     - `SHEET_ID` = (ваш ID таблицы)
     - `GOOGLE_SERVICE_ACCOUNT_EMAIL` = (email сервисного аккаунта)
     - `GOOGLE_PRIVATE_KEY` = (приватный ключ в одну строку)

5. **Настройте доступ:**
   - В разделе **Разрешения** выберите **Разрешить неаутентифицированные вызовы** (если нужно, чтобы страница была доступна без авторизации)

6. **Разверните:**
   - Нажмите **Создать**
   - Дождитесь завершения деплоя
   - Скопируйте публичный URL

### Способ 2: Через gcloud CLI

1. Установите [Google Cloud SDK](https://cloud.google.com/sdk/docs/install)

2. Авторизуйтесь:
   ```bash
   gcloud auth login
   gcloud config set project YOUR_PROJECT_ID
   ```

3. Включите необходимые API:
   ```bash
   gcloud services enable run.googleapis.com
   gcloud services enable cloudbuild.googleapis.com
   ```

4. Создайте файл `.gcloudignore` (опционально):
   ```
   .env
   node_modules
   .git
   ```

5. Разверните:
   ```bash
   gcloud run deploy employee-timesheet \
     --source . \
     --platform managed \
     --region us-central1 \
     --allow-unauthenticated \
     --set-env-vars PORT=3000 \
     --set-env-vars SHEET_ID=your_sheet_id \
     --set-env-vars GOOGLE_SERVICE_ACCOUNT_EMAIL=your-email@project.iam.gserviceaccount.com \
     --set-secrets GOOGLE_PRIVATE_KEY=your-secret-name:latest
   ```

   *Примечание: Для приватного ключа лучше использовать [Secret Manager](https://cloud.google.com/secret-manager) вместо прямого указания в env.*

## Использование

1. Откройте веб-страницу (локально или на Cloud Run)
2. Введите код сотрудника
3. При необходимости укажите участок
4. Нажмите **Приход** или **Уход**
5. При первом использовании браузер запросит разрешение на использование геолокации
6. Данные автоматически сохранятся в Google Sheets

## Формат данных в Google Sheets

Каждая запись содержит:
- **timestamp** - дата и время в ISO-формате
- **employee_code** - код сотрудника
- **action** - "IN" (приход) или "OUT" (уход)
- **worksite** - участок (опционально)
- **source** - источник данных ("web")
- **latitude** - широта
- **longitude** - долгота
- **accuracy** - точность геолокации в метрах

## Устранение неполадок

### Ошибка "Не заданы необходимые переменные окружения"
- Проверьте, что все переменные в `.env` заполнены корректно
- Убедитесь, что приватный ключ содержит `\n` вместо реальных переносов строк

### Ошибка "Ошибка при сохранении данных"
- Проверьте, что сервисный аккаунт имеет доступ к таблице
- Убедитесь, что Google Sheets API включен
- Проверьте правильность ID таблицы

### Геолокация не работает
- Убедитесь, что браузер запрашивает разрешение
- Проверьте, что у сайта есть HTTPS (обязательно для геолокации в продакшене)
- На локальном хосте (localhost) геолокация может работать без HTTPS

## Лицензия

MIT

#   e m p l o y e e - t i m e s h e e t  
 #   e m p l o y e e - t i m e s h e e t  
 #   e m p l o y e e - t i m e s h e e t  
 