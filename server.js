require('dotenv').config();
const express = require('express');
const { google } = require('googleapis');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Проверка переменных окружения при запуске
const SHEET_ID = process.env.SHEET_ID;
const GOOGLE_SERVICE_ACCOUNT_EMAIL = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
let GOOGLE_PRIVATE_KEY = process.env.GOOGLE_PRIVATE_KEY;

if (!SHEET_ID || !GOOGLE_SERVICE_ACCOUNT_EMAIL || !GOOGLE_PRIVATE_KEY) {
  console.error('Ошибка: Не заданы необходимые переменные окружения!');
  console.error('Проверьте: SHEET_ID, GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY');
  process.exit(1);
}

// Обработка приватного ключа: убираем кавычки и правильно обрабатываем переносы строк
let originalKeyLength = GOOGLE_PRIVATE_KEY.length;
GOOGLE_PRIVATE_KEY = GOOGLE_PRIVATE_KEY
  .replace(/^["']|["']$/g, '') // убираем кавычки в начале и конце
  .replace(/-----BEGIN PRIVATE KEY----- /g, '-----BEGIN PRIVATE KEY-----\n') // исправляем пробел после BEGIN
  .replace(/-----END PRIVATE KEY----- /g, '-----END PRIVATE KEY-----\n') // исправляем пробел после END
  .replace(/\\n/g, '\n') // превращаем \n в реальные переводы строк (ПРИОРИТЕТНО!)
  .replace(/\r\n/g, '\n') // нормализуем Windows переносы
  .replace(/\r/g, '\n'); // нормализуем старые Mac переносы

// Проверка формата после обработки
if (!GOOGLE_PRIVATE_KEY.startsWith('-----BEGIN PRIVATE KEY-----\n')) {
  console.warn('⚠️  ВНИМАНИЕ: Приватный ключ может иметь неправильный формат!');
  console.warn('   Начало ключа:', GOOGLE_PRIVATE_KEY.substring(0, 50));
}

// Настройка Google Sheets API
const auth = new google.auth.JWT(
  GOOGLE_SERVICE_ACCOUNT_EMAIL,
  null,
  GOOGLE_PRIVATE_KEY, // ✅ используем уже обработанный ключ
  ['https://www.googleapis.com/auth/spreadsheets']
);

const sheets = google.sheets({ version: 'v4', auth });

// Эндпоинт для отметки прихода/ухода
app.post('/api/mark', async (req, res) => {
  try {
    const { employeeCode, action, worksite, latitude, longitude, accuracy } = req.body;

    // Валидация
    if (!employeeCode || !action) {
      return res.status(400).json({
        status: 'error',
        message: 'Не указаны обязательные поля: employeeCode и action'
      });
    }

    if (action !== 'IN' && action !== 'OUT') {
      return res.status(400).json({
        status: 'error',
        message: 'action должен быть "IN" или "OUT"'
      });
    }

    // Локальное время (Москва, можно поменять таймзону при необходимости)
const now = new Date();
const timestamp = now.toLocaleString('ru-RU', {
  timeZone: 'Europe/Moscow',      // если другой регион — можно поменять
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit'
}).replace(',', '');              // убираем запятую между датой и временем

const row = [
  timestamp,                      // уже нормальная дата+время
  String(employeeCode),
  action,
  worksite || '',
  'web',
  latitude !== undefined ? String(latitude) : '',
  longitude !== undefined ? String(longitude) : '',
  accuracy !== undefined ? String(accuracy) : ''
];


    // Добавление строки в Google Sheets
    await sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID,
      range: 'Events!A:H',
      valueInputOption: 'USER_ENTERED',
      resource: {
        values: [row]
      }
    });

    res.json({
      status: 'ok',
      message: 'Отметка сохранена',
      timestamp: timestamp
    });

  } catch (error) {
    console.error('Ошибка при сохранении:', error);
    console.error('Детали ошибки:', {
      message: error.message,
      code: error.code,
      stack: error.stack
    });
    
    // Более понятное сообщение для пользователя
    let errorMessage = 'Ошибка при сохранении данных';
    if (error.message.includes('DECODER') || error.message.includes('private key')) {
      errorMessage = 'Ошибка аутентификации. Проверьте формат приватного ключа в .env';
    } else if (error.message.includes('permission') || error.message.includes('access')) {
      errorMessage = 'Ошибка доступа к таблице. Убедитесь, что сервисный аккаунт имеет доступ к таблице';
    } else {
      errorMessage = error.message;
    }
    
    res.status(500).json({
      status: 'error',
      message: errorMessage
    });
  }
});

// Запуск сервера
app.listen(PORT, () => {
  console.log(`Сервер запущен на порту ${PORT}`);
  console.log(`Откройте http://localhost:${PORT} в браузере`);
});

