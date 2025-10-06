import { useState, useCallback, useRef, useEffect } from 'react'
import {Menu, X, Search} from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import NewsAggregator from './NewsAggregator'
import MySources from './MySources'
import { Button } from './ui/button'
import { Input } from './ui/input'

type ViewMode = 'all' | 'sources';

export default function Dashboard() {
  const { user, isAuthenticated, logout } = useAuth();
  const [viewMode, setViewMode] = useState<ViewMode>('all');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const debounceTimerRef = useRef<number | null>(null);

  const handleSearchChange = useCallback((value: string) => {
    setSearchQuery(value);

    // Clear existing timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    // Set new timer with shorter delay for empty search
    const delay = value.trim() === '' ? 300 : 800;
    debounceTimerRef.current = setTimeout(() => {
      setDebouncedSearchQuery(value);
    }, delay);
  }, []);

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  return (
      <div className={"dashboard"}>
    <div className="bg-background container">
      {/* Header */}
      <div className={"header mx-auto"}>
          <div className={"header-left-side"}>
              <div className="flex justify-between items-center">

                  <div className={"app-icon"} onClick={() => setViewMode('all')}>
                      <svg width="40" height="40" viewBox="0 0 174 174" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <circle cx="86.9983" cy="86.9983" r="86.9983" fill="#FF0002"/>
                          <path d="M110.855 65.796H60.1898V133.348H43.3021V48.9073H110.855V65.796ZM127.743 133.348H110.855V65.796H127.743V133.348Z" fill="white"/>
                      </svg>

                  </div>

                  <div className={"news-feed__container"}>
                      <a onClick={() => setViewMode('all')} className={"news-feed"}>Новости</a>
                  </div>

                  {/* Mobile Menu Button - first row on mobile */}
                  <div className="mobile-burger-menu md:hidden">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                      className="p-2"
                    >
                      {mobileMenuOpen ? (
                        <X className="h-5 w-5" />
                      ) : (
                        <Menu className="h-5 w-5" />
                      )}
                    </Button>
                  </div>

                  <div className="desktop-search-bar hidden md:block flex-1 max-w-md mx-4 search-bar">
                      <div className="relative">
                          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                          <Input
                              placeholder="Поиск новостей..."
                              value={searchQuery}
                              onChange={(e) => handleSearchChange(e.target.value)}
                              className="pl-10 pr-10 h-10 sm:h-11 touch-manipulation"
                          />
                          {searchQuery && (
                              <Button
                                  variant="ghost"
                                  size="sm"
                                  className="absolute right-2 top-1/2 transform -translate-y-1/2 h-6 w-6 p-0 touch-manipulation"
                                  onClick={() => handleSearchChange('')}
                              >
                                  <X className="h-4 w-4" />
                              </Button>
                          )}
                      </div>
                  </div>
          </div>


            <div className={"header-right-side"}>
                {/* Desktop Navigation */}
                <div className="hidden md:flex items-center gap-2">
                    {isAuthenticated && (
                        <span className={"sources__button"} onClick={() => setViewMode('sources')}>
                    Источники
                </span>
                    )}
                    {!isAuthenticated && (
                        <span
                            className={'login__button'}
                            onClick={() => {
                                const botUsername = 'newshhbot';
                                const telegramUrl = `https://t.me/${botUsername}?start=login`;
                                window.open(telegramUrl, '_blank');
                            }}
                        >
                            🔑 Войти
                        </span>
                    )}
                    {isAuthenticated && (
                        <div
                            onClick={logout}
                            className={"logout__button"}
                        >
                            Выйти
                        </div>
                    )}
                </div>

            </div>
          </div>

          {/* Mobile Search Bar - second row on mobile */}
          <div className="mobile-search-bar md:hidden w-full search-bar">
              <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                      placeholder="Поиск новостей..."
                      value={searchQuery}
                      onChange={(e) => handleSearchChange(e.target.value)}
                      className="pl-10 pr-10 h-10 sm:h-11 touch-manipulation"
                  />
                  {searchQuery && (
                      <Button
                          variant="ghost"
                          size="sm"
                          className="absolute right-2 top-1/2 transform -translate-y-1/2 h-6 w-6 p-0 touch-manipulation"
                          onClick={() => handleSearchChange('')}
                      >
                          <X className="h-4 w-4" />
                      </Button>
                  )}
              </div>
          </div>
      </div>

          {/* Mobile Navigation */}
          {mobileMenuOpen && (
            <div className="md:hidden mt-3 pt-3 border-t">
              <div className="flex flex-col space-y-2">
                <Button
                  variant={viewMode === 'all' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => {
                    setViewMode('all');
                    setMobileMenuOpen(false);
                  }}
                  className="justify-start"
                >
                  📰 Все новости
                </Button>
                {isAuthenticated && (
                  <Button
                    variant={viewMode === 'sources' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => {
                      setViewMode('sources');
                      setMobileMenuOpen(false);
                    }}
                    className="justify-start"
                  >
                    🏷️ Мои источники
                  </Button>
                )}
                {!isAuthenticated && (
                  <Button
                    variant="default"
                    size="sm"
                    onClick={() => {
                      const botUsername = 'newshhbot';
                      const telegramUrl = `https://t.me/${botUsername}?start=login`;
                      window.open(telegramUrl, '_blank');
                      setMobileMenuOpen(false);
                    }}
                    className="justify-start"
                  >
                    🔑 Войти
                  </Button>
                )}
                {isAuthenticated && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      logout();
                      setMobileMenuOpen(false);
                    }}
                    className="justify-start"
                  >
                    🚪 Выйти
                  </Button>
                )}
                {user && (
                  <div className="text-xs text-muted-foreground px-3 py-2 sm:hidden">
                    Welcome, {user.displayName}
                  </div>
                )}
              </div>
            </div>
          )}
      </div>

      <div className="mx-auto">
        {viewMode === 'all' && (
          <NewsAggregator
            searchQuery={debouncedSearchQuery}
            onSearchChange={handleSearchChange}
            onNavigateToSources={() => setViewMode('sources')}
          />
        )}

        {viewMode === 'sources' && isAuthenticated && (
          <MySources />
        )}
      </div>
    </div>
  )
}