import User, { IUser } from '../models/User';
import NewsNormalized, { INewsNormalized } from '../models/NewsNormalized';
import Source from '../models/Source';
import mongoose from 'mongoose';

interface TopNewsByTheme {
  theme: string;
  news: INewsNormalized[];
}

const themes = ['Политика', 'Экономика','Технологии','Медицина','Культура','Спорт','Образование', 'Общество','Право','Экология'];

export class DailyDigestService {
  /**
   * Get top 5 news by score for each theme from user's subscribed sources
   * Only returns news from the last 24 hours
   */
  async getTopNewsByThemeForUser(userId: string): Promise<TopNewsByTheme[]> {
    const user = await User.findById(userId);

    if (!user || !user.subscribedSources || user.subscribedSources.length === 0) {
      return [];
    }

    // Get only enabled source IDs
    const enabledSourceIds = user.subscribedSources
      .filter((sub: any) => sub.enabled)
      .map((sub: any) => sub.sourceId);

    if (enabledSourceIds.length === 0) {
      return [];
    }

    // Get subscribed sources to extract their URLs
    const subscribedSources = await Source.find({
      _id: { $in: enabledSourceIds }
    });

    const sourceUrls = subscribedSources.map(s => s.link);

    // Get news from the last 24 hours
    const oneDayAgo = new Date();
    oneDayAgo.setHours(oneDayAgo.getHours() - 24);

    // Fetch all news from subscribed sources from the last 24 hours
    const allNews = await NewsNormalized.find({
      sourceId: { $in: enabledSourceIds },
      createdAt: { $gte: oneDayAgo },
      score: { $exists: true, $ne: null }
    }).sort({ score: -1 });

    if (allNews.length === 0) {
      return [];
    }

    // Group news by theme
    const newsByTheme = new Map<string, INewsNormalized[]>();

    for (const news of allNews) {
      const theme = news.theme || 'Без тематики';

      if (!newsByTheme.has(theme)) {
        newsByTheme.set(theme, []);
      }

      newsByTheme.get(theme)!.push(news);
    }

    // Get top 5 news for each theme
    const result: TopNewsByTheme[] = [];

    for (const [theme, newsList] of newsByTheme) {
      // Sort by score descending and take top 5
      const topNews = newsList
        .sort((a, b) => (b.score || 0) - (a.score || 0))
        .slice(0, 5);

      result.push({
        theme,
        news: topNews
      });
    }

    // Sort themes by total score of their top news
    result.sort((a, b) => {
      const scoreA = a.news.reduce((sum, news) => sum + (news.score || 0), 0);
      const scoreB = b.news.reduce((sum, news) => sum + (news.score || 0), 0);
      return scoreB - scoreA;
    });

    return result;
  }

  /**
   * Format digest messages for Telegram
   * Returns array of messages - one header message and one message per theme
   */
  formatDigestMessages(topNewsByTheme: TopNewsByTheme[]): string[] {
    const messages: string[] = [];

    if (topNewsByTheme.length === 0) {
      messages.push('📰 За последние 24 часа новых новостей из ваших источников не найдено.');
      return messages;
    }

    // Header message
    let headerMessage = '📰 *Ежедневная сводка новостей*\n\n';
    headerMessage += `📅 ${new Date().toLocaleDateString('ru-RU', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    })}\n\n`;
    headerMessage += `Найдено ${topNewsByTheme.length} тематик с новостями`;
    messages.push(headerMessage);

    // One message per theme
    for (const themeGroup of topNewsByTheme) {
      if (themes.indexOf(themeGroup.theme) === -1) {
        console.log('Skip because of AI error')
      } else {

        let themeMessage = `🏷 *${themeGroup.theme}*\n\n`;

        themeGroup.news.forEach((news, index) => {
          themeMessage += `${index + 1}. [${news.titleCanonical}](${news.url})\n`;
          themeMessage += '\n';
        });

        messages.push(themeMessage);
      }
    }

    // Footer message
    const footerMessage = '───────────────────\n💡 Настроить время получения сводки можно в настройках профиля';
    messages.push(footerMessage);

    return messages;
  }

  /**
   * Check if current time matches user's digest time
   */
  shouldSendDigest(user: IUser): boolean {
    const now = new Date();

    // Convert to Moscow timezone
    const moscowTime = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Moscow' }));
    const currentHour = moscowTime.getHours();
    const currentMinute = moscowTime.getMinutes();

    const [digestHour, digestMinute] = user.dailyDigestTime.split(':').map(Number);

    console.log('Should send digest?', { user, currentHour, currentMinute, digestHour, digestMinute });
    return currentHour === digestHour && currentMinute === digestMinute;
  }
}
