require('dotenv').config();
const express = require('express');
const { google } = require('googleapis');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ENV
const SHEET_ID = process.env.SHEET_ID;
const GOOGLE_SERVICE_ACCOUNT_EMAIL = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
let GOOGLE_PRIVATE_KEY = process.env.GOOGLE_PRIVATE_KEY;

if (!SHEET_ID || !GOOGLE_SERVICE_ACCOUNT_EMAIL || !GOOGLE_PRIVATE_KEY) {
  console.error('Ошибка: Не заданы необходимые переменные окружения!');
  console.error('Проверьте: SHEET_ID, GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY');
  process.exit(1);
}

// Нормализация ключа (под Cloud Run / .env)
GOOGLE_PRIVATE_KEY = GOOGLE_PRIVATE_KEY
  .replace(/^["']|["']$/g, '')             // убрать кавычки если есть
  .replace(/\\n/g, '\n')                   // \n -> реальные переносы
  .replace(/\r\n/g, '\n')
  .replace(/\r/g, '\n');

const auth = new google.auth.JWT(
  GOOGLE_SERVICE_ACCOUNT_EMAIL,
  null,
  GOOGLE_PRIVATE_KEY,
  ['https://www.googleapis.com/auth/spreadsheets']
);

const sheets = google.sheets({ version: 'v4', auth });

// POST /api/mark
app.post('/api/mark', async (req, res) => {
  try {
    const { employeeName, employeeStatus, action, worksite, latitude, longitude, accuracy } = req.body;

    if (!employeeName || !employeeStatus || !action || !worksite) {
      return res.status(400).json({
        status: 'error',
        message: 'Не указаны обязательные поля: ФИО, Статус, Действие, Участок'
      });
    }

    if (action !== 'IN' && action !== 'OUT') {
      return res.status(400).json({
        status: 'error',
        message: 'action должен быть "IN" или "OUT"'
      });
    }

    if (employeeStatus !== 'Штат' && employeeStatus !== 'Аутсорсинг') {
      return res.status(400).json({
        status: 'error',
        message: 'Статус должен быть "Штат" или "Аутсорсинг"'
      });
    }

    // Время (Москва)
    const timestamp = new Date().toLocaleString('ru-RU', {
      timeZone: 'Europe/Moscow',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    }).replace(',', '');

    // Колонки: A:I
    // A timestamp
    // B employee_name
    // C employee_status
    // D action
    // E worksite
    // F source
    // G latitude
    // H longitude
    // I accuracy
    const row = [
      timestamp,
      String(employeeName).trim(),
      String(employeeStatus),
      action,
      String(worksite),
      'web',
      latitude !== undefined ? String(latitude) : '',
      longitude !== undefined ? String(longitude) : '',
      accuracy !== undefined ? String(accuracy) : ''
    ];

    await sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID,
      range: 'Events!A:I',
      valueInputOption: 'USER_ENTERED',
      resource: { values: [row] }
    });

    res.json({ status: 'ok', message: 'Отметка сохранена', timestamp });
  } catch (error) {
    console.error('Ошибка при сохранении:', error);

    let msg = 'Ошибка при сохранении данных';
    const m = (error && error.message) ? error.message : '';

    if (m.includes('DECODER') || m.toLowerCase().includes('private key')) {
      msg = 'Ошибка аутентификации. Проверьте приватный ключ сервиса.';
    } else if (m.toLowerCase().includes('permission') || m.toLowerCase().includes('access')) {
      msg = 'Нет доступа к таблице. Проверьте права сервисного аккаунта.';
    } else if (m) {
      msg = m;
    }

    res.status(500).json({ status: 'error', message: msg });
  }
});

app.listen(PORT, () => {
  console.log(`Сервер запущен на порту ${PORT}`);
});
