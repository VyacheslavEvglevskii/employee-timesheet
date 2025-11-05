# Используем официальный Node.js образ
FROM node:18

# Устанавливаем рабочую директорию
WORKDIR /app

# Копируем package.json и package-lock.json
COPY package*.json ./

# Устанавливаем зависимости (без dev-зависимостей)
RUN npm install --omit=dev

# Копируем всё остальное
COPY . .

# Переменная порта (Cloud Run передаст своё значение)
ENV PORT=8080

# Команда запуска
CMD ["npm", "start"]
