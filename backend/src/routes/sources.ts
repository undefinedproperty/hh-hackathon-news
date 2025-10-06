import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import Source from '../models/Source';
import User, { IUser } from '../models/User';
import RSSParser from '../services/RSSParser';
import { rssDeduplicationService } from '../services/RSSDeduplication';
import NewsNormalized from '../models/NewsNormalized';
import mongoose from 'mongoose';

interface AuthenticatedRequest extends Request {
  user?: IUser;
}

const router = Router();

const createSourceSchema = z.object({
  link: z.string().min(1, 'Link is required'),
  type: z.enum(['rss', 'api', 'telegram']),
  public: z.boolean().default(false),
});



router.post('/', async (req: AuthenticatedRequest, res: Response) => {
  try {
    console.log('POST /sources - Request body:', req.body);
    console.log('POST /sources - User:', req.user ? { id: req.user._id, telegramId: req.user.telegramId } : 'No user');

    const validatedData = createSourceSchema.parse(req.body);
    const user = req.user as IUser;

    // 1. Валидация RSS ссылки
    const { isValid, metadata } = await RSSParser.validate(validatedData.link);
    if (!isValid) {
      return res.status(400).json({
        success: false,
        error: 'Invalid RSS link',
        message: 'The provided URL does not contain a valid RSS feed'
      });
    }

    // 2. Проверка на дублирование с помощью продвинутого алгоритма
    const duplicationCheck = await rssDeduplicationService.checkForDuplicate(
      validatedData.link,
      metadata || {}
    );

    if (duplicationCheck.isDuplicate && duplicationCheck.existingSource) {
      return res.status(409).json({
        success: false,
        error: 'Duplicate source detected',
        message: `This RSS source appears to be a duplicate of an existing source`,
        details: {
          reason: duplicationCheck.reason,
          confidence: Math.round(duplicationCheck.confidence * 100),
          existingSource: {
            id: duplicationCheck.existingSource._id,
            title: duplicationCheck.existingSource.title || duplicationCheck.existingSource.metadata?.title,
            url: duplicationCheck.existingSource.link,
            createdAt: duplicationCheck.existingSource.createdAt
          }
        },
        suggestions: [
          'Check if you meant to add the existing source',
          'Verify that this is actually a different RSS feed',
          'Contact admin if you believe this is an error'
        ]
      });
    }

    // 3. Создание нового источника, если дублей не найдено
    const source = new Source({
      ...validatedData,
      owner: user._id,
      metadata,
      title: metadata?.title || 'Untitled Source',
      description: metadata?.description,
      category: 'general', // Можно добавить категоризацию позже
      language: 'ru' // По умолчанию русский
    });

    await source.save();

    console.log(`✅ New RSS source created: ${source.title} (${source.link})`);

    res.status(201).json({
      success: true,
      data: {
        id: source._id,
        title: source.title,
        url: source.link,
        description: source.description,
        category: source.category,
        language: source.language,
        public: source.public,
        createdAt: source.createdAt
      },
      message: 'RSS source successfully added'
    });

  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'Validation error',
        details: error.issues
      });
    }

    console.error('Error creating RSS source:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: 'Failed to create RSS source'
    });
  }
});

// Получение всех доступных источников (публичные) с информацией о подписках пользователя
router.get('/', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { category, search, active } = req.query;

    let query: any = { public: true };

    if (category) {
      query.category = category;
    }

    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }

    if (active !== undefined) {
      query.isActive = active === 'true';
    }

    const sources = await Source.find(query).sort({ createdAt: -1 });

    // Получаем информацию о подписках пользователя, если он авторизован
    let userSubscriptions: any[] = [];
    if (req.user) {
      const user = await User.findById(req.user._id);
      if (user && user.subscribedSources) {
        userSubscriptions = user.subscribedSources;
      }
    }

    // Убираем большой массив items из metadata для экономии трафика и добавляем информацию о подписках
    const cleanedSources = sources.map(source => {
      const userSubscription = userSubscriptions.find((sub: any) =>
        sub.sourceId.toString() === (source._id as mongoose.Types.ObjectId).toString()
      );

      return {
        _id: source._id,
        title: source.metadata?.title || 'Untitled',
        url: source.link,
        description: source.metadata?.description || source.description,
        category: source.category,
        language: source.language,
        favicon: source.favicon,
        isActive: source.active,
        createdAt: source.createdAt,
        updatedAt: source.updatedAt,
        // Новые поля для информации о подписке пользователя
        isUserSubscribed: !!userSubscription,
        userSubscriptionEnabled: userSubscription?.enabled ?? false,
        userSubscribedAt: userSubscription?.subscribedAt
      };
    });

    res.json({
      success: true,
      data: cleanedSources,
      meta: {
        total: cleanedSources.length,
        userSubscriptionsCount: userSubscriptions.length
      }
    });
  } catch (error) {
    console.error('Error fetching sources:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// Поиск источников
router.get('/search', async (req: Request, res: Response) => {
  try {
    const { q } = req.query;

    if (!q || typeof q !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Search query is required'
      });
    }

    const sources = await Source.find({
      public: true,
      isActive: true,
      $or: [
        { title: { $regex: q, $options: 'i' } },
        { description: { $regex: q, $options: 'i' } },
        { url: { $regex: q, $options: 'i' } }
      ]
    }).sort({ createdAt: -1 });

    res.json({
      success: true,
      data: sources
    });
  } catch (error) {
    console.error('Error searching sources:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// Получение категорий источников
router.get('/categories', async (req: Request, res: Response) => {
  try {
    const categories = await Source.distinct('category', { public: true, isActive: true });

    res.json({
      success: true,
      data: categories.filter(Boolean) // Убираем null и undefined
    });
  } catch (error) {
    console.error('Error fetching categories:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// Проверка источника на дублирование (без создания)
router.post('/check-duplicate', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { link } = req.body;

    if (!link) {
      return res.status(400).json({
        success: false,
        error: 'Link is required'
      });
    }

    // Валидируем RSS
    const { isValid, metadata } = await RSSParser.validate(link);
    if (!isValid) {
      return res.status(400).json({
        success: false,
        error: 'Invalid RSS link'
      });
    }

    // Проверяем дублирование
    const duplicationCheck = await rssDeduplicationService.checkForDuplicate(link, metadata || {});

    res.json({
      success: true,
      data: {
        isDuplicate: duplicationCheck.isDuplicate,
        confidence: Math.round(duplicationCheck.confidence * 100),
        reason: duplicationCheck.reason,
        existingSource: duplicationCheck.existingSource ? {
          id: duplicationCheck.existingSource._id,
          title: duplicationCheck.existingSource.title,
          url: duplicationCheck.existingSource.link,
          createdAt: duplicationCheck.existingSource.createdAt
        } : null,
        metadata: {
          title: metadata?.title,
          description: metadata?.description,
          link: metadata?.link
        }
      }
    });

  } catch (error) {
    console.error('Error checking duplicate:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// Поиск потенциальных дублей для источника
router.get('/:sourceId/duplicates', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { sourceId } = req.params;
    const { threshold = 0.7 } = req.query;

    const result = await rssDeduplicationService.findPotentialDuplicates(
      sourceId,
      parseFloat(threshold as string)
    );

    res.json({
      success: true,
      data: {
        source: {
          id: result.source._id,
          title: result.source.title,
          url: result.source.link,
          createdAt: result.source.createdAt
        },
        duplicates: result.duplicates.map(dup => ({
          source: {
            id: dup.source._id,
            title: dup.source.title,
            url: dup.source.link,
            createdAt: dup.source.createdAt
          },
          confidence: Math.round(dup.confidence * 100),
          reason: dup.reason
        }))
      }
    });

  } catch (error) {
    console.error('Error finding duplicates:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// Получение статистики дублирования
router.get('/admin/duplication-stats', async (req: AuthenticatedRequest, res: Response) => {
  try {
    // Добавим проверку прав администратора при необходимости
    const stats = await rssDeduplicationService.getDuplicationStats();

    res.json({
      success: true,
      data: {
        totalSources: stats.totalSources,
        potentialDuplicates: stats.potentialDuplicates,
        duplicateGroups: stats.duplicateGroups.map(group => ({
          domain: group.domain,
          sourceCount: group.sources.length,
          avgConfidence: Math.round(group.avgConfidence * 100),
          sources: group.sources.map(source => ({
            id: source._id,
            title: source.title,
            url: source.link,
            createdAt: source.createdAt
          }))
        }))
      }
    });

  } catch (error) {
    console.error('Error getting duplication stats:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// Подписка на источник
router.post('/:sourceId/subscribe', async (req: AuthenticatedRequest, res: Response) => {
  const maxRetries = 3;
  let retries = 0;

  while (retries < maxRetries) {
    try {
      const { sourceId } = req.params;
      const user = req.user as IUser;

      // Проверяем, что источник существует и публичный
      const source = await Source.findOne({ _id: sourceId, public: true, active: true });
      if (!source) {
        return res.status(404).json({
          success: false,
          error: 'Source not found or not available'
        });
      }

      // Находим пользователя
      const currentUser = await User.findById(user._id);
      if (!currentUser) {
        return res.status(404).json({
          success: false,
          error: 'User not found'
        });
      }

      // Проверяем, не подписан ли уже пользователь на этот источник
      const existingSubscription = currentUser.subscribedSources.find((sub: any) =>
        sub.sourceId.toString() === sourceId
      );

      if (existingSubscription) {
        // Если уже подписан, просто включаем источник
        existingSubscription.enabled = true;
        await currentUser.save();
      } else {
        // Добавляем новую подписку
        currentUser.subscribedSources.push({
          sourceId: new mongoose.Types.ObjectId(sourceId),
          enabled: true,
          subscribedAt: new Date()
        });
        await currentUser.save();
      }

      return res.json({
        success: true,
        message: 'Successfully subscribed to source'
      });
    } catch (error: any) {
      if (error.name === 'VersionError' && retries < maxRetries - 1) {
        retries++;
        console.log(`Version conflict occurred during subscription, retrying... (attempt ${retries}/${maxRetries})`);
        // Небольшая задержка перед повторной попыткой
        await new Promise(resolve => setTimeout(resolve, 100 * retries));
        continue;
      }

      console.error('Error subscribing to source:', error);
      return res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  }

  return res.status(500).json({
    success: false,
    error: 'Failed to subscribe after multiple attempts'
  });
});

// Отписка от источника
router.post('/:sourceId/unsubscribe', async (req: AuthenticatedRequest, res: Response) => {
  const maxRetries = 3;
  let retries = 0;

  while (retries < maxRetries) {
    try {
      const { sourceId } = req.params;
      const user = req.user as IUser;

      // Находим пользователя
      const currentUser = await User.findById(user._id);
      if (!currentUser) {
        return res.status(404).json({
          success: false,
          error: 'User not found'
        });
      }

      // Проверяем, есть ли подписка на этот источник
      const hasSubscription = currentUser.subscribedSources.some((sub: any) =>
        sub.sourceId.toString() === sourceId
      );

      if (!hasSubscription) {
        return res.json({
          success: true,
          message: 'Already unsubscribed from source'
        });
      }

      // Удаляем источник из подписок
      currentUser.subscribedSources = currentUser.subscribedSources.filter((sub: any) =>
        sub.sourceId.toString() !== sourceId
      );

      await currentUser.save();

      return res.json({
        success: true,
        message: 'Successfully unsubscribed from source'
      });
    } catch (error: any) {
      if (error.name === 'VersionError' && retries < maxRetries - 1) {
        retries++;
        console.log(`Version conflict occurred, retrying... (attempt ${retries}/${maxRetries})`);
        // Небольшая задержка перед повторной попыткой
        await new Promise(resolve => setTimeout(resolve, 100 * retries));
        continue;
      }

      console.error('Error unsubscribing from source:', error);
      return res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  }

  return res.status(500).json({
    success: false,
    error: 'Failed to unsubscribe after multiple attempts'
  });
});

// Включение/выключение источника
router.patch('/:sourceId/toggle', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { sourceId } = req.params;
    const { enabled } = req.body;
    const user = req.user as IUser;

    if (typeof enabled !== 'boolean') {
      return res.status(400).json({
        success: false,
        error: 'Enabled field must be a boolean'
      });
    }

    // Находим пользователя
    const currentUser = await User.findById(user._id);
    if (!currentUser) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Находим подписку на источник
    const subscription = currentUser.subscribedSources.find((sub: any) =>
      sub.sourceId.toString() === sourceId
    );

    if (!subscription) {
      return res.status(404).json({
        success: false,
        error: 'Source subscription not found'
      });
    }

    // Обновляем статус
    subscription.enabled = enabled;
    await currentUser.save();

    res.json({
      success: true,
      message: `Source ${enabled ? 'enabled' : 'disabled'} successfully`
    });
  } catch (error) {
    console.error('Error toggling source status:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// Массовая подписка
router.post('/bulk/subscribe', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { sourceIds } = req.body;
    const user = req.user as IUser;

    if (!Array.isArray(sourceIds)) {
      return res.status(400).json({
        success: false,
        error: 'sourceIds must be an array'
      });
    }

    // Проверяем, что все источники существуют и публичные
    const validSources = await Source.find({
      _id: { $in: sourceIds },
      public: true,
      active: true
    });

    const validSourceIds: mongoose.Types.ObjectId[] = validSources.map(s => s._id as mongoose.Types.ObjectId);

    // Находим пользователя
    const currentUser = await User.findById(user._id);
    if (!currentUser) {
      return res.status(400).json({
        success: false,
        error: 'User not found'
      });
    }

    // Добавляем новые подписки или включаем существующие
    for (const sourceId of validSourceIds) {
      const sourceIdStr = sourceId.toString();
      const existingSubscription = currentUser.subscribedSources.find((sub: any) =>
        sub.sourceId.toString() === sourceIdStr
      );

      if (existingSubscription) {
        existingSubscription.enabled = true;
      } else {
        currentUser.subscribedSources.push({
          sourceId: sourceId,
          enabled: true,
          subscribedAt: new Date()
        });
      }
    }
    await currentUser.save();

    res.json({
      success: true,
      message: `Successfully subscribed to ${validSourceIds.length} sources`
    });
  } catch (error) {
    console.error('Error bulk subscribing to sources:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// Массовая отписка
router.post('/bulk/unsubscribe', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { sourceIds } = req.body;
    const user = req.user as IUser;

    if (!Array.isArray(sourceIds)) {
      return res.status(400).json({
        success: false,
        error: 'sourceIds must be an array'
      });
    }

    // Находим пользователя
    const currentUser = await User.findById(user._id);
    if (!currentUser) {
      return res.status(400).json({
        success: false,
        error: 'User not found'
      });
    }

    // Удаляем подписки
    currentUser.subscribedSources = currentUser.subscribedSources.filter((sub: any) =>
      !sourceIds.includes(sub.sourceId.toString())
    );
    await currentUser.save();

    res.json({
      success: true,
      message: `Successfully unsubscribed from ${sourceIds.length} sources`
    });
  } catch (error) {
    console.error('Error bulk unsubscribing from sources:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// Получение новостей от подписанных источников
router.get('/subscribed/news', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const user = req.user as IUser;

    const currentUser = await User.findById(user._id);
    if (!currentUser || !currentUser.subscribedSources.length) {
      return res.json({
        success: true,
        data: {
          news: [],
          totalCount: 0,
          hasMore: false
        }
      });
    }

    // Получаем только включенные источники
    const enabledSourceIds = currentUser.subscribedSources
      .filter((sub: any) => sub.enabled)
      .map((sub: any) => sub.sourceId);

    if (!enabledSourceIds.length) {
      return res.json({
        success: true,
        data: {
          news: [],
          totalCount: 0,
          hasMore: false
        }
      });
    }

    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const skip = (pageNum - 1) * limitNum;

    // Получаем источники с их названиями (только включенные)
    const subscribedSources = await Source.find({
      _id: { $in: enabledSourceIds }
    });

    const sourceUrls = subscribedSources.map(s => s.link);

    // Получаем новости от подписанных источников
    const [news, totalCount] = await Promise.all([
      NewsNormalized.find({
        source: { $in: sourceUrls }
      })
      .sort({ publishedAt: -1 })
      .skip(skip)
      .limit(limitNum),

      NewsNormalized.countDocuments({
        source: { $in: sourceUrls }
      })
    ]);

    res.json({
      success: true,
      data: {
        news,
        totalCount,
        hasMore: totalCount > skip + news.length,
        subscribedSourcesCount: currentUser.subscribedSources.length
      }
    });
  } catch (error) {
    console.error('Error fetching news from subscribed sources:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// Массовое включение/выключение всех подписанных источников
router.post('/bulk/toggle-all', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { enabled } = req.body;
    const user = req.user as IUser;

    if (typeof enabled !== 'boolean') {
      return res.status(400).json({
        success: false,
        error: 'enabled field must be a boolean'
      });
    }

    // Находим пользователя
    const currentUser = await User.findById(user._id);
    if (!currentUser) {
      return res.status(400).json({
        success: false,
        error: 'User not found'
      });
    }

    if (!currentUser.subscribedSources.length) {
      return res.status(400).json({
        success: false,
        error: 'User has no subscribed sources'
      });
    }

    // Обновляем статус всех подписанных источников
    currentUser.subscribedSources = currentUser.subscribedSources.map((sub: any) => ({
      ...sub,
      enabled
    }));

    await currentUser.save();

    const affectedCount = currentUser.subscribedSources.length;

    res.json({
      success: true,
      message: `Successfully ${enabled ? 'enabled' : 'disabled'} all ${affectedCount} subscribed sources`,
      data: {
        affectedCount,
        enabled
      }
    });
  } catch (error) {
    console.error('Error bulk toggling all sources:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

export { router as sourcesRoutes };
