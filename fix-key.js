/**
 * Утилита для исправления формата GOOGLE_PRIVATE_KEY в .env файле
 * 
 * Использование:
 * node fix-key.js
 * 
 * Утилита попытается автоматически исправить формат ключа,
 * заменяя пробелы и реальные переносы на правильный формат.
 */

const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '.env');

if (!fs.existsSync(envPath)) {
  console.error('❌ Файл .env не найден!');
  console.error('Создайте файл .env на основе .env.example');
  process.exit(1);
}

let envContent = fs.readFileSync(envPath, 'utf8');
const lines = envContent.split('\n');

let fixed = false;
const fixedLines = lines.map((line, index) => {
  if (line.startsWith('GOOGLE_PRIVATE_KEY=')) {
    const value = line.substring('GOOGLE_PRIVATE_KEY='.length);
    
    // Проверяем, есть ли проблема
    const hasNewlines = value.includes('\\n') || value.includes('\n');
    const hasSpacesAfterBegin = value.includes('-----BEGIN PRIVATE KEY----- ');
    
    if (!hasNewlines || hasSpacesAfterBegin) {
      console.log(`📝 Найдена строка ${index + 1} с GOOGLE_PRIVATE_KEY`);
      console.log(`   Текущий формат требует исправления`);
      
      // Убираем кавычки для обработки
      let fixedValue = value.replace(/^["']|["']$/g, '');
      
      // Исправляем пробелы после BEGIN и END
      fixedValue = fixedValue.replace(/-----BEGIN PRIVATE KEY----- /g, '-----BEGIN PRIVATE KEY-----\n');
      fixedValue = fixedValue.replace(/-----END PRIVATE KEY----- /g, '-----END PRIVATE KEY-----\n');
      
      // Если нет экранированных переносов, но есть реальные - заменяем на экранированные
      if (!fixedValue.includes('\\n') && fixedValue.includes('\n')) {
        fixedValue = fixedValue.replace(/\n/g, '\\n');
      }
      
      // Если вообще нет переносов, но есть пробелы в нужных местах - заменяем
      if (!fixedValue.includes('\\n') && !fixedValue.includes('\n')) {
        // Пытаемся найти паттерн с пробелами и заменить их на \n
        // Это сложная логика, лучше попросить пользователя сделать вручную
        console.log(`   ⚠️  Ключ не содержит переносов строк`);
        console.log(`   Нужно вручную добавить \\n после -----BEGIN PRIVATE KEY-----`);
        console.log(`   и перед -----END PRIVATE KEY-----`);
        console.log(`   Пример правильного формата:`);
        console.log(`   GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\\nMII...\\n-----END PRIVATE KEY-----\\n"`);
        return line; // Не меняем, если не можем автоматически исправить
      }
      
      // Обёртываем обратно в кавычки для безопасности
      if (!fixedValue.startsWith('"') && !fixedValue.startsWith("'")) {
        fixedValue = `"${fixedValue}"`;
      }
      
      fixed = true;
      console.log(`   ✓ Формат исправлен`);
      return `GOOGLE_PRIVATE_KEY=${fixedValue}`;
    }
  }
  return line;
});

if (fixed) {
  // Создаём резервную копию
  const backupPath = envPath + '.backup.' + Date.now();
  fs.writeFileSync(backupPath, envContent, 'utf8');
  console.log(`\n💾 Создана резервная копия: ${backupPath}`);
  
  // Сохраняем исправленный файл
  fs.writeFileSync(envPath, fixedLines.join('\n'), 'utf8');
  console.log(`✓ Файл .env обновлён!`);
  console.log(`\n⚠️  ВАЖНО: Проверьте результат командой: node check-env.js`);
  console.log(`   Если проблема осталась, откройте .env и исправьте вручную`);
} else {
  console.log('✓ Формат ключа уже корректен или не требует автоматического исправления');
  console.log('\nЕсли проблема сохраняется, проверьте:');
  console.log('1. Ключ должен содержать \\n (обратный слэш + n)');
  console.log('2. После -----BEGIN PRIVATE KEY----- должен быть \\n, а не пробел');
  console.log('3. Перед -----END PRIVATE KEY----- должен быть \\n');
}

