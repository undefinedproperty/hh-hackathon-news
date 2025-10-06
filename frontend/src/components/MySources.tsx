import { useState, useEffect, useCallback } from 'react'
import { Plus, Search, Globe, Rss, Bell } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { sourcesService, type UserSubscription } from '../services/sourcesService'
import { useAuth } from '@/contexts/AuthContext'
import { authService } from '@/services/authService'

interface Source {
  _id: string;
  title: string;
  url: string;
  description?: string;
  category?: string;
  isActive: boolean;
  language?: string;
  favicon?: string;
  isUserSubscribed?: boolean; // Новое поле для отображения статуса подписки
  userSubscriptionEnabled?: boolean; // Статус включенности источника для пользователя
  userSubscribedAt?: string; // Дата подписки
}

interface UserSources {
  subscribedSources: UserSubscription[];
  userId?: string;
}


// iOS-style switch component
interface ToggleSwitchProps {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
  disabled?: boolean;
  size?: 'sm' | 'md';
}

function ToggleSwitch({ enabled, onChange, disabled = false, size = 'md' }: ToggleSwitchProps) {
  const sizeClasses = {
    sm: {
      container: 'w-10 h-6',
      thumb: 'w-4 h-4',
      translateX: 'translate-x-4'
    },
    md: {
      container: 'w-12 h-7',
      thumb: 'w-5 h-5',
      translateX: 'translate-x-5'
    }
  };

  const { container, thumb, translateX } = sizeClasses[size];

  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      disabled={disabled}
      onClick={() => !disabled && onChange(!enabled)}
      className={`
        relative inline-flex ${container} items-center rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 touch-manipulation
        ${enabled
          ? 'bg-blue-600 hover:bg-blue-700'
          : 'bg-gray-200 hover:bg-gray-300'
        }
        ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
      `}
    >
      <span
        className={`
          ${thumb} inline-block rounded-full bg-white shadow-lg transform transition-transform duration-200
          ${enabled ? translateX : 'translate-x-1'}
        `}
      />
    </button>
  );
}

export default function MySources() {
  const [availableSources, setAvailableSources] = useState<Source[]>([]);
  const [userSources, setUserSources] = useState<UserSources>({ subscribedSources: [], userId: '' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [bulkSaving, setBulkSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory] = useState<string>('all');
  const [showAddSourceModal, setShowAddSourceModal] = useState(false);
  const [newSourceForm, setNewSourceForm] = useState({
    link: '',
    type: 'rss' as 'rss' | 'api',
    public: true
  });
  const [addSourceLoading, setAddSourceLoading] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmAction, setConfirmAction] = useState<{ type: 'enable' | 'disable'; action: () => void } | null>(null);
  const { isAuthenticated } = useAuth();

  // Digest settings state
  const [digestEnabled, setDigestEnabled] = useState(false);
  const [digestTime, setDigestTime] = useState('20:00');
  const [digestLoading, setDigestLoading] = useState(false);
  const [digestSaving, setDigestSaving] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      // Теперь получаем все данные из одного эндпоинта /api/sources
      const sources = await sourcesService.getAllSources();

      let userSourcesData: UserSources = { subscribedSources: [] };
      if (isAuthenticated) {
        try {
          userSourcesData = await sourcesService.getUserSources();
        } catch (err) {
          console.warn('Failed to load user sources:', err);
        }
      }

      setAvailableSources(sources);
      setUserSources(userSourcesData);
    } catch (err) {
      console.error('Error loading sources data:', err);
      setError(err instanceof Error ? err.message : 'Failed to load sources');
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated]);

  const loadDigestSettings = useCallback(async () => {
    if (!isAuthenticated) return;

    setDigestLoading(true);
    try {
      const settings = await sourcesService.getDigestSettings();
      setDigestTime(settings.dailyDigestTime || '20:00');
      setDigestEnabled(settings.dailyDigestEnabled || false);
    } catch (err) {
      console.warn('Failed to load digest settings:', err);
    } finally {
      setDigestLoading(false);
    }
  }, [isAuthenticated]);

  const handleDigestToggle = async (enabled: boolean) => {
    if (!isAuthenticated) return;

    setDigestSaving(true);
    try {
      await sourcesService.updateDigestSettings({ dailyDigestEnabled: enabled });
      setDigestEnabled(enabled);
    } catch (err) {
      console.error('Error toggling digest:', err);
      alert('Ошибка при обновлении настроек сводки');
      // Revert on error
      setDigestEnabled(!enabled);
    } finally {
      setDigestSaving(false);
    }
  };

  const handleDigestTimeChange = async (newTime: string) => {
    if (!isAuthenticated) return;

    setDigestSaving(true);
    try {
      await sourcesService.updateDigestSettings({ dailyDigestTime: newTime });
      setDigestTime(newTime);
    } catch (err) {
      console.error('Error updating digest time:', err);
      alert('Ошибка при обновлении времени сводки');
    } finally {
      setDigestSaving(false);
    }
  };

  useEffect(() => {
    loadData();
    loadDigestSettings();
  }, [loadData, loadDigestSettings]);

  const handleToggleSourceEnabled = async (sourceId: string, enabled: boolean) => {
    if (!isAuthenticated) {
      alert('Необходимо войти в систему');
      return;
    }

    setSaving(true);
    try {
      // Находим источник в availableSources
      const source = availableSources.find(s => s._id === sourceId);
      if (!source) {
        throw new Error('Source not found');
      }

      if (!source.isUserSubscribed && enabled) {
        // Subscribe to source if not subscribed and trying to enable
        await sourcesService.subscribeToSource(sourceId);
        // Обновляем локальное состояние
        setAvailableSources(prev => prev.map(s =>
          s._id === sourceId
            ? { ...s, isUserSubscribed: true, userSubscriptionEnabled: true, userSubscribedAt: new Date().toISOString() }
            : s
        ));
      } else if (source.isUserSubscribed && !enabled) {
        // Disable source but keep subscription (or unsubscribe completely based on current behavior)
        await sourcesService.unsubscribeFromSource(sourceId);
        // Обновляем локальное состояние - полная отписка
        setAvailableSources(prev => prev.map(s =>
          s._id === sourceId
            ? { ...s, isUserSubscribed: false, userSubscriptionEnabled: false, userSubscribedAt: undefined }
            : s
        ));
      } else if (source.isUserSubscribed && enabled) {
        // Enable source if already subscribed but disabled
        await sourcesService.toggleSourceEnabled(sourceId, enabled);
        // Обновляем локальное состояние
        setAvailableSources(prev => prev.map(s =>
          s._id === sourceId
            ? { ...s, userSubscriptionEnabled: enabled }
            : s
        ));
      }

      // Обновляем userSources для совместимости с существующим кодом
      const subscription = userSources.subscribedSources.find(sub => sub.sourceId === sourceId);
      if (!subscription && enabled) {
        setUserSources(prev => ({
          ...prev,
          subscribedSources: [...prev.subscribedSources, {
            sourceId,
            enabled: true,
            subscribedAt: new Date().toISOString()
          }]
        }));
      } else if (subscription && !enabled && !source.isUserSubscribed) {
        setUserSources(prev => ({
          ...prev,
          subscribedSources: prev.subscribedSources.filter(sub => sub.sourceId !== sourceId)
        }));
      } else if (subscription) {
        setUserSources(prev => ({
          ...prev,
          subscribedSources: prev.subscribedSources.map(sub =>
            sub.sourceId === sourceId ? { ...sub, enabled } : sub
          )
        }));
      }
    } catch (err) {
      console.error('Error toggling source:', err);
      setError(err instanceof Error ? err.message : 'Failed to update source');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleAllSources = async (enabled: boolean) => {
    if (!isAuthenticated) {
      alert('Необходимо войти в систему');
      return;
    }

    const activeAvailableSources = availableSources.filter(s => s.isActive);

    if (activeAvailableSources.length === 0) {
      alert('Нет доступных источников');
      return;
    }

    setBulkSaving(true);
    try {
      if (enabled) {
        // Подписываемся на все активные источники последовательно
        const sourcesToSubscribe = activeAvailableSources.filter(source => !source.isUserSubscribed);
        let successCount = 0;

        for (const source of sourcesToSubscribe) {
          try {
            await sourcesService.subscribeToSource(source._id);
            successCount++;
          } catch (err) {
            console.error(`Error subscribing to source ${source._id}:`, err);
            // Продолжаем с другими источниками
          }
        }

        // Обновляем локальное состояние - все источники подписаны и включены
        setAvailableSources(prev => prev.map(s =>
          s.isActive
            ? { ...s, isUserSubscribed: true, userSubscriptionEnabled: true, userSubscribedAt: new Date().toISOString() }
            : s
        ));

        // Обновляем userSources
        const newSubscriptions = activeAvailableSources.map(source => ({
          sourceId: source._id,
          enabled: true,
          subscribedAt: new Date().toISOString()
        }));

        setUserSources(prev => ({
          ...prev,
          subscribedSources: newSubscriptions
        }));

        console.log(`✅ Successfully subscribed to ${successCount} new sources out of ${sourcesToSubscribe.length} attempted`);
      } else {
        // Отписываемся от всех источников
        const subscribedSources = availableSources.filter(s => s.isUserSubscribed);

        if (subscribedSources.length === 0) {
          alert('Нет подписанных источников для отключения');
          return;
        }

        // Делаем последовательные запросы вместо параллельных для избежания версионных конфликтов
        let successCount = 0;
        for (const source of subscribedSources) {
          try {
            await sourcesService.unsubscribeFromSource(source._id);
            successCount++;
          } catch (err) {
            console.error(`Error unsubscribing from source ${source._id}:`, err);
            // Продолжаем с другими источниками
          }
        }

        // Обновляем локальное состояние - отписываемся от всех источников
        setAvailableSources(prev => prev.map(s =>
          s.isUserSubscribed
            ? { ...s, isUserSubscribed: false, userSubscriptionEnabled: false, userSubscribedAt: undefined }
            : s
        ));

        // Очищаем userSources
        setUserSources(prev => ({
          ...prev,
          subscribedSources: []
        }));

        console.log(`✅ Successfully unsubscribed from ${successCount} out of ${subscribedSources.length} sources`);
      }
    } catch (err) {
      console.error('Error toggling all sources:', err);
      setError(err instanceof Error ? err.message : 'Failed to toggle all sources');
    } finally {
      setBulkSaving(false);
    }
  };

  const filteredSources = availableSources.filter(source => {
    const matchesSearch = !searchQuery ||
      source.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (source.description && source.description.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesCategory = selectedCategory === 'all' || source.category === selectedCategory;

    return matchesSearch && matchesCategory && source.isActive;
  });


  const handleAddSource = async () => {
    if (!isAuthenticated) {
      alert('Необходимо войти в систему для добавления источников');
      return;
    }

    if (!newSourceForm.link.trim()) {
      alert('Пожалуйста, введите ссылку на источник');
      return;
    }

    setAddSourceLoading(true);

    try {
      const response = await authService.fetchWithAuth('/sources', {
        method: 'POST',
        body: JSON.stringify(newSourceForm)
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Failed to add source: ${response.statusText}`);
      }

      const result = await response.json();
      console.log('Source added successfully:', result);

      // Reset form and close modal
      setNewSourceForm({
        link: '',
        type: 'rss',
        public: true
      });
      setShowAddSourceModal(false);

      // Reload sources
      await loadData();

      // Show success message
      alert('Источник успешно добавлен!');

    } catch (error) {
      console.error('Error adding source:', error);
      alert('Ошибка при добавлении источника: ' + (error instanceof Error ? error.message : 'Unknown error'));
    } finally {
      setAddSourceLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="container mx-auto px-4 py-6">
          <div className="flex justify-center items-center min-h-[400px]">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
              <p className="text-muted-foreground">Загружаем источники...</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background">
        <div className="container mx-auto px-4 py-6">
          <Card className="max-w-md mx-auto">
            <CardContent className="pt-6 text-center">
              <p className="text-destructive mb-4">❌ {error}</p>
              <Button onClick={loadData}>Попробовать снова</Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto px-3 sm:px-4 py-3 sm:py-4 mt-2 mb-2">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-0">
            <h1 className="text-xl sm:text-2xl font-bold truncate">
              Все источники ({filteredSources.length})
            </h1>
            {isAuthenticated && (
              <Button
                onClick={() => setShowAddSourceModal(true)}
                className="w-full sm:w-auto touch-manipulation"
                size="sm"
              >
                <Plus className="w-4 h-4 mr-1" />
                Добавить источник
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="container mx-auto px-3 sm:px-4 py-4 sm:py-6">
        <div className="space-y-4 sm:space-y-6">
          {/* Daily Digest Settings */}
          {isAuthenticated && (
            <Card className="border-blue-200 bg-blue-50/50 mt-4">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <Bell className="w-5 h-5 text-blue-600" />
                  <CardTitle className="text-base sm:text-lg">Ежедневная сводка новостей</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <p className="text-sm font-medium text-foreground">Получать сводку в Telegram</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Топ-5 новостей из каждой тематики раз в день
                    </p>
                  </div>
                  <ToggleSwitch
                    enabled={digestEnabled}
                    onChange={handleDigestToggle}
                    disabled={digestLoading || digestSaving}
                  />
                </div>

                {digestEnabled && (
                  <>
                    <Separator />
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-foreground">
                        Время отправки (МСК)
                      </label>
                      <div className="flex items-center gap-3">
                        <Input
                          type="time"
                          value={digestTime}
                          onChange={(e) => setDigestTime(e.target.value)}
                          className="max-w-[150px] h-10 touch-manipulation"
                          disabled={digestSaving}
                        />
                        <Button
                          size="sm"
                          onClick={() => handleDigestTimeChange(digestTime)}
                          disabled={digestSaving}
                          className="touch-manipulation"
                        >
                          {digestSaving ? 'Сохранение...' : 'Сохранить'}
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Вы будете получать сводку каждый день в {digestTime} по московскому времени
                      </p>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          )}

          {/* Search and Filter */}
          <div className="space-y-3 sm:space-y-0 sm:flex sm:flex-row sm:gap-4 mt-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Поиск источников..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 h-10 sm:h-11 touch-manipulation"
              />
            </div>

            {/* Bulk Actions */}
            {isAuthenticated && (
              <div className="flex gap-1.5 sm:gap-2 flex-wrap">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setConfirmAction({
                      type: 'enable',
                      action: () => handleToggleAllSources(true)
                    });
                    setShowConfirmModal(true);
                  }}
                  disabled={bulkSaving || saving}
                  className="text-xs sm:text-sm px-2 sm:px-3 py-1.5 sm:py-2 h-auto text-green-600 border-green-600 hover:bg-green-50 touch-manipulation"
                >
                  {bulkSaving ? 'Обновляем...' : 'Включить все'}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setConfirmAction({
                      type: 'disable',
                      action: () => handleToggleAllSources(false)
                    });
                    setShowConfirmModal(true);
                  }}
                  disabled={bulkSaving || saving}
                  className="text-xs sm:text-sm px-2 sm:px-3 py-1.5 sm:py-2 h-auto text-red-600 border-red-600 hover:bg-red-50 touch-manipulation"
                >
                  {bulkSaving ? 'Обновляем...' : 'Выключить все'}
                </Button>
              </div>
            )}
          </div>

          {/* Sources Grid */}
          <div className="grid gap-3 sm:gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredSources.map((source) => {
              // Теперь используем данные напрямую из соурса
              const isSubscribed = source.isUserSubscribed ?? false;
              const isEnabled = isSubscribed && (source.userSubscriptionEnabled !== false);

              return (
                <Card key={source._id} className="hover:shadow-md transition-shadow touch-manipulation">
                  <CardHeader className="pb-2 sm:pb-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-start gap-2 flex-1 min-w-0">
                        {source.favicon ? (
                          <img
                            src={source.favicon}
                            alt=""
                            className="w-4 h-4 sm:w-5 sm:h-5 rounded flex-shrink-0 mt-0.5"
                            onError={(e) => {
                              e.currentTarget.style.display = 'none';
                            }}
                          />
                        ) : (
                          <Rss className="w-4 h-4 sm:w-5 sm:h-5 text-muted-foreground flex-shrink-0 mt-0.5" />
                        )}
                        <CardTitle className="text-sm sm:text-base leading-tight break-words">
                          {source.title}
                        </CardTitle>
                      </div>
                      <div className="flex flex-col items-center gap-1 flex-shrink-0">
                        <ToggleSwitch
                          enabled={isEnabled}
                          onChange={(enabled) => handleToggleSourceEnabled(source._id, enabled)}
                          disabled={saving}
                          size="sm"
                        />
                        <span className="text-xs text-muted-foreground whitespace-nowrap">
                          {isEnabled ? 'Вкл.' : 'Откл.'}
                        </span>
                      </div>
                    </div>
                  </CardHeader>

                  <CardContent className="pt-0">
                    {source.description && (
                      <p className="text-xs sm:text-sm text-muted-foreground mb-3 line-clamp-2 leading-relaxed">
                        {source.description}
                      </p>
                    )}

                    <div className="space-y-2 sm:space-y-0 sm:flex sm:items-center sm:justify-between">
                      <div className="flex items-center gap-2 min-w-0">
                        <Globe className="w-3 h-3 sm:w-4 sm:h-4 text-muted-foreground flex-shrink-0" />
                        <span className="text-xs text-muted-foreground truncate">
                          {new URL(source.url).hostname}
                        </span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {filteredSources.length === 0 && (
            <Card>
              <CardContent className="pt-6 text-center">
                <p className="text-muted-foreground">
                  {searchQuery || selectedCategory !== 'all'
                    ? 'Источники не найдены по вашему запросу'
                    : 'Нет доступных источников'
                  }
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Confirmation Modal */}
      <Dialog open={showConfirmModal} onOpenChange={setShowConfirmModal}>
        <DialogContent className="sm:max-w-md mx-3 sm:mx-0 rounded-lg">
          <DialogHeader>
            <DialogTitle className="text-lg sm:text-xl">Подтвердите действие</DialogTitle>
            <DialogDescription className="text-sm sm:text-base">
              {confirmAction?.type === 'enable'
                ? 'Вы уверены, что хотите включить все источники?'
                : 'Вы уверены, что хотите выключить все источники?'
              }
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="mt-6 flex-col-reverse sm:flex-row gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => {
                setShowConfirmModal(false);
                setConfirmAction(null);
              }}
              disabled={bulkSaving}
              className="w-full sm:w-auto touch-manipulation"
            >
              Отмена
            </Button>
            <Button
              onClick={() => {
                if (confirmAction) {
                  confirmAction.action();
                }
                setShowConfirmModal(false);
                setConfirmAction(null);
              }}
              disabled={bulkSaving}
              className={`w-full sm:w-auto touch-manipulation ${
                confirmAction?.type === 'enable'
                  ? 'bg-green-600 hover:bg-green-700'
                  : 'bg-red-600 hover:bg-red-700'
              }`}
            >
              {confirmAction?.type === 'enable' ? 'Включить все' : 'Выключить все'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Source Modal */}
      <Dialog open={showAddSourceModal} onOpenChange={setShowAddSourceModal}>
        <DialogContent className="sm:max-w-md mx-3 sm:mx-0 rounded-lg">
          <DialogHeader>
            <DialogTitle className="text-lg sm:text-xl">Добавить источник новостей</DialogTitle>
            <DialogDescription className="text-sm sm:text-base">
              Добавьте новый RSS источник или API для получения новостей
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-2 block">
                Ссылка на источник <span className="text-red-500">*</span>
              </label>
              <Input
                type="url"
                placeholder="https://lenta.ru/rss"
                value={newSourceForm.link}
                onChange={(e) => setNewSourceForm(prev => ({ ...prev, link: e.target.value }))}
                className="h-10 sm:h-11 touch-manipulation"
              />
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block">Тип источника</label>
              <Select
                value={newSourceForm.type}
                onValueChange={(value: 'rss') =>
                  setNewSourceForm(prev => ({ ...prev, type: value }))
                }
              >
                <SelectTrigger className="h-10 sm:h-11 touch-manipulation">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="rss">RSS Feed</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter className="mt-6 flex-col-reverse sm:flex-row gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setShowAddSourceModal(false)}
              disabled={addSourceLoading}
              className="w-full sm:w-auto touch-manipulation"
            >
              Отмена
            </Button>
            <Button
              onClick={handleAddSource}
              disabled={addSourceLoading || !newSourceForm.link.trim()}
              className="w-full sm:w-auto touch-manipulation"
            >
              {addSourceLoading ? 'Добавляем...' : 'Добавить'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}