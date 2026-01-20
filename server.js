require('dotenv').config();
const express = require('express');
const { google } = require('googleapis');
const path = require('path');
const msal = require('@azure/msal-node');

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

// === Microsoft Graph API (Excel в OneDrive) ===
const MS_CLIENT_ID = process.env.MS_CLIENT_ID;
const MS_TENANT_ID = process.env.MS_TENANT_ID;
const MS_CLIENT_SECRET = process.env.MS_CLIENT_SECRET;
const MS_SHARE_URL = process.env.MS_SHARE_URL; // Ссылка на Excel файл

let msalClient = null;
if (MS_CLIENT_ID && MS_TENANT_ID && MS_CLIENT_SECRET) {
  msalClient = new msal.ConfidentialClientApplication({
    auth: {
      clientId: MS_CLIENT_ID,
      authority: `https://login.microsoftonline.com/${MS_TENANT_ID}`,
      clientSecret: MS_CLIENT_SECRET
    }
  });
  console.log('Microsoft Graph API настроен');
} else {
  console.log('Microsoft Graph API не настроен (отсутствуют переменные MS_*)');
}

// Получение токена для Graph API
async function getMsToken() {
  if (!msalClient) return null;
  try {
    const result = await msalClient.acquireTokenByClientCredential({
      scopes: ['https://graph.microsoft.com/.default']
    });
    return result?.accessToken;
  } catch (error) {
    console.error('Ошибка получения MS токена:', error.message);
    return null;
  }
}

// Конвертация share URL в driveItem path
function getShareId(shareUrl) {
  // Кодируем URL в base64 и форматируем для Graph API
  const base64 = Buffer.from(shareUrl).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `u!${base64}`;
}

// Синхронизация записи в Excel
async function syncToExcel(rowData) {
  if (!msalClient || !MS_SHARE_URL) {
    return; // Excel не настроен
  }

  try {
    const token = await getMsToken();
    if (!token) {
      console.error('Не удалось получить токен для Excel');
      return;
    }

    const shareId = getShareId(MS_SHARE_URL);
    
    // Получаем информацию о файле через share link
    const driveItemUrl = `https://graph.microsoft.com/v1.0/shares/${shareId}/driveItem`;
    
    const itemResponse = await fetch(driveItemUrl, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    if (!itemResponse.ok) {
      const err = await itemResponse.text();
      console.error('Ошибка получения файла Excel:', err);
      return;
    }
    
    const itemData = await itemResponse.json();
    const driveId = itemData.parentReference?.driveId;
    const itemId = itemData.id;

    if (!driveId || !itemId) {
      console.error('Не удалось получить driveId/itemId');
      return;
    }

    // Добавляем строку в таблицу Excel (лист "Events")
    const addRowUrl = `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${itemId}/workbook/worksheets/Events/tables/EventsTable/rows`;
    
    const response = await fetch(addRowUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        values: [rowData]
      })
    });

    if (response.ok) {
      console.log('Данные синхронизированы в Excel');
    } else {
      // Если таблицы нет, пробуем добавить в диапазон
      const rangeUrl = `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${itemId}/workbook/worksheets/Events/range(address='A:I')/insert`;
      
      const rangeResponse = await fetch(
        `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${itemId}/workbook/worksheets/Events/usedRange`,
        { headers: { 'Authorization': `Bearer ${token}` } }
      );
      
      if (rangeResponse.ok) {
        const rangeData = await rangeResponse.json();
        const lastRow = (rangeData.rowCount || 1) + 1;
        
        const appendUrl = `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${itemId}/workbook/worksheets/Events/range(address='A${lastRow}:I${lastRow}')`;
        
        const appendResponse = await fetch(appendUrl, {
          method: 'PATCH',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            values: [rowData]
          })
        });
        
        if (appendResponse.ok) {
          console.log('Данные добавлены в Excel (диапазон)');
        } else {
          console.error('Ошибка записи в Excel:', await appendResponse.text());
        }
      }
    }
  } catch (error) {
    console.error('Ошибка синхронизации с Excel:', error.message);
  }
}

// === Функции для работы с сотрудниками ===

// Нормализация имени: убираем лишние пробелы, правильный регистр
function normalizeName(name) {
  if (!name) return '';
  return name
    .trim()
    .replace(/\s+/g, ' ')  // множественные пробелы → один
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

// Проверка валидности имени (минимум 2 слова, только буквы)
function isValidName(name) {
  if (!name) return false;
  const normalized = normalizeName(name);
  const words = normalized.split(' ').filter(w => w.length > 0);
  // Минимум 2 слова (Фамилия Имя)
  if (words.length < 2) return false;
  // Только буквы (кириллица и латиница)
  if (!/^[а-яёА-ЯЁa-zA-Z\s-]+$/.test(normalized)) return false;
  return true;
}

// Добавление нового сотрудника (если его нет в списке)
async function addEmployeeIfNew(employeeName) {
  try {
    const normalized = normalizeName(employeeName);
    if (!isValidName(normalized)) {
      console.log(`Имя не прошло валидацию: ${employeeName}`);
      return false;
    }

    // Получаем текущий список
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: 'Сотрудники!A:A'
    });

    const rows = response.data.values || [];
    const existingNames = rows.map(row => normalizeName(row[0] || '').toLowerCase());

    // Проверяем на дубль
    if (existingNames.includes(normalized.toLowerCase())) {
      console.log(`Сотрудник уже есть: ${normalized}`);
      return false;
    }

    // Добавляем нового
    await sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID,
      range: 'Сотрудники!A:A',
      valueInputOption: 'USER_ENTERED',
      resource: { values: [[normalized]] }
    });

    console.log(`Добавлен новый сотрудник: ${normalized}`);
    return true;
  } catch (error) {
    console.error('Ошибка при добавлении сотрудника:', error.message);
    return false;
  }
}

// GET /api/employees — получить список сотрудников для автокомплита
app.get('/api/employees', async (req, res) => {
  try {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: 'Сотрудники!A:A' // Колонка A с ФИО
    });

    const rows = response.data.values || [];
    // Пропускаем заголовок (первую строку), фильтруем пустые
    const employees = rows
      .slice(1)
      .map(row => row[0])
      .filter(name => name && name.trim());

    res.json({ status: 'ok', employees });
  } catch (error) {
    console.error('Ошибка при получении списка сотрудников:', error);
    // Если листа нет — возвращаем пустой список (не ошибку)
    res.json({ status: 'ok', employees: [] });
  }
});

// GET /api/last-mark — получить последнюю отметку сотрудника
app.get('/api/last-mark', async (req, res) => {
  try {
    const { employeeName } = req.query;

    if (!employeeName || !employeeName.trim()) {
      return res.status(400).json({
        status: 'error',
        message: 'Не указано ФИО сотрудника'
      });
    }

    const name = String(employeeName).trim().toLowerCase();

    // Читаем все записи из таблицы
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: 'Events!A:E' // timestamp, employee_name, employee_status, action, worksite
    });

    const rows = response.data.values || [];
    
    // Ищем последнюю отметку этого сотрудника (идём с конца)
    for (let i = rows.length - 1; i >= 0; i--) {
      const row = rows[i];
      if (row[1] && String(row[1]).trim().toLowerCase() === name) {
        return res.json({
          status: 'ok',
          lastAction: row[3] || null,    // action (IN/OUT)
          lastStatus: row[2] || null,    // employee_status (Штат/Аутсорсинг)
          lastWorksite: row[4] || null,  // worksite (Склад/Упаковка/Производство)
          timestamp: row[0] || null
        });
      }
    }

    // Отметок не найдено
    res.json({
      status: 'ok',
      lastAction: null,
      lastStatus: null,
      lastWorksite: null,
      timestamp: null
    });

  } catch (error) {
    console.error('Ошибка при получении последней отметки:', error);
    res.status(500).json({
      status: 'error',
      message: 'Ошибка при получении данных'
    });
  }
});

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

    // Проверка: нельзя сделать IN после IN или OUT после OUT
    // + проверка совпадения статуса и участка при УХОДЕ
    const nameToCheck = String(employeeName).trim().toLowerCase();
    const existingRows = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: 'Events!A:E' // timestamp, employee_name, employee_status, action, worksite
    });
    const allRows = existingRows.data.values || [];
    
    // Ищем последнюю отметку этого сотрудника
    let lastAction = null;
    let lastStatus = null;
    let lastWorksite = null;
    for (let i = allRows.length - 1; i >= 0; i--) {
      const row = allRows[i];
      if (row[1] && String(row[1]).trim().toLowerCase() === nameToCheck) {
        lastAction = row[3];
        lastStatus = row[2];
        lastWorksite = row[4];
        break;
      }
    }

    // Проверка: нельзя повторить то же действие
    if (lastAction === action) {
      const actionText = action === 'IN' ? 'ПРИХОД' : 'УХОД';
      return res.status(400).json({
        status: 'error',
        message: `Нельзя отметить "${actionText}" повторно. Сначала отметьте ${action === 'IN' ? 'УХОД' : 'ПРИХОД'}.`
      });
    }

    // Проверка: при УХОДЕ статус и участок должны совпадать с ПРИХОДОМ
    if (action === 'OUT' && lastAction === 'IN') {
      if (lastStatus && employeeStatus !== lastStatus) {
        return res.status(400).json({
          status: 'error',
          message: `Статус должен совпадать с приходом. Вы пришли как "${lastStatus}".`
        });
      }
      if (lastWorksite && worksite !== lastWorksite) {
        return res.status(400).json({
          status: 'error',
          message: `Участок должен совпадать с приходом. Вы пришли на "${lastWorksite}".`
        });
      }
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

    // Синхронизация с Excel (асинхронно, не блокируем ответ)
    syncToExcel(row).catch(err => {
      console.error('Ошибка синхронизации Excel:', err.message);
    });

    // Автоматически добавляем нового сотрудника в список (если его там нет)
    // Делаем асинхронно, не блокируем ответ
    addEmployeeIfNew(employeeName).catch(err => {
      console.error('Ошибка автодобавления сотрудника:', err.message);
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
