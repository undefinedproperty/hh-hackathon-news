import * as cron from 'node-cron';
import Source from '../models/Source';
import NewsRaw from '../models/NewsRaw';
import RSSParser from './RSSParser';
import { aiIngestor } from './AIIngestor';
import { NewsDeduplicationService } from './deduplication';
import { DailyDigestService } from './DailyDigestService';
import { sendDailyDigest } from './TelegramBot';
import User from '../models/User';

export class CronService {
  private jobs: Map<string, cron.ScheduledTask> = new Map();
  private active = true;
  private deduplicationService: NewsDeduplicationService;
  private dailyDigestService: DailyDigestService;

  constructor() {
    this.deduplicationService = new NewsDeduplicationService();
    this.dailyDigestService = new DailyDigestService();
  }

  async initialize(): Promise<void> {
    await this.deduplicationService.initialize();
    console.log('CronService deduplication service initialized');
  }

  start(): void {
    console.log('CronService started');
    if (this.active) {
      this.scheduleParseRssFeedsJob();
      this.scheduleNormalizationJob();
      this.scheduleDailyDigestJob();
    }
  }

  stop(): void {
    console.log('Stopping all cron jobs');
    this.jobs.forEach((job, name) => {
      job.stop();
      console.log(`Stopped job: ${name}`);
    });
    this.jobs.clear();
  }

  private scheduleParseRssFeedsJob(): void {
    const parseRssFeedsJob = cron.schedule(
      '*/5 * * * *',
      async () => {
        console.log('parseRssFeedsJob - ' + new Date().toISOString());
        const sources = await Source.find({ type: 'rss' });
        for (const source of sources) {
          try {
            const { isValid, metadata } = await RSSParser.validate(source.link);
            if (isValid) {
              source.metadata = metadata as any;
              // Ensure title is set from metadata if not already present
              if (!source.title && metadata?.title) {
                source.title = metadata.title;
              }
              await source.save();
              
              for (const item of metadata?.items || []) {
                try {
                  await NewsRaw.findOneAndUpdate(
                    {
                      sourceId: source._id,
                      $or: [
                        { guid: item.guid },
                        { link: item.link }
                      ]
                    },
                    {
                      sourceId: source._id,
                      sourceUrl: source.link,
                      rawData: item,
                      guid: item.guid,
                      title: item.title,
                      link: item.link,
                      pubDate: item.pubDate || item.isoDate,
                    },
                    { 
                      upsert: true, 
                      new: true,
                      setDefaultsOnInsert: true 
                    }
                  );
                  console.log(`Saved/Updated news item: ${item.title}`);
                } catch (error) {
                  console.error(`Error saving news item: ${item.title}`, error);
                }
              }
            }
          } catch (error) {
            console.error(`Error processing source ${source.link}:`, error);
          }
        }
      },
      {
        timezone: 'Europe/Moscow',
      }
    );

    this.jobs.set('parse-rss-feeds', parseRssFeedsJob);
    parseRssFeedsJob.start();
    console.log('RSS feeds parsing job scheduled to run every minute');
  }

  private scheduleNormalizationJob(): void {
    const normalizationJob = cron.schedule(
      '*/8 * * * *', // Every 10 minutes
      async () => {
        console.log('normalizationJob - ' + new Date().toISOString());
        
        // Find unnormalized news items
        const unnormalizedNews = await NewsRaw.find({ hasNormalized: false });
        
        if (unnormalizedNews.length === 0) {
          console.log('No unnormalized news items found');
          return;
        }

        console.log(`Found ${unnormalizedNews.length} unnormalized news items`);

        // Process in batches
        for (const newsItem of unnormalizedNews) {
          try {
            console.log(`Processing news item: ${newsItem.title}`);
            
            // Call AI ingestor
            const aiResponse = await aiIngestor.ingestAndSave(newsItem.rawData);
            
            // Parse AI response
            let normalizedData;
            try {
              // Handle both JSON string and markdown-wrapped JSON
              const jsonMatch = aiResponse.match(/```(?:json)?\s*({[\s\S]*?})\s*```/);
              const jsonContent = jsonMatch ? jsonMatch[1] : aiResponse;
              normalizedData = JSON.parse(jsonContent);
            } catch (parseError) {
              console.error(`Failed to parse AI response for ${newsItem.title}:`, parseError);
              continue;
            }

            // Process normalized data through deduplication service
            if (normalizedData.normalized && normalizedData.normalized.length > 0) {
              const normalizedItem = normalizedData.normalized[0];
              
              console.log(`\n🔍 DEDUPLICATION CHECK for: "${normalizedItem.title_canonical}"`);
              console.log(`📅 Published: ${normalizedItem.published_at}`);
              console.log(`🏷️  Source: ${normalizedItem.source}`);
              console.log(`📄 Summary: ${(normalizedItem.summary_short || '').substring(0, 100)}...`);
              
              // Prepare news data for deduplication check
              // Ensure source is not null - fallback to rawData creator or unknown source
              const sourceValue = normalizedItem.source || newsItem.rawData?.creator || newsItem.rawData?.author || 'Unknown Source';

              const newsForDeduplication = {
                newsRawId: newsItem._id,
                sourceId: newsItem.sourceId,
                title: normalizedItem.title_canonical,
                content: normalizedItem.summary_short || '',
                description: normalizedItem.summary_short,
                summaryShortOriginal: normalizedItem.summary_short_original,
                titleCanonicalOriginal: normalizedItem.title_canonical_original,
                source: sourceValue,
                lang: normalizedItem.lang,
                theme: normalizedItem.theme,
                url: normalizedItem.url,
                created_at: normalizedItem.published_at ? new Date(normalizedItem.published_at) : new Date(),
                externalId: normalizedItem.external_id,
                topics: normalizedItem.topics || [],
                tags: normalizedItem.tags || [],
                entities: normalizedItem.entities || { orgs: [], people: [], products: [] },
                duplicateHint: normalizedItem.duplicate_hint,
                publishedAt: normalizedItem.published_at,
                score: normalizedItem.score || null,
              };

              console.log(`🔧 Source validation - AI source: "${normalizedItem.source}", Raw creator: "${newsItem.rawData?.creator}", Final source: "${sourceValue}"`);

              console.log(`🔍 Calling deduplication service...`);
              
              // Check for duplicates and save if unique
              const result = await this.deduplicationService.processNews(newsForDeduplication);
              
              console.log(`📊 Deduplication result: saved=${result.saved}, reason="${result.reason}"`);
              if (result.original) {
                console.log(`📰 Original found: "${result.original.title}" (${result.original.source})`);
              }
              
              if (result.saved) {
                // Mark as normalized in news-raw
                await NewsRaw.findByIdAndUpdate(newsItem._id, { hasNormalized: true });
                console.log(`✅ SUCCESS: Saved "${normalizedItem.title_canonical}"`);
              } else {
                // Mark as normalized but duplicate in news-raw
                await NewsRaw.findByIdAndUpdate(newsItem._id, { 
                  hasNormalized: true,
                  isDuplicate: true,
                  duplicateReason: result.reason
                });
                console.log(`⚠️ DUPLICATE: Rejected "${normalizedItem.title_canonical}" - ${result.reason}`);
              }
            }
          } catch (error) {
            console.error(`Error processing news item ${newsItem.title}:`, error);
          }
        }
      },
      {
        timezone: 'Europe/Moscow',
      }
    );

    this.jobs.set('normalization', normalizationJob);
    normalizationJob.start();
    console.log('Normalization job scheduled to run every 2 minutes');
  }

  private scheduleDailyDigestJob(): void {
    const dailyDigestJob = cron.schedule(
      '* * * * *', // Every minute
      async () => {
        try {
          // Get all active users
          const users = await User.find({ isActive: true });

          for (const user of users) {
            try {
              // Check if digest is enabled and if it's time to send digest for this user
              if (!user.dailyDigestEnabled) {
                continue; // Skip users who have disabled digest
              }

              if (this.dailyDigestService.shouldSendDigest(user)) {
                console.log(`📨 Preparing daily digest for user ${user.telegramId} at ${user.dailyDigestTime}`);

                if (!user._id) {
                  return;
                }

                // Get top news by theme
                const topNewsByTheme = await this.dailyDigestService.getTopNewsByThemeForUser(
                  user._id.toString()
                );

                // Format messages (one per theme)
                const digestMessages = this.dailyDigestService.formatDigestMessages(topNewsByTheme);

                // Send via Telegram
                await sendDailyDigest(user, digestMessages);

                console.log(`✅ Daily digest sent successfully to user ${user.telegramId}`);
              }
            } catch (error) {
              console.error(`❌ Error sending daily digest to user ${user.telegramId}:`, error);
            }
          }
        } catch (error) {
          console.error('❌ Error in daily digest job:', error);
        }
      },
      {
        timezone: 'Europe/Moscow',
      }
    );

    this.jobs.set('daily-digest', dailyDigestJob);
    dailyDigestJob.start();
    console.log('Daily digest job scheduled to run every minute');
  }
}
