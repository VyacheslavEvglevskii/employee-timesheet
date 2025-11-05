const form = document.getElementById('timesheetForm');
const employeeCodeInput = document.getElementById('employeeCode');
const worksiteInput = document.getElementById('worksite');
const btnIn = document.getElementById('btnIn');
const btnOut = document.getElementById('btnOut');
const statusDiv = document.getElementById('status');

// Функция для отображения статуса
function showStatus(message, isError = false) {
    statusDiv.textContent = message;
    statusDiv.className = 'status ' + (isError ? 'error' : 'success');
    statusDiv.style.display = 'block';
    
    // Автоматически скрыть через 5 секунд
    setTimeout(() => {
        statusDiv.style.display = 'none';
    }, 5000);
}

// Функция для получения геолокации
function getGeolocation() {
    return new Promise((resolve) => {
        if (!navigator.geolocation) {
            resolve({ latitude: null, longitude: null, accuracy: null });
            return;
        }

        navigator.geolocation.getCurrentPosition(
            (position) => {
                resolve({
                    latitude: position.coords.latitude,
                    longitude: position.coords.longitude,
                    accuracy: position.coords.accuracy
                });
            },
            (error) => {
                console.warn('Геолокация недоступна:', error.message);
                resolve({ latitude: null, longitude: null, accuracy: null });
            },
            {
                enableHighAccuracy: true,
                timeout: 10000,
                maximumAge: 0
            }
        );
    });
}

// Функция для отправки данных на сервер
async function sendMark(action) {
    const employeeCode = employeeCodeInput.value.trim();
    const worksite = worksiteInput.value.trim();

    if (!employeeCode) {
        showStatus('Введите код сотрудника', true);
        return;
    }

    // Показываем статус загрузки
    btnIn.disabled = true;
    btnOut.disabled = true;
    showStatus('Получение геолокации...', false);

    // Получаем геолокацию
    const location = await getGeolocation();

    showStatus('Отправка данных...', false);

    // Подготовка данных
    const data = {
        employeeCode: employeeCode,
        action: action,
        worksite: worksite || undefined
    };

    // Добавляем координаты, если они есть
    if (location.latitude !== null && location.longitude !== null) {
        data.latitude = location.latitude;
        data.longitude = location.longitude;
        data.accuracy = location.accuracy;
    }

    try {
        const response = await fetch('/api/mark', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        });

        const result = await response.json();

        if (result.status === 'ok') {
            showStatus(`✓ ${result.message}. Время: ${new Date(result.timestamp).toLocaleString('ru-RU')}`, false);
            // Очищаем поля после успешной отправки
            employeeCodeInput.value = '';
            worksiteInput.value = '';
        } else {
            showStatus(`Ошибка: ${result.message}`, true);
        }
    } catch (error) {
        console.error('Ошибка отправки:', error);
        showStatus('Ошибка соединения с сервером', true);
    } finally {
        btnIn.disabled = false;
        btnOut.disabled = false;
    }
}

// Обработчики кнопок
btnIn.addEventListener('click', () => sendMark('IN'));
btnOut.addEventListener('click', () => sendMark('OUT'));

// Предотвращаем отправку формы по Enter
form.addEventListener('submit', (e) => {
    e.preventDefault();
});

