import { Router, Request, Response } from 'express';
import { z } from 'zod';
import mongoose from 'mongoose';
import User, { IUser } from '../models/User';
import Source from '../models/Source';
import NewsNormalized from '../models/NewsNormalized';

interface AuthenticatedRequest extends Request {
  user?: IUser;
}

const router = Router();

// Получение подписок пользователя на источники
router.get('/:userId/sources', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { userId } = req.params;

    // Проверяем, что пользователь запрашивает свои данные
    if (!req.user || (req.user._id as any).toString() !== userId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied'
      });
    }

    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Инициализируем subscribedSources если его нет (для старых пользователей)
    if (!user.subscribedSources) {
      user.subscribedSources = [];
      await user.save();
    }

    // Migrate old format to new format if needed
    const needsMigration = user.subscribedSources.some((sub: any) =>
      typeof sub === 'string' || sub instanceof mongoose.Types.ObjectId
    );

    if (needsMigration) {
      user.subscribedSources = user.subscribedSources.map((sub: any) => {
        if (typeof sub === 'string' || sub instanceof mongoose.Types.ObjectId) {
          return {
            sourceId: sub,
            enabled: true,
            subscribedAt: new Date()
          };
        }
        return sub;
      });
      await user.save();
    }

    res.json({
      success: true,
      data: {
        userId: user._id,
        subscribedSources: user.subscribedSources.map((sub: any) => ({
          sourceId: sub.sourceId.toString(),
          enabled: sub.enabled,
          subscribedAt: sub.subscribedAt
        }))
      }
    });
  } catch (error) {
    console.error('Error fetching user sources:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// Подписка на источник
router.post('/:userId/sources/:sourceId', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { userId, sourceId } = req.params;

    // Проверяем, что пользователь изменяет свои данные
    if (!req.user || (req.user._id as any).toString() !== userId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied'
      });
    }

    // Проверяем, что источник существует и публичный
    const source = await Source.findOne({ _id: sourceId, public: true, active: true });
    if (!source) {
      return res.status(404).json({
        success: false,
        error: 'Source not found or not available'
      });
    }

    // Проверяем, не подписан ли уже пользователь на этот источник
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    const existingSubscription = user.subscribedSources.find((sub: any) =>
      sub.sourceId.toString() === sourceId
    );

    if (existingSubscription) {
      // Если уже подписан, просто включаем источник
      existingSubscription.enabled = true;
      await user.save();
    } else {
      // Добавляем новую подписку
      user.subscribedSources.push({
        sourceId: new mongoose.Types.ObjectId(sourceId),
        enabled: true,
        subscribedAt: new Date()
      });
      await user.save();
    }

    res.json({
      success: true,
      message: 'Successfully subscribed to source'
    });
  } catch (error) {
    console.error('Error subscribing to source:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// Включение/выключение источника
router.patch('/:userId/sources/:sourceId/toggle', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { userId, sourceId } = req.params;
    const { enabled } = req.body;

    // Проверяем, что пользователь изменяет свои данные
    if (!req.user || (req.user._id as any).toString() !== userId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied'
      });
    }

    if (typeof enabled !== 'boolean') {
      return res.status(400).json({
        success: false,
        error: 'Enabled field must be a boolean'
      });
    }

    // Находим пользователя
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Находим подписку на источник
    const subscription = user.subscribedSources.find((sub: any) =>
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
    await user.save();

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

// Отписка от источника
router.delete('/:userId/sources/:sourceId', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { userId, sourceId } = req.params;

    // Проверяем, что пользователь изменяет свои данные
    if (!req.user || (req.user._id as any).toString() !== userId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied'
      });
    }

    // Находим пользователя
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Удаляем источник из подписок
    user.subscribedSources = user.subscribedSources.filter((sub: any) =>
      sub.sourceId.toString() !== sourceId
    );
    await user.save();

    res.json({
      success: true,
      message: 'Successfully unsubscribed from source'
    });
  } catch (error) {
    console.error('Error unsubscribing from source:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// Получение настроек времени ежедневной сводки
router.get('/:userId/digest-settings', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { userId } = req.params;

    // Проверяем, что пользователь запрашивает свои данные
    if (!req.user || (req.user._id as any).toString() !== userId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied'
      });
    }

    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    res.json({
      success: true,
      data: {
        dailyDigestEnabled: user.dailyDigestEnabled || false,
        dailyDigestTime: user.dailyDigestTime || '20:00'
      }
    });
  } catch (error) {
    console.error('Error fetching digest settings:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// Обновление настроек времени ежедневной сводки
router.patch('/:userId/digest-settings', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { userId } = req.params;
    const { dailyDigestTime, dailyDigestEnabled } = req.body;

    // Проверяем, что пользователь изменяет свои данные
    if (!req.user || (req.user._id as any).toString() !== userId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied'
      });
    }

    // Валидация формата времени если оно передано
    if (dailyDigestTime !== undefined && !/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(dailyDigestTime)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid time format. Use HH:mm format (e.g., 20:00)'
      });
    }

    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Обновляем поля если они переданы
    if (dailyDigestTime !== undefined) {
      user.dailyDigestTime = dailyDigestTime;
    }
    if (dailyDigestEnabled !== undefined) {
      user.dailyDigestEnabled = dailyDigestEnabled;
    }

    await user.save();

    res.json({
      success: true,
      message: 'Daily digest settings updated successfully',
      data: {
        dailyDigestEnabled: user.dailyDigestEnabled,
        dailyDigestTime: user.dailyDigestTime
      }
    });
  } catch (error) {
    console.error('Error updating digest settings:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// Массовые операции с подписками
router.post('/:userId/sources/bulk', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { userId } = req.params;
    const { sourceIds, action } = req.body;

    // Проверяем, что пользователь изменяет свои данные
    if (!req.user || (req.user._id as any).toString() !== userId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied'
      });
    }

    if (!Array.isArray(sourceIds) || !['subscribe', 'unsubscribe'].includes(action)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid request data'
      });
    }

    let updateOperation;
    if (action === 'subscribe') {
      // Проверяем, что все источники существуют и публичные
      const validSources = await Source.find({
        _id: { $in: sourceIds },
        public: true,
        active: true
      });

      const validSourceIds: mongoose.Types.ObjectId[] = validSources.map(s => s._id as mongoose.Types.ObjectId);

      // For bulk subscribe, we need to handle the new format
      const user = await User.findById(userId);
      if (!user) {
        return res.status(400).json({
          success: false,
          error: 'User not found'
        });
      }

      // Add new subscriptions or enable existing ones
      for (const sourceId of validSourceIds) {
        const sourceIdStr = sourceId.toString();
        const existingSubscription = user.subscribedSources.find((sub: any) =>
          sub.sourceId.toString() === sourceIdStr
        );

        if (existingSubscription) {
          existingSubscription.enabled = true;
        } else {
          user.subscribedSources.push({
            sourceId: sourceId,
            enabled: true,
            subscribedAt: new Date()
          });
        }
      }
      await user.save();
      updateOperation = null; // We handled it manually
    } else {
      // For bulk unsubscribe, remove from array
      const user = await User.findById(userId);
      if (!user) {
        return res.status(400).json({
          success: false,
          error: 'User not found'
        });
      }

      user.subscribedSources = user.subscribedSources.filter((sub: any) =>
        !sourceIds.includes(sub.sourceId.toString())
      );
      await user.save();
      updateOperation = null; // We handled it manually
    }

    // Only run update if we have an operation (for backwards compatibility)
    if (updateOperation) {
      await User.findByIdAndUpdate(userId, updateOperation, { new: true });
    }

    res.json({
      success: true,
      message: `Successfully ${action}d ${action === 'subscribe' ? 'to' : 'from'} ${sourceIds.length} sources`
    });
  } catch (error) {
    console.error(`Error bulk ${req.body.action} sources:`, error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// Получение новостей только от подписанных источников
router.get('/:userId/sources/news', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { userId } = req.params;
    const { page = 1, limit = 20 } = req.query;

    // Проверяем, что пользователь запрашивает свои данные
    if (!req.user || (req.user._id as any).toString() !== userId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied'
      });
    }

    const user = await User.findById(userId);
    if (!user || !user.subscribedSources.length) {
      return res.json({
        success: true,
        data: {
          news: [],
          totalCount: 0,
          hasMore: false
        }
      });
    }

    // Get only enabled source IDs
    const enabledSourceIds = user.subscribedSources
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
        subscribedSourcesCount: user.subscribedSources.length
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

export default router;
