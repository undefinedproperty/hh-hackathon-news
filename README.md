#### HH Hackathon

Используется модель GPT-OSS-120b - https://huggingface.co/openai/gpt-oss-120b для анализа новостей

Для настройки фронта:

- Создать .env файл
- По примеру с .env.example из /frontend указать переменные
- npm run install && npm run dev

Для настройки бэка:

- Создать .env файл
- По примеру с .env.example из /backend указать переменные
- - Указать AI_AGENT_ENDPOINT с адресом, где запущен сервис с моделью gpt-oss-120b. По необходимости указать и AI_AGENT_API_KEY
- - TELEGRAM_BOT_API_KEY взять после создания бота в @BotFather
- npm run install && npm run dev