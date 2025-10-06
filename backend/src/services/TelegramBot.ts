import TelegramBot from 'node-telegram-bot-api';
import { generateLoginToken } from '../config/jwt';
import { IUser } from '../models/User';

const token = process.env.TELEGRAM_BOT_API_KEY!;
const bot = new TelegramBot(token, { polling: true });

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

/**
 * Send daily digest to user via Telegram
 * Sends each topic as a separate message to avoid length limits
 */
export async function sendDailyDigest(user: IUser, digestMessages: string[]): Promise<void> {
  try {
    for (const message of digestMessages) {
      await bot.sendMessage(user.telegramId, message, {
        parse_mode: 'Markdown',
        disable_web_page_preview: true
      });
      // Small delay between messages to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    console.log(`✅ Daily digest sent to user ${user.telegramId} (${digestMessages.length} messages)`);
  } catch (error) {
    console.error(`❌ Error sending daily digest to user ${user.telegramId}:`, error);
    throw error;
  }
}

bot.on('message', (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text?.toLowerCase();

  console.log(text);
  if (text === '/login' || text === 'войти' || text === '/start' || text === '/start login') {
    try {
      const loginToken = generateLoginToken(chatId);
      const loginUrl = `${FRONTEND_URL}/auth/telegram?token=${loginToken}`;

      bot.sendMessage(
        chatId,
        `🔐 Нажмите на кнопку ниже для авторизации (срок действия ссылки 2 минуты):\n\n`,
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [[{ text: 'Войти', url: loginUrl }]],
          },
        }
      );
    } catch (error) {
      console.error('Error generating login token:', error);
      bot.sendMessage(
        chatId,
        '❌ Произошла ошибка при генерации ссылки для авторизации. Пожалуйста, попробуйте снова.',
        {
          parse_mode: 'Markdown',
        }
      );
    }
  } else {
    bot.sendMessage(chatId, 'Неизвестная команда. Используйте /login для получения ссылки для авторизации.');
  }
});

bot.on('polling_error', (error) => {
  console.error('Telegram polling error:', error);
});

export default bot;
