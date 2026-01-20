require('dotenv').config();
const express = require('express');
const path = require('path');
const msal = require('@azure/msal-node');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// === Microsoft Graph API (Excel в OneDrive) ===
const MS_CLIENT_ID = process.env.MS_CLIENT_ID;
const MS_TENANT_ID = process.env.MS_TENANT_ID;
const MS_CLIENT_SECRET = process.env.MS_CLIENT_SECRET;
const MS_SHARE_URL = process.env.MS_SHARE_URL;

if (!MS_CLIENT_ID || !MS_TENANT_ID || !MS_CLIENT_SECRET || !MS_SHARE_URL) {
  console.error('Ошибка: Не заданы переменные MS_CLIENT_ID, MS_TENANT_ID, MS_CLIENT_SECRET, MS_SHARE_URL');
  process.exit(1);
}

const msalClient = new msal.ConfidentialClientApplication({
  auth: {
    clientId: MS_CLIENT_ID,
    authority: `https://login.microsoftonline.com/${MS_TENANT_ID}`,
    clientSecret: MS_CLIENT_SECRET
  }
});

// Кэш для driveId и itemId (чтобы не запрашивать каждый раз)
let cachedDriveId = null;
let cachedItemId = null;
let cachedToken = null;
let tokenExpiry = 0;

// Получение токена (с кэшированием)
async function getToken() {
  const now = Date.now();
  if (cachedToken && tokenExpiry > now + 60000) {
    return cachedToken;
  }
  
  try {
    const result = await msalClient.acquireTokenByClientCredential({
      scopes: ['https://graph.microsoft.com/.default']
    });
    cachedToken = result?.accessToken;
    tokenExpiry = now + (result?.expiresOn ? result.expiresOn.getTime() - now : 3600000);
    return cachedToken;
  } catch (error) {
    console.error('Ошибка получения токена:', error.message);
    throw error;
  }
}

// Конвертация share URL в shareId
function getShareId(shareUrl) {
  const base64 = Buffer.from(shareUrl).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `u!${base64}`;
}

// Получение driveId и itemId (с кэшированием)
async function getDriveInfo() {
  if (cachedDriveId && cachedItemId) {
    return { driveId: cachedDriveId, itemId: cachedItemId };
  }

  const token = await getToken();
  const shareId = getShareId(MS_SHARE_URL);
  
  const response = await fetch(`https://graph.microsoft.com/v1.0/shares/${shareId}/driveItem`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Ошибка доступа к Excel: ${err}`);
  }

  const data = await response.json();
  cachedDriveId = data.parentReference?.driveId;
  cachedItemId = data.id;

  if (!cachedDriveId || !cachedItemId) {
    throw new Error('Не удалось получить driveId/itemId');
  }

  console.log('Excel файл найден:', { driveId: cachedDriveId, itemId: cachedItemId });
  return { driveId: cachedDriveId, itemId: cachedItemId };
}

// Базовый URL для работы с Excel
async function getExcelBaseUrl() {
  const { driveId, itemId } = await getDriveInfo();
  return `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${itemId}/workbook/worksheets`;
}

// Чтение данных из листа Excel
async function readExcelSheet(sheetName, range) {
  const token = await getToken();
  const baseUrl = await getExcelBaseUrl();
  
  const url = `${baseUrl}/${encodeURIComponent(sheetName)}/range(address='${range}')`;
  
  const response = await fetch(url, {
    headers: { 'Authorization': `Bearer ${token}` }
  });

  if (!response.ok) {
    if (response.status === 404) {
      return []; // Лист не найден или пустой
    }
    const err = await response.text();
    throw new Error(`Ошибка чтения Excel: ${err}`);
  }

  const data = await response.json();
  return data.values || [];
}

// Добавление строки в лист Excel
async function appendToExcel(sheetName, rowData) {
  const token = await getToken();
  const baseUrl = await getExcelBaseUrl();

  // Сначала получаем используемый диапазон чтобы найти последнюю строку
  const usedRangeUrl = `${baseUrl}/${encodeURIComponent(sheetName)}/usedRange`;
  
  const usedResponse = await fetch(usedRangeUrl, {
    headers: { 'Authorization': `Bearer ${token}` }
  });

  let lastRow = 1;
  if (usedResponse.ok) {
    const usedData = await usedResponse.json();
    lastRow = (usedData.rowCount || 0) + 1;
  }

  // Записываем в следующую строку
  const colCount = rowData.length;
  const endCol = String.fromCharCode(64 + colCount); // A=1, I=9
  const rangeAddress = `A${lastRow}:${endCol}${lastRow}`;
  
  const writeUrl = `${baseUrl}/${encodeURIComponent(sheetName)}/range(address='${rangeAddress}')`;
  
  const response = await fetch(writeUrl, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ values: [rowData] })
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Ошибка записи в Excel: ${err}`);
  }

  return lastRow;
}

// Чтение всех данных из листа
async function readAllRows(sheetName) {
  const token = await getToken();
  const baseUrl = await getExcelBaseUrl();
  
  const url = `${baseUrl}/${encodeURIComponent(sheetName)}/usedRange`;
  
  const response = await fetch(url, {
    headers: { 'Authorization': `Bearer ${token}` }
  });

  if (!response.ok) {
    if (response.status === 404) return [];
    const err = await response.text();
    throw new Error(`Ошибка чтения: ${err}`);
  }

  const data = await response.json();
  return data.values || [];
}

// === Функции для работы с сотрудниками ===

// Нормализация имени: убираем лишние пробелы, правильный регистр
function normalizeName(name) {
  if (!name) return '';
  return name
    .trim()
    .replace(/\s+/g, ' ')
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

// Проверка валидности имени (минимум 2 слова, только буквы)
function isValidName(name) {
  if (!name) return false;
  const normalized = normalizeName(name);
  const words = normalized.split(' ').filter(w => w.length > 0);
  if (words.length < 2) return false;
  if (!/^[а-яёА-ЯЁa-zA-Z\s-]+$/.test(normalized)) return false;
  return true;
}

// Добавление нового сотрудника в Excel (если его нет)
async function addEmployeeIfNew(employeeName) {
  try {
    const normalized = normalizeName(employeeName);
    if (!isValidName(normalized)) {
      console.log(`Имя не прошло валидацию: ${employeeName}`);
      return false;
    }

    // Читаем список сотрудников из Excel
    const rows = await readAllRows('Сотрудники');
    const existingNames = rows.map(row => normalizeName(row[0] || '').toLowerCase());

    if (existingNames.includes(normalized.toLowerCase())) {
      return false;
    }

    // Добавляем нового сотрудника
    await appendToExcel('Сотрудники', [normalized]);
    console.log(`Добавлен новый сотрудник: ${normalized}`);
    return true;
  } catch (error) {
    console.error('Ошибка при добавлении сотрудника:', error.message);
    return false;
  }
}

// GET /api/employees — список сотрудников для автокомплита
app.get('/api/employees', async (req, res) => {
  try {
    const rows = await readAllRows('Сотрудники');
    const employees = rows
      .slice(1) // Пропускаем заголовок
      .map(row => row[0])
      .filter(name => name && name.trim());

    res.json({ status: 'ok', employees });
  } catch (error) {
    console.error('Ошибка при получении сотрудников:', error.message);
    res.json({ status: 'ok', employees: [] });
  }
});

// GET /api/last-mark — последняя отметка сотрудника
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
    const rows = await readAllRows('Events');

    // Ищем последнюю отметку (с конца)
    for (let i = rows.length - 1; i >= 0; i--) {
      const row = rows[i];
      if (row[1] && String(row[1]).trim().toLowerCase() === name) {
        return res.json({
          status: 'ok',
          lastAction: row[3] || null,
          lastStatus: row[2] || null,
          lastWorksite: row[4] || null,
          timestamp: row[0] || null
        });
      }
    }

    res.json({
      status: 'ok',
      lastAction: null,
      lastStatus: null,
      lastWorksite: null,
      timestamp: null
    });

  } catch (error) {
    console.error('Ошибка при получении последней отметки:', error.message);
    res.status(500).json({
      status: 'error',
      message: 'Ошибка при получении данных'
    });
  }
});

// POST /api/mark — отметка прихода/ухода
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

    // Читаем существующие данные из Excel
    const nameToCheck = String(employeeName).trim().toLowerCase();
    const allRows = await readAllRows('Events');

    // Ищем последнюю отметку
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

    // Проверка: при УХОДЕ статус и участок должны совпадать
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

    // Формируем строку данных
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

    // Записываем в Excel
    const rowNum = await appendToExcel('Events', row);
    console.log(`Записано в Excel, строка ${rowNum}`);

    // Добавляем сотрудника если новый (асинхронно)
    addEmployeeIfNew(employeeName).catch(err => {
      console.error('Ошибка автодобавления сотрудника:', err.message);
    });

    res.json({ status: 'ok', message: 'Отметка сохранена', timestamp });

  } catch (error) {
    console.error('Ошибка при сохранении:', error);
    res.status(500).json({ 
      status: 'error', 
      message: error.message || 'Ошибка при сохранении данных' 
    });
  }
});

// Инициализация при старте
async function init() {
  try {
    await getDriveInfo();
    console.log('Подключение к Excel успешно!');
  } catch (error) {
    console.error('Ошибка подключения к Excel:', error.message);
  }
}

app.listen(PORT, () => {
  console.log(`Сервер запущен на порту ${PORT}`);
  init();
});
