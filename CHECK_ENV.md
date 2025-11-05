# Проверка файла .env

## Как проверить файл .env

1. **Убедитесь, что файл существует:**
   - Файл должен называться `.env` (без расширения)
   - Он должен находиться в корне проекта (там же, где `server.js`)

2. **Запустите скрипт проверки:**
   ```bash
   node check-env.js
   ```

3. **Или проверьте вручную** - файл должен содержать:

```env
PORT=3000
SHEET_ID=ваш_id_таблицы
GOOGLE_SERVICE_ACCOUNT_EMAIL=ваш-email@проект.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC...\n-----END PRIVATE KEY-----\n"
```

## Типичные проблемы с GOOGLE_PRIVATE_KEY

### ❌ Неправильно:
```env
# Многострочный формат (не работает)
GOOGLE_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC...
-----END PRIVATE KEY-----

# Без экранирования \n
GOOGLE_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\nMIIEv...\n-----END PRIVATE KEY-----
```

### ✅ Правильно:
```env
# В одну строку с экранированными \n и кавычками
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC...\n-----END PRIVATE KEY-----\n"

# Или без кавычек (тоже работает)
GOOGLE_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC...\n-----END PRIVATE KEY-----\n
```

## Как получить правильный формат ключа

1. Откройте JSON файл сервисного аккаунта (скачанный из Google Cloud Console)
2. Найдите поле `"private_key"`
3. Скопируйте значение (оно будет в формате с реальными переносами строк)
4. Замените все реальные переносы строк на `\n`
5. Вставьте в `.env` файл, обернув в кавычки

### Пример конвертации:

**В JSON файле:**
```json
{
  "private_key": "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC...\n-----END PRIVATE KEY-----\n"
}
```

**В .env файле (скопировать как есть, если уже есть \n):**
```env
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC...\n-----END PRIVATE KEY-----\n"
```

## Проверка через код

Если файл `.env` существует, но сервер всё равно выдаёт ошибку "DECODER routines::unsupported", проверьте:

1. **Длина ключа** - должен быть около 1600-1700 символов
2. **Начало** - должен начинаться с `-----BEGIN PRIVATE KEY-----`
3. **Конец** - должен заканчиваться на `-----END PRIVATE KEY-----`
4. **Переносы строк** - должны быть экранированы как `\n`, а не реальные переносы

## Быстрая проверка

Запустите сервер и посмотрите в консоль:
- Если видите "Ошибка: Не заданы необходимые переменные окружения!" - файл `.env` не найден или переменные не заданы
- Если видите ошибку "DECODER routines::unsupported" - проблема с форматом `GOOGLE_PRIVATE_KEY`

