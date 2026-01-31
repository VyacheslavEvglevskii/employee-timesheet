const elName = document.getElementById('employeeName');
const elStatus = document.getElementById('employeeStatus');
const elWorksite = document.getElementById('worksite');
const elShift = document.getElementById('shift');
const elShiftContainer = document.getElementById('shiftContainer');

const btnIn = document.getElementById('btnIn');
const btnOut = document.getElementById('btnOut');

const statusBox = document.getElementById('status');
const geoState = document.getElementById('geoState');
const nowClock = document.getElementById('nowClock');
const lastMarkEl = document.getElementById('lastMark');

const autocompleteList = document.getElementById('autocompleteList');

// === Список сотрудников для автокомплита ===
let employeesList = [];
let selectedIndex = -1;

// === Состояние последней отметки сотрудника ===
let currentLastAction = null;   // 'IN', 'OUT' или null
let currentLastStatus = null;   // 'Штат', 'Аутсорсинг' или null
let currentLastWorksite = null; // 'Склад', 'Упаковка', 'Производство' или null
let currentLastShift = null;    // 'День', 'Ночь' или null

// === Показ/скрытие выбора смены ===
function updateShiftVisibility() {
  const worksite = elWorksite.value;
  if (worksite === 'Упаковка') {
    elShiftContainer.style.display = 'block';
    elShift.required = true;
  } else {
    elShiftContainer.style.display = 'none';
    elShift.required = false;
    elShift.value = '';
  }
}

elWorksite.addEventListener('change', updateShiftVisibility);

// === Загрузка списка сотрудников ===
async function loadEmployees() {
  try {
    const resp = await fetch('/api/employees');
    const data = await resp.json();
    if (data.status === 'ok' && data.employees) {
      employeesList = data.employees;
      console.log(`Загружено ${employeesList.length} сотрудников`);
    }
  } catch (e) {
    console.error('Ошибка загрузки списка сотрудников:', e);
  }
}

// === Автокомплит ===
function showAutocomplete(matches) {
  if (matches.length === 0) {
    autocompleteList.innerHTML = '<div class="autocomplete-new">💡 Новый сотрудник? Введите ФИО полностью</div>';
    autocompleteList.classList.add('show');
    return;
  }
  
  const query = elName.value.trim().toLowerCase();
  
  autocompleteList.innerHTML = matches.map((name, idx) => {
    // Подсветка совпадающей части
    const lowerName = name.toLowerCase();
    const matchStart = lowerName.indexOf(query);
    let displayName = name;
    if (matchStart >= 0 && query.length > 0) {
      displayName = 
        name.substring(0, matchStart) + 
        '<span class="match">' + name.substring(matchStart, matchStart + query.length) + '</span>' +
        name.substring(matchStart + query.length);
    }
    return `<div class="autocomplete-item" data-index="${idx}" data-name="${name}">${displayName}</div>`;
  }).join('');
  
  autocompleteList.classList.add('show');
  selectedIndex = -1;
}

function hideAutocomplete() {
  autocompleteList.classList.remove('show');
  selectedIndex = -1;
}

function selectEmployee(name) {
  elName.value = name;
  hideAutocomplete();
  checkLastMark();
}

// Клик по элементу списка
autocompleteList.addEventListener('click', (e) => {
  const item = e.target.closest('.autocomplete-item');
  if (item) {
    selectEmployee(item.dataset.name);
  }
});

// Навигация клавиатурой
elName.addEventListener('keydown', (e) => {
  const items = autocompleteList.querySelectorAll('.autocomplete-item');
  
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    selectedIndex = Math.min(selectedIndex + 1, items.length - 1);
    updateActiveItem(items);
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    selectedIndex = Math.max(selectedIndex - 1, 0);
    updateActiveItem(items);
  } else if (e.key === 'Enter' && selectedIndex >= 0 && items[selectedIndex]) {
    e.preventDefault();
    selectEmployee(items[selectedIndex].dataset.name);
  } else if (e.key === 'Escape') {
    hideAutocomplete();
  }
});

function updateActiveItem(items) {
  items.forEach((item, idx) => {
    item.classList.toggle('active', idx === selectedIndex);
  });
  if (items[selectedIndex]) {
    items[selectedIndex].scrollIntoView({ block: 'nearest' });
  }
}

// === Автофокус на ФИО ===
window.addEventListener('load', () => {
  loadEmployees(); // Загружаем список сотрудников
  elName.focus();
  updateButtonStates(); // Изначально блокируем УХОД (нет отметок)
  updateFieldsLock();   // Разблокируем поля изначально
});

// === Проверка последней отметки при изменении ФИО ===
let checkTimeout = null;
elName.addEventListener('input', () => {
  const query = elName.value.trim().toLowerCase();
  
  // Показываем автокомплит при вводе 2+ символов
  if (query.length >= 2 && employeesList.length > 0) {
    const matches = employeesList.filter(name => 
      name.toLowerCase().includes(query)
    ).slice(0, 8); // Максимум 8 результатов
    showAutocomplete(matches);
  } else {
    hideAutocomplete();
  }
  
  // Debounce — ждём 500мс после последнего ввода для проверки отметки
  clearTimeout(checkTimeout);
  checkTimeout = setTimeout(() => {
    checkLastMark();
  }, 500);
});

// При потере фокуса
elName.addEventListener('blur', () => {
  // Небольшая задержка чтобы успел сработать клик по списку
  setTimeout(() => {
    hideAutocomplete();
    clearTimeout(checkTimeout);
    checkLastMark();
  }, 150);
});

async function checkLastMark() {
  const name = elName.value.trim();
  if (!name) {
    currentLastAction = null;
    currentLastStatus = null;
    currentLastWorksite = null;
    currentLastShift = null;
    updateButtonStates();
    updateFieldsLock();
    return;
  }

  try {
    const resp = await fetch(`/api/last-mark?employeeName=${encodeURIComponent(name)}`);
    const data = await resp.json();
    
    if (data.status === 'ok') {
      currentLastAction = data.lastAction;
      currentLastStatus = data.lastStatus;
      currentLastWorksite = data.lastWorksite;
      currentLastShift = data.lastShift || null;
      
      updateButtonStates();
      updateFieldsLock();
      
      // Показываем информацию о последней отметке
      if (data.lastAction && data.timestamp) {
        const actionText = data.lastAction === 'IN' ? 'ПРИХОД' : 'УХОД';
        let infoText = `Последняя отметка: ${actionText} (${data.timestamp})`;
        
        // Если есть незакрытый ПРИХОД — показываем подсказку
        if (data.lastAction === 'IN') {
          infoText += `\nСтатус и участок заполнены автоматически.`;
        }
        setStatus('info', infoText);
      }
    }
  } catch (e) {
    console.error('Ошибка проверки последней отметки:', e);
  }
}

// Автозаполнение и блокировка полей при незакрытом ПРИХОДЕ
function updateFieldsLock() {
  if (currentLastAction === 'IN' && currentLastStatus && currentLastWorksite) {
    // Автозаполняем поля
    elStatus.value = currentLastStatus;
    elWorksite.value = currentLastWorksite;
    updateShiftVisibility(); // Показать/скрыть смену
    
    // Автозаполняем смену если была
    if (currentLastShift && currentLastWorksite === 'Упаковка') {
      elShift.value = currentLastShift;
      elShift.disabled = true;
    }
    
    // Блокируем поля (нельзя менять при УХОДЕ)
    elStatus.disabled = true;
    elWorksite.disabled = true;
  } else {
    // Разблокируем поля
    elStatus.disabled = false;
    elWorksite.disabled = false;
    elShift.disabled = false;
  }
}

function updateButtonStates() {
  // Если последняя отметка IN — блокируем кнопку ПРИХОД
  // Если последняя отметка OUT или null — блокируем кнопку УХОД
  
  if (currentLastAction === 'IN') {
    btnIn.disabled = true;
    btnIn.title = 'Вы уже отметили приход. Сначала отметьте уход.';
    btnOut.disabled = false;
    btnOut.title = '';
  } else if (currentLastAction === 'OUT') {
    btnIn.disabled = false;
    btnIn.title = '';
    btnOut.disabled = true;
    btnOut.title = 'Вы уже отметили уход. Сначала отметьте приход.';
  } else {
    // Нет отметок — разрешён только ПРИХОД
    btnIn.disabled = false;
    btnIn.title = '';
    btnOut.disabled = true;
    btnOut.title = 'Сначала отметьте приход.';
  }
}

// === Последняя отметка (храним в браузере) ===
function loadLastMark() {
  const saved = localStorage.getItem('lastMark');
  if (saved) lastMarkEl.textContent = saved;
}
function saveLastMark(action) {
  const now = new Date();
  const time = now.toLocaleString('ru-RU', {
    year:'numeric', month:'2-digit', day:'2-digit',
    hour:'2-digit', minute:'2-digit', second:'2-digit'
  }).replace(',', '');
  const text = `${action === 'IN' ? 'ПРИХОД' : 'УХОД'} — ${time}`;
  lastMarkEl.textContent = text;
  localStorage.setItem('lastMark', text);
}
loadLastMark();

function setStatus(type, text) {
  let className = 'status ';
  if (type === 'ok') className += 'ok';
  else if (type === 'info') className += 'info';
  else className += 'err';
  
  statusBox.className = className;
  statusBox.textContent = text;
  statusBox.style.display = 'block';
}
function clearStatus() {
  statusBox.className = 'status';
  statusBox.textContent = '';
  statusBox.style.display = 'none';
}
function disableButtons(disabled) {
  if (disabled) {
    // Блокируем обе кнопки на время запроса
    btnIn.disabled = true;
    btnOut.disabled = true;
  } else {
    // Восстанавливаем состояние по последней отметке
    updateButtonStates();
  }
}

function isValid() {
  if (!elName.value.trim()) return { ok: false, msg: 'Введите «Фамилия и Имя сотрудника».' };
  if (!elStatus.value) return { ok: false, msg: 'Выберите «Статус».' };
  if (!elWorksite.value) return { ok: false, msg: 'Выберите «Участок».' };
  if (elWorksite.value === 'Упаковка' && !elShift.value) return { ok: false, msg: 'Выберите «Смену» (День/Ночь).' };
  return { ok: true };
}

// === Геолокация ===
let lastGeo = { latitude: '', longitude: '', accuracy: '' };

function requestGeoSilently() {
  if (!navigator.geolocation) {
    geoState.textContent = 'не поддерживается';
    return;
  }
  geoState.textContent = 'запрос…';
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      lastGeo = {
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        accuracy: pos.coords.accuracy
      };
      geoState.textContent = 'получена';
    },
    () => {
      geoState.textContent = 'нет доступа';
    },
    { enableHighAccuracy: true, timeout: 6000 }
  );
}
requestGeoSilently();

async function getGeoForMark() {
  if (lastGeo.latitude && lastGeo.longitude) return lastGeo;
  if (!navigator.geolocation) return { latitude: '', longitude: '', accuracy: '' };

  geoState.textContent = 'запрос…';
  return await new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const g = {
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy
        };
        lastGeo = g;
        geoState.textContent = 'получена';
        resolve(g);
      },
      () => {
        geoState.textContent = 'нет доступа';
        resolve({ latitude: '', longitude: '', accuracy: '' });
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  });
}

// === Антидубли (защита от повторного клика) ===
let isSubmitting = false;

// Если сотрудник случайно нажал два раза очень быстро — второй клик игнорируется
// Плюс кнопки блокируются на время запроса.
async function mark(action) {
  if (isSubmitting) return;          // ✅ антидубли
  isSubmitting = true;
  disableButtons(true);
  clearStatus();

  const v = isValid();
  if (!v.ok) {
    setStatus('err', v.msg);
    disableButtons(false);
    isSubmitting = false;
    return;
  }

  try {
    const geo = await getGeoForMark();

    const payload = {
      employeeName: elName.value.trim(),
      employeeStatus: elStatus.value,
      action,
      worksite: elWorksite.value,
      shift: elWorksite.value === 'Упаковка' ? elShift.value : '',
      latitude: geo.latitude,
      longitude: geo.longitude,
      accuracy: geo.accuracy
    };

    const resp = await fetch('/api/mark', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await resp.json().catch(() => ({}));

    if (!resp.ok) {
      setStatus('err', data.message || 'Ошибка сохранения. Попробуйте ещё раз.');
      return;
    }

    saveLastMark(action);
    setStatus('ok', `✅ Отметка сохранена: ${action === 'IN' ? 'ПРИХОД' : 'УХОД'}.`);
    
    // Обновляем состояние после успешной отметки
    currentLastAction = action;
    if (action === 'IN') {
      // Запоминаем статус, участок и смену при ПРИХОДЕ
      currentLastStatus = elStatus.value;
      currentLastWorksite = elWorksite.value;
      currentLastShift = elWorksite.value === 'Упаковка' ? elShift.value : null;
    } else {
      // При УХОДЕ сбрасываем — можно выбирать заново
      currentLastStatus = null;
      currentLastWorksite = null;
      currentLastShift = null;
    }
    updateButtonStates();
    updateFieldsLock();
  } catch (e) {
    setStatus('err', 'Ошибка сети или сервера. Попробуйте ещё раз.');
  } finally {
    disableButtons(false);
    isSubmitting = false;           // ✅ снимаем блокировку
  }
}

btnIn.addEventListener('click', () => mark('IN'));
btnOut.addEventListener('click', () => mark('OUT'));

// Часы внизу
function tickClock() {
  const now = new Date();
  nowClock.textContent = now.toLocaleString('ru-RU', {
    year:'numeric', month:'2-digit', day:'2-digit',
    hour:'2-digit', minute:'2-digit', second:'2-digit'
  }).replace(',', '');
}
tickClock();
setInterval(tickClock, 1000);
