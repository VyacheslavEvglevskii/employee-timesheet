require('dotenv').config();

console.log('=== Проверка переменных окружения ===\n');

const checks = {
  'PORT': process.env.PORT,
  'SHEET_ID': process.env.SHEET_ID,
  'GOOGLE_SERVICE_ACCOUNT_EMAIL': process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
  'GOOGLE_PRIVATE_KEY': process.env.GOOGLE_PRIVATE_KEY
};

let allOk = true;

for (const [key, value] of Object.entries(checks)) {
  if (key === 'PORT') {
    console.log(`${key}: ${value || 'не задан (будет использован 3000)'}`);
  } else if (key === 'GOOGLE_PRIVATE_KEY') {
    if (value) {
      const length = value.length;
      const hasQuotes = value.startsWith('"') || value.startsWith("'");
      const hasEscapedNewlines = value.includes('\\n');
      const hasRealNewlines = value.includes('\n') && !value.includes('\\n');
      const hasSpacesAfterBegin = value.includes('-----BEGIN PRIVATE KEY----- ');
      console.log(`${key}: задан (${length} символов)`);
      console.log(`  - Начинается с кавычек: ${hasQuotes ? 'да' : 'нет'}`);
      console.log(`  - Содержит \\n (экранированные переносы): ${hasEscapedNewlines ? 'да ✓' : 'нет ❌'}`);
      if (hasRealNewlines) {
        console.log(`  ⚠️  ВНИМАНИЕ: Ключ содержит реальные переносы строк вместо \\n!`);
        allOk = false;
      }
      if (hasSpacesAfterBegin) {
        console.log(`  ⚠️  ВНИМАНИЕ: После "-----BEGIN PRIVATE KEY-----" есть пробел вместо \\n!`);
        allOk = false;
      }
      console.log(`  - Первые 50 символов: ${value.substring(0, 50).replace(/\n/g, '\\n')}...`);
      
      if (!value.includes('BEGIN PRIVATE KEY')) {
        console.log(`  ⚠️  ВНИМАНИЕ: Ключ не содержит "BEGIN PRIVATE KEY"!`);
        allOk = false;
      }
      
      if (!hasEscapedNewlines && !hasRealNewlines) {
        console.log(`  ❌ КРИТИЧЕСКАЯ ПРОБЛЕМА: Ключ не содержит переносов строк!`);
        console.log(`     Это вызовет ошибку "DECODER routines::unsupported"`);
        console.log(`     Решение: Замените все реальные переносы строк на \\n`);
        console.log(`     Или используйте формат с кавычками и \\n:`);
        console.log(`     GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\\nMII...\\n-----END PRIVATE KEY-----\\n"`);
        allOk = false;
      }
    } else {
      console.log(`${key}: ❌ НЕ ЗАДАН`);
      allOk = false;
    }
  } else {
    if (value) {
      console.log(`${key}: ✓ задан`);
      if (key === 'GOOGLE_SERVICE_ACCOUNT_EMAIL') {
        console.log(`  Значение: ${value}`);
      } else if (key === 'SHEET_ID') {
        console.log(`  Значение: ${value}`);
      }
    } else {
      console.log(`${key}: ❌ НЕ ЗАДАН`);
      allOk = false;
    }
  }
  console.log('');
}

if (allOk && checks.GOOGLE_PRIVATE_KEY) {
  // Проверка формата ключа
  const key = checks.GOOGLE_PRIVATE_KEY.replace(/^["']|["']$/g, '').replace(/\\n/g, '\n');
  if (!key.startsWith('-----BEGIN PRIVATE KEY-----')) {
    console.log('⚠️  ВНИМАНИЕ: Приватный ключ имеет неправильный формат!');
    console.log('   Ключ должен начинаться с "-----BEGIN PRIVATE KEY-----"');
    allOk = false;
  }
  if (!key.endsWith('-----END PRIVATE KEY-----\n') && !key.endsWith('-----END PRIVATE KEY-----')) {
    console.log('⚠️  ВНИМАНИЕ: Приватный ключ имеет неправильный формат!');
    console.log('   Ключ должен заканчиваться на "-----END PRIVATE KEY-----"');
    allOk = false;
  }
}

console.log('=====================================');
if (allOk) {
  console.log('✓ Все необходимые переменные заданы!');
  console.log('✓ Формат приватного ключа корректен!');
} else {
  console.log('❌ Обнаружены проблемы с переменными окружения!');
  console.log('\n📝 Инструкция по исправлению:');
  console.log('1. Откройте файл .env');
  console.log('2. Найдите строку GOOGLE_PRIVATE_KEY');
  console.log('3. Убедитесь, что ключ содержит \\n (обратный слэш + n) вместо реальных переносов');
  console.log('4. Правильный формат:');
  console.log('   GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\\nMII...\\n-----END PRIVATE KEY-----\\n"');
  console.log('\n💡 Совет: Скопируйте private_key из JSON файла сервисного аккаунта');
  console.log('   и замените все реальные переносы строк на \\n');
}

