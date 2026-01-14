const elName = document.getElementById('employeeName');
const elStatus = document.getElementById('employeeStatus');
const elWorksite = document.getElementById('worksite');

const btnIn = document.getElementById('btnIn');
const btnOut = document.getElementById('btnOut');

const statusBox = document.getElementById('status');
const geoState = document.getElementById('geoState');
const nowClock = document.getElementById('nowClock');

function setStatus(type, text) {
  statusBox.className = 'status ' + (type === 'ok' ? 'ok' : 'err');
  statusBox.textContent = text;
  statusBox.style.display = 'block';
}

function clearStatus() {
  statusBox.className = 'status';
  statusBox.textContent = '';
  statusBox.style.display = 'none';
}

function disableButtons(disabled) {
  btnIn.disabled = disabled;
  btnOut.disabled = disabled;
}

function isValid() {
  if (!elName.value.trim()) return { ok: false, msg: 'Введите «Фамилия и Имя сотрудника».' };
  if (!elStatus.value) return { ok: false, msg: 'Выберите «Статус».' };
  if (!elWorksite.value) return { ok: false, msg: 'Выберите «Участок».' };
  return { ok: true };
}

// Попробуем сразу запросить геолокацию (мягко, без блокировки)
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
  // используем уже полученную, если есть
  if (lastGeo.latitude && lastGeo.longitude) return lastGeo;

  // иначе попробуем запросить ещё раз (жёстче)
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

async function mark(action) {
  clearStatus();

  const v = isValid();
  if (!v.ok) {
    setStatus('err', v.msg);
    return;
  }

  disableButtons(true);

  try {
    const geo = await getGeoForMark();

    const payload = {
      employeeName: elName.value.trim(),
      employeeStatus: elStatus.value,
      action,
      worksite: elWorksite.value,
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

    setStatus('ok', `✅ Отметка сохранена (${action === 'IN' ? 'ПРИХОД' : 'УХОД'}).`);
  } catch (e) {
    setStatus('err', 'Ошибка сети или сервера. Попробуйте ещё раз.');
  } finally {
    disableButtons(false);
  }
}

btnIn.addEventListener('click', () => mark('IN'));
btnOut.addEventListener('click', () => mark('OUT'));

// Часы внизу (для спокойствия пользователей)
function tickClock() {
  const now = new Date();
  nowClock.textContent = now.toLocaleString('ru-RU', {
    year:'numeric', month:'2-digit', day:'2-digit',
    hour:'2-digit', minute:'2-digit', second:'2-digit'
  }).replace(',', '');
}
tickClock();
setInterval(tickClock, 1000);
