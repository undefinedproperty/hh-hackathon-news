// Типы данных для источников
export interface Source {
  _id: string;
  title: string;
  url: string;
  description?: string;
  category?: string;
  isActive: boolean;
  language?: string;
  favicon?: string;
  createdAt: string;
  updatedAt: string;
}

export interface UserSubscription {
  sourceId: string;
  enabled: boolean;
  subscribedAt: string;
}

export interface UserSources {
  subscribedSources: UserSubscription[];
  userId: string;
}

// API Response wrapper
interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  meta?: any;
}

class SourcesService {
  private async makeAuthenticatedRequest(url: string, options: RequestInit = {}): Promise<Response> {
    const { authService } = await import('./authService');
    return authService.fetchWithAuth(url, options);
  }

  private async makePublicRequest(url: string, options: RequestInit = {}): Promise<Response> {
    const baseURL = import.meta.env.VITE_API_BASE_URL || 'https://fc2dc84aa7f0.ngrok.app/api';

    return fetch(`${baseURL}${url}`, {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      ...options,
    });
  }

  private async getUserId(): Promise<string> {
    const { authService } = await import('./authService');
    const token = authService.getToken();
    if (!token) throw new Error('No authentication token');

    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      return payload.userId;
    } catch {
      throw new Error('Invalid token');
    }
  }

  // Получение всех доступных источников с информацией о подписках пользователя
  async getAllSources(): Promise<Source[]> {
    try {
      // Если пользователь авторизован, используем authenticated request для получения информации о подписках
      const { authService } = await import('./authService');
      const isAuthenticated = !!authService.getToken();

      const response = isAuthenticated
        ? await this.makeAuthenticatedRequest('/sources')
        : await this.makePublicRequest('/sources');

      const apiResponse: ApiResponse<Source[]> = await response.json();

      if (!apiResponse.success) {
        throw new Error(apiResponse.error || 'Failed to fetch sources');
      }

      return apiResponse.data || [];
    } catch (error) {
      console.error('Error fetching sources:', error);
      throw error;
    }
  }

  // Получение источников пользователя - теперь используем только /api/sources с информацией о подписках
  async getUserSources(): Promise<UserSources> {
    try {
      const userId = await this.getUserId();
      // Получаем все источники с информацией о подписках из единого эндпоинта
      const sources = await this.getAllSources();

      // Фильтруем только те источники, на которые подписан пользователь
      const subscribedSources: UserSubscription[] = sources
        .filter((source: any) => source.isUserSubscribed)
        .map((source: any) => ({
          sourceId: source._id,
          enabled: source.userSubscriptionEnabled !== false, // по умолчанию true
          subscribedAt: source.userSubscribedAt || new Date().toISOString()
        }));

      return { subscribedSources, userId };
    } catch (error) {
      console.error('Error fetching user sources:', error);
      throw error;
    }
  }

  // Подписка на источник - используем /api/sources для управления подписками
  async subscribeToSource(sourceId: string): Promise<void> {
    try {
      const response = await this.makeAuthenticatedRequest(`/sources/${sourceId}/subscribe`, {
        method: 'POST',
      });

      const apiResponse: ApiResponse<any> = await response.json();

      if (!apiResponse.success) {
        throw new Error(apiResponse.error || 'Failed to subscribe to source');
      }

      console.log(`✅ Subscribed to source: ${sourceId}`);
    } catch (error) {
      console.error('Error subscribing to source:', error);
      throw error;
    }
  }

  // Отписка от источника - используем /api/sources для управления подписками
  async unsubscribeFromSource(sourceId: string): Promise<void> {
    try {
      const response = await this.makeAuthenticatedRequest(`/sources/${sourceId}/unsubscribe`, {
        method: 'POST',
      });

      const apiResponse: ApiResponse<any> = await response.json();

      if (!apiResponse.success) {
        throw new Error(apiResponse.error || 'Failed to unsubscribe from source');
      }

      console.log(`✅ Unsubscribed from source: ${sourceId}`);
    } catch (error) {
      console.error('Error unsubscribing from source:', error);
      throw error;
    }
  }

  // Получение источников по категории
  async getSourcesByCategory(category: string): Promise<Source[]> {
    try {
      const response = await this.makePublicRequest(`/sources?category=${encodeURIComponent(category)}`);
      const apiResponse: ApiResponse<Source[]> = await response.json();

      if (!apiResponse.success) {
        throw new Error(apiResponse.error || 'Failed to fetch sources by category');
      }

      return apiResponse.data || [];
    } catch (error) {
      console.error('Error fetching sources by category:', error);
      throw error;
    }
  }

  // Поиск источников
  async searchSources(query: string): Promise<Source[]> {
    try {
      const response = await this.makePublicRequest(`/sources/search?q=${encodeURIComponent(query)}`);
      const apiResponse: ApiResponse<Source[]> = await response.json();

      if (!apiResponse.success) {
        throw new Error(apiResponse.error || 'Failed to search sources');
      }

      return apiResponse.data || [];
    } catch (error) {
      console.error('Error searching sources:', error);
      throw error;
    }
  }

  // Получение категорий источников
  async getSourceCategories(): Promise<string[]> {
    try {
      const response = await this.makePublicRequest('/sources/categories');
      const apiResponse: ApiResponse<string[]> = await response.json();

      if (!apiResponse.success) {
        throw new Error(apiResponse.error || 'Failed to fetch source categories');
      }

      return apiResponse.data || [];
    } catch (error) {
      console.error('Error fetching source categories:', error);
      throw error;
    }
  }

  // Получение новостей только от подписанных источников - используем /api/sources
  async getNewsFromSubscribedSources(
    page: number = 1,
    limit: number = 20
  ): Promise<{ news: any[], totalCount: number, hasMore: boolean }> {
    try {
      const response = await this.makeAuthenticatedRequest(
        `/sources/subscribed/news?page=${page}&limit=${limit}`
      );
      const apiResponse: ApiResponse<{ news: any[], totalCount: number, hasMore: boolean }> = await response.json();

      if (!apiResponse.success) {
        throw new Error(apiResponse.error || 'Failed to fetch news from subscribed sources');
      }

      return apiResponse.data || { news: [], totalCount: 0, hasMore: false };
    } catch (error) {
      console.error('Error fetching news from subscribed sources:', error);
      throw error;
    }
  }

  // Массовые операции - используем /api/sources
  async subscribeToMultipleSources(sourceIds: string[]): Promise<void> {
    try {
      const response = await this.makeAuthenticatedRequest(`/sources/bulk/subscribe`, {
        method: 'POST',
        body: JSON.stringify({ sourceIds }),
      });

      const apiResponse: ApiResponse<any> = await response.json();

      if (!apiResponse.success) {
        throw new Error(apiResponse.error || 'Failed to subscribe to multiple sources');
      }

      console.log(`✅ Subscribed to ${sourceIds.length} sources`);
    } catch (error) {
      console.error('Error subscribing to multiple sources:', error);
      throw error;
    }
  }

  async unsubscribeFromMultipleSources(sourceIds: string[]): Promise<void> {
    try {
      const response = await this.makeAuthenticatedRequest(`/sources/bulk/unsubscribe`, {
        method: 'POST',
        body: JSON.stringify({ sourceIds }),
      });

      const apiResponse: ApiResponse<any> = await response.json();

      if (!apiResponse.success) {
        throw new Error(apiResponse.error || 'Failed to unsubscribe from multiple sources');
      }

      console.log(`✅ Unsubscribed from ${sourceIds.length} sources`);
    } catch (error) {
      console.error('Error unsubscribing from multiple sources:', error);
      throw error;
    }
  }

  // Toggle source enabled/disabled status - используем /api/sources
  async toggleSourceEnabled(sourceId: string, enabled: boolean): Promise<void> {
    try {
      const response = await this.makeAuthenticatedRequest(`/sources/${sourceId}/toggle`, {
        method: 'PATCH',
        body: JSON.stringify({ enabled }),
      });

      const apiResponse: ApiResponse<any> = await response.json();

      if (!apiResponse.success) {
        throw new Error(apiResponse.error || `Failed to ${enabled ? 'enable' : 'disable'} source`);
      }

      console.log(`✅ Source ${enabled ? 'enabled' : 'disabled'}: ${sourceId}`);
    } catch (error) {
      console.error('Error toggling source status:', error);
      throw error;
    }
  }

  // Массовое включение/выключение всех подписанных источников
  async toggleAllSources(enabled: boolean): Promise<{ affectedCount: number; enabled: boolean }> {
    try {
      const response = await this.makeAuthenticatedRequest('/sources/bulk/toggle-all', {
        method: 'POST',
        body: JSON.stringify({ enabled }),
      });

      const apiResponse: ApiResponse<{ affectedCount: number; enabled: boolean }> = await response.json();

      if (!apiResponse.success) {
        throw new Error(apiResponse.error || `Failed to ${enabled ? 'enable' : 'disable'} all sources`);
      }

      console.log(`✅ ${enabled ? 'Enabled' : 'Disabled'} all sources: ${apiResponse.data?.affectedCount} sources affected`);
      return apiResponse.data || { affectedCount: 0, enabled };
    } catch (error) {
      console.error('Error toggling all sources:', error);
      throw error;
    }
  }

  // Получение настроек ежедневной сводки
  async getDigestSettings(): Promise<{ dailyDigestEnabled: boolean; dailyDigestTime: string }> {
    try {
      const userId = await this.getUserId();
      const response = await this.makeAuthenticatedRequest(`/users/${userId}/digest-settings`);
      const apiResponse: ApiResponse<{ dailyDigestEnabled: boolean; dailyDigestTime: string }> = await response.json();

      if (!apiResponse.success) {
        throw new Error(apiResponse.error || 'Failed to fetch digest settings');
      }

      return apiResponse.data || { dailyDigestEnabled: false, dailyDigestTime: '20:00' };
    } catch (error) {
      console.error('Error fetching digest settings:', error);
      throw error;
    }
  }

  // Обновление настроек ежедневной сводки
  async updateDigestSettings(settings: { dailyDigestEnabled?: boolean; dailyDigestTime?: string }): Promise<{ dailyDigestEnabled: boolean; dailyDigestTime: string }> {
    try {
      const userId = await this.getUserId();
      const response = await this.makeAuthenticatedRequest(`/users/${userId}/digest-settings`, {
        method: 'PATCH',
        body: JSON.stringify(settings),
      });

      const apiResponse: ApiResponse<{ dailyDigestEnabled: boolean; dailyDigestTime: string }> = await response.json();

      if (!apiResponse.success) {
        throw new Error(apiResponse.error || 'Failed to update digest settings');
      }

      console.log(`✅ Digest settings updated:`, settings);
      return apiResponse.data || { dailyDigestEnabled: false, dailyDigestTime: '20:00' };
    } catch (error) {
      console.error('Error updating digest settings:', error);
      throw error;
    }
  }
}

export const sourcesService = new SourcesService();