import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { Clock, RefreshCw, TrendingUp, DollarSign, Laptop, Heart, Palette, Trophy, GraduationCap, Users, Scale, Leaf, Languages } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useAuth } from '@/contexts/AuthContext'
import { authService } from '@/services/authService'
import NotFoundPlaceholder from '@/components/NotFoundPlaceholder'

interface NewsItem {
  _id?: string
  id?: string
  titleCanonical?: string
  titleCanonicalOriginal?: string
  title?: string
  summaryShort?: string
  summaryShortOriginal?: string
  content?: string
  description?: string
  source: string
  publishedAt?: string
  created_at?: string
  topics?: string[]
  tags?: string[]
  url: string
  lang: string
  theme: string
  score?: number
  highlight?: {
    title?: string[]
    content?: string[]
    description?: string[]
  }
}

interface SearchResponse {
  query: string
  results: NewsItem[]
  pagination: {
    offset: number
    limit: number
    total: number
    hasMore: boolean
    nextOffset: number | null
  }
  search_metadata: {
    took: number
    max_score: number
    total_hits: number
    sort_by: string
    highlight_enabled: boolean
  }
  filters_applied: {
    sources: string[]
    themes: string[]
    tags: string[]
    date_range: {
      from: string | null
      to: string | null
    }
  }
}


const categories = [
  { name: 'Все', icon: null },
  { name: 'Политика', icon: TrendingUp },
  { name: 'Экономика', icon: DollarSign },
  { name: 'Технологии', icon: Laptop },
  { name: 'Медицина', icon: Heart },
  { name: 'Культура', icon: Palette },
  { name: 'Спорт', icon: Trophy },
  { name: 'Образование', icon: GraduationCap },
  { name: 'Общество', icon: Users },
  { name: 'Право', icon: Scale },
  { name: 'Экология', icon: Leaf }
]

const getThemeColor = (theme: string): string => {
  const colors: { [key: string]: string } = {
    'Политика': 'bg-red-100 text-red-800 border-red-200',
    'Экономика': 'bg-green-100 text-green-800 border-green-200',
    'Технологии': 'bg-blue-100 text-blue-800 border-blue-200',
    'Медицина': 'bg-pink-100 text-pink-800 border-pink-200',
    'Культура': 'bg-purple-100 text-purple-800 border-purple-200',
    'Спорт': 'bg-orange-100 text-orange-800 border-orange-200',
    'Образование': 'bg-indigo-100 text-indigo-800 border-indigo-200',
    'Общество': 'bg-cyan-100 text-cyan-800 border-cyan-200',
    'Право': 'bg-yellow-100 text-yellow-800 border-yellow-200',
    'Экология': 'bg-emerald-100 text-emerald-800 border-emerald-200'
  }
  return colors[theme] || 'bg-gray-100 text-gray-800 border-gray-200'
}

const getLanguageFlag = (lang: string): string => {
  const flags: { [key: string]: string } = {
    'ru': '🇷🇺',
    'en': '🇺🇸',
    'uk': '🇺🇦',
    'be': '🇧🇾',
    'kz': '🇰🇿',
    'de': '🇩🇪',
    'fr': '🇫🇷',
    'es': '🇪🇸',
    'it': '🇮🇹',
    'pt': '🇵🇹',
    'zh': '🇨🇳',
    'ja': '🇯🇵',
    'ko': '🇰🇷',
    'ar': '🇸🇦',
    'tr': '🇹🇷'
  }
  return flags[lang.toLowerCase()] || '🌐'
}

interface NewsAggregatorProps {
  searchQuery?: string
  onSearchChange?: (query: string) => void
  onNavigateToSources?: () => void
}

export default function NewsAggregator({ searchQuery = '', onSearchChange, onNavigateToSources }: NewsAggregatorProps = {}) {
  const { isAuthenticated } = useAuth()
  const [selectedCategory, setSelectedCategory] = useState('Все')
  const [selectedTheme, setSelectedTheme] = useState<string | null>(null)
  const [selectedTag, setSelectedTag] = useState<string | null>(null)
  const [news, setNews] = useState<NewsItem[]>([])
  const [loading, setLoading] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const offsetRef = useRef(0)
  const [searchMetadata, setSearchMetadata] = useState<SearchResponse['search_metadata'] | null>(null)
  const [sortBy, setSortBy] = useState<'relevance' | 'date' | 'popularity'>('date')
  const [highlightEnabled, setHighlightEnabled] = useState(true)
  const [fetchRequested, setFetchRequested] = useState(0)
  const [showOriginal, setShowOriginal] = useState<string[]>([])
  const limit = 10

  const handleShowOriginal = (itemId: string) => {
    setShowOriginal(prev => 
      prev.includes(itemId) 
        ? prev.filter(id => id !== itemId) // Убираем ID из массива, если он уже есть
        : [...prev, itemId] // Добавляем ID в массив, если его нет
    )
  }

  // Enhanced fetch function that uses either search or regular endpoint
  const fetchNews = useCallback(async (reset = false) => {
    if (loading) return
    setLoading(true)

    console.log('🔍 FRONTEND NewsAggregator - Fetch news called:', {
      isAuthenticated,
      hasToken: !!authService.getToken(),
      tokenValid: authService.isAuthenticated(),
      searchQuery: searchQuery.trim(),
      reset
    });

    try {
      const currentOffset = reset ? 0 : offsetRef.current

      // Use search endpoint if we have a search query, otherwise use regular /api/news endpoint
      if (searchQuery.trim()) {
        const params = new URLSearchParams({
          q: searchQuery.trim(),
          limit: limit.toString(),
          offset: currentOffset.toString(),
          sort_by: sortBy,
          highlight: highlightEnabled.toString()
        })

        // Add filters to search
        if (selectedCategory !== 'Все') {
          params.append('themes', selectedCategory)
        }
        if (selectedTheme) {
          params.append('themes', selectedTheme)
        }
        if (selectedTag) {
          params.append('tags', selectedTag)
        }

        console.log('🔍 FRONTEND NewsAggregator - Making search request:', {
          isAuthenticated,
          endpoint: 'authService.fetchWithAuth (ALWAYS for authenticated users)',
          url: `/news/search?${params}`
        });

        const response = isAuthenticated ? await authService.fetchWithAuth(`/news/search?${params}`) : await authService.fetchNoAuth(`/news/search?${params}`)
        if (!response.ok) {
          throw new Error(`Search failed: ${response.statusText}`)
        }
        const data: SearchResponse = await response.json()

        const newNews = data.results || []
        setSearchMetadata(data.search_metadata)

        if (reset) {
          setNews(newNews)
          offsetRef.current = data.pagination.nextOffset || newNews.length
        } else {
          setNews(prev => [...prev, ...newNews])
          offsetRef.current = data.pagination.nextOffset || (offsetRef.current + newNews.length)
        }

        setHasMore(data.pagination.hasMore)
      } else {
        // Use regular endpoint for browsing without search
        const params = new URLSearchParams({
          limit: limit.toString(),
          offset: currentOffset.toString()
        })

        if (selectedCategory !== 'Все') {
          params.append('topic', selectedCategory)
        }
        if (selectedTheme) {
          params.append('theme', selectedTheme)
        }
        if (selectedTag) {
          params.append('tag', selectedTag)
        }

        console.log('🔍 FRONTEND NewsAggregator - Making regular news request:', {
          isAuthenticated,
          endpoint: 'authService.fetchWithAuth (ALWAYS for authenticated users)',
          url: `/news?${params}`
        });

        
        const response = isAuthenticated ? await authService.fetchWithAuth(`/news?${params}`) : await authService.fetchNoAuth(`/news?${params}`)
        if (!response.ok) {
          throw new Error(`Fetch failed: ${response.statusText}`)
        }
        const data = await response.json()
        const newNews = Array.isArray(data.news) ? data.news : []

        setSearchMetadata(null)

        if (reset) {
          setNews(newNews)
          offsetRef.current = data.pagination?.nextOffset || newNews.length
        } else {
          setNews(prev => [...prev, ...newNews])
          offsetRef.current = data.pagination?.nextOffset || (offsetRef.current + newNews.length)
        }

        setHasMore(data.pagination?.hasMore ?? newNews.length === limit)
      }
    } catch (error) {
      console.error('Error fetching news:', error)
    } finally {
      setLoading(false)
    }
  }, [searchQuery, selectedCategory, selectedTheme, selectedTag, sortBy, highlightEnabled, limit, isAuthenticated]) // eslint-disable-line react-hooks/exhaustive-deps

  // Trigger fetch when filters or searchQuery change
  useEffect(() => {
    offsetRef.current = 0  // Reset offset when filters change
    setFetchRequested(prev => prev + 1)
  }, [searchQuery, selectedCategory, selectedTheme, selectedTag, sortBy])

  // Single effect that handles all fetch requests - prevents duplicate calls
  useEffect(() => {
    if (fetchRequested > 0) {
      fetchNews(true)
    }
  }, [fetchRequested, fetchNews])

  // Initial load
  useEffect(() => {
    setFetchRequested(1)
  }, [])

  
  const handleThemeClick = (theme: string) => {
    if (selectedTheme === theme) {
      setSelectedTheme(null)
    } else {
      setSelectedTheme(theme)
      setSelectedCategory('Все')
      setSelectedTag(null)
    }
  }
  
  const handleTagClick = (tag: string) => {
    if (selectedTag === tag) {
      setSelectedTag(null)
    } else {
      setSelectedTag(tag)
      setSelectedCategory('Все')
      setSelectedTheme(null)
    }
  }
  
  const handleTopicClick = useCallback((topic: string) => {
    if (onSearchChange) {
      onSearchChange(topic)
    }
  }, [onSearchChange])
  
  const clearFilters = useCallback(() => {
    setSelectedTheme(null)
    setSelectedTag(null)
    setSelectedCategory('Все')
    setSortBy('date')
    setHighlightEnabled(true)
    if (onSearchChange) {
      onSearchChange('')
    }
  }, [onSearchChange])
  
  const renderHighlightedText = (text: string, highlights?: string[]) => {
    if (!highlights || highlights.length === 0) {
      return text
    }
    
    // Use the first highlight or fallback to original text
    const highlightedText = highlights[0] || text
    return <span dangerouslySetInnerHTML={{ __html: highlightedText }} />
  }
  
  
  // Infinite scroll effect
  useEffect(() => {
    const handleScroll = () => {
      if (window.innerHeight + document.documentElement.scrollTop >= document.documentElement.offsetHeight - 1000) {
        if (hasMore && !loading) {
          fetchNews(false) // false = don't reset, append to existing news
        }
      }
    }

    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [hasMore, loading, fetchNews])
  
  // When using search, we don't need additional filtering as it's done server-side
  const filteredNews = useMemo(() => {
    if (searchQuery.trim()) {
      return news // Search results are already filtered
    }
    
    // For regular browsing, apply client-side filtering if needed
    return news
  }, [news, searchQuery])

  return (
    <div className="min-h-screen bg-background mt-4">

      {/* Filters */}
      <div className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto">
          <div className="flex flex-col gap-3 sm:gap-4">
            
            {/* Search Metadata */}
            {searchMetadata && (
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-4 text-xs sm:text-sm text-muted-foreground bg-muted/50 px-3 py-2 rounded-md">
                <span className="flex-1 min-w-0">
                  Найдено <span className="font-medium">{searchMetadata.total_hits}</span> результатов
                  <span className="hidden sm:inline"> за {searchMetadata.took}ms</span>
                  {searchMetadata.max_score && (
                    <span className="hidden lg:inline"> (макс. релевантность: {searchMetadata.max_score.toFixed(2)})</span>
                  )}
                </span>
                <div className="flex items-center gap-2">
                  <select
                    className="h-8 px-2 sm:px-3 py-1 text-xs sm:text-sm border rounded-md bg-background touch-manipulation"
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as 'relevance' | 'date' | 'popularity')}
                  >
                    <option value="relevance">По релевантности</option>
                    <option value="date">По дате</option>
                    <option value="popularity">По популярности</option>
                  </select>
                </div>
              </div>
            )}
            
            {/* Category Filters */}
            <div className="space-y-2 mb-4" style={{ paddingLeft: "12px", paddingRight: "12px" }}>
              <div className="flex gap-1.5 sm:gap-2 overflow-x-auto scrollbar-hide pb-1 sm:flex-wrap sm:overflow-x-visible">
                {categories.map(category => {
                  const IconComponent = category.icon
                  return (
                    <Button
                      key={category.name}
                      variant={selectedCategory === category.name ? "default" : "outline"}
                      size="sm"
                      onClick={() => setSelectedCategory(category.name)}
                      className="flex items-center gap-1 text-xs sm:text-sm px-2 sm:px-3 py-1.5 sm:py-2 h-auto touch-manipulation flex-shrink-0"
                    >
                      {IconComponent && <IconComponent className="w-3 h-3 sm:w-4 sm:h-4" />}
                      <span className="whitespace-nowrap">{category.name}</span>
                    </Button>
                  )
                })}
              </div>
              <div className="flex gap-1.5 sm:gap-2 overflow-x-auto scrollbar-hide pb-1 sm:flex-wrap sm:overflow-x-visible">
                {/*<Button*/}
                {/*  variant="outline"*/}
                {/*  size="sm"*/}
                {/*  onClick={() => {*/}
                {/*    offsetRef.current = 0  // Reset offset on manual refresh*/}
                {/*    setFetchRequested(prev => prev + 1)*/}
                {/*  }}*/}
                {/*  className="text-xs sm:text-sm px-2 sm:px-3 py-1.5 sm:py-2 h-auto touch-manipulation flex-shrink-0"*/}
                {/*>*/}
                {/*  <RefreshCw className={`w-3 h-3 sm:w-4 sm:h-4 mr-1 ${loading ? 'animate-spin' : ''}`} />*/}
                {/*  Обновить*/}
                {/*</Button>*/}
                {(selectedTheme || selectedTag || searchQuery) && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={clearFilters}
                    className="text-xs sm:text-sm px-2 sm:px-3 py-1.5 sm:py-2 h-auto touch-manipulation flex-shrink-0"
                  >
                    Очистить все фильтры
                  </Button>
                )}
              </div>
            </div>
            
            {/* Active Filters Display */}
            {(selectedTheme || selectedTag) && (
              <div className="flex gap-1.5 sm:gap-2 overflow-x-auto scrollbar-hide pb-1 sm:flex-wrap sm:overflow-x-visible">
                <span className="text-xs sm:text-sm text-muted-foreground flex items-center flex-shrink-0">Активные фильтры:</span>
                {selectedTheme && (
                  <Badge variant="default" className="text-xs px-2 py-1 flex-shrink-0">
                    Тема: {selectedTheme}
                    <button
                      className="ml-1 hover:opacity-80 text-sm"
                      onClick={() => setSelectedTheme(null)}
                    >
                      ×
                    </button>
                  </Badge>
                )}
                {selectedTag && (
                  <Badge variant="default" className="text-xs px-2 py-1 flex-shrink-0">
                    Тег: {selectedTag}
                    <button
                      className="ml-1 hover:opacity-80 text-sm"
                      onClick={() => setSelectedTag(null)}
                    >
                      ×
                    </button>
                  </Badge>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* News Content */}
      <div className="container mx-auto px-3 sm:px-4 py-4 sm:py-6" style={{ marginTop: '12px'}}>
        <div className="space-y-4 sm:space-y-6">
          {filteredNews.length === 0 && !loading ? (
            <NotFoundPlaceholder
              onSourcesClick={() => {
                if (onNavigateToSources) {
                  onNavigateToSources()
                } else {
                  console.log('Navigate to sources - no handler provided')
                }
              }}
            />
          ) : (
            filteredNews.map((item) => {
            // Handle both search results format and regular news format
            const itemId = item._id || item.id || Math.random().toString()
            // Показываем оригинальную версию, если кнопка "Показать оригинал" нажата для этого элемента
            const isShowingOriginal = showOriginal.includes(itemId)
            const title = isShowingOriginal 
              ? (item.titleCanonicalOriginal || item.titleCanonical || item.title || 'No title')
              : (item.titleCanonical || item.title || 'No title')
            const content = isShowingOriginal 
              ? (item.summaryShortOriginal || item.summaryShort || item.content || item.description || 'No content')
              : (item.summaryShort || item.content || item.description || 'No content')
            const publishDate = item.publishedAt || item.created_at || new Date().toISOString()
            const topics = item.topics || []
            const tags = item.tags || []
            
            return (
              <Card key={itemId} className="w-full touch-manipulation">
                <CardHeader className="pb-2 sm:pb-3">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:gap-3">
                    <div className="flex items-center gap-2 sm:flex-col sm:items-start">
                      <Badge
                        className={`${getThemeColor(item.theme)} text-xs font-medium px-2 py-1 flex-shrink-0 cursor-pointer hover:opacity-80 transition-opacity touch-manipulation ${
                          selectedTheme === item.theme ? 'ring-2 ring-offset-1 ring-blue-500' : ''
                        }`}
                        onClick={() => handleThemeClick(item.theme)}
                      >
                        {item.theme}
                      </Badge>
                      {item.score && searchQuery && (
                        <Badge variant="secondary" className="text-xs sm:mt-2">
                          {item.score.toFixed(2)}
                        </Badge>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <CardTitle className="text-lg sm:text-xl leading-tight">
                        <a
                          href={item.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="hover:underline touch-manipulation"
                        >
                          {item.highlight?.title ? (
                            renderHighlightedText(title, item.highlight.title)
                          ) : (
                            title
                          )}
                        </a>
                      </CardTitle>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <p className="text-muted-foreground mb-3 sm:mb-4 leading-relaxed text-sm sm:text-base">
                    {item.highlight?.content ? (
                      renderHighlightedText(content, item.highlight.content)
                    ) : item.highlight?.description ? (
                      renderHighlightedText(content, item.highlight.description)
                    ) : (
                      content
                    )}
                  </p>
                  <div className="space-y-3 sm:space-y-0 sm:flex sm:items-center sm:justify-between text-xs sm:text-sm text-muted-foreground">
                    <div className="space-y-2 sm:space-y-0 sm:flex sm:items-center sm:gap-4 flex-1">
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-500 hover:text-blue-600 hover:underline touch-manipulation block sm:inline"
                      >
                        {item.source}
                      </a>
                      <div className="flex items-center gap-2 sm:gap-1">
                        <Clock className="w-3 h-3 sm:w-4 sm:h-4" />
                        <span>{new Date(publishDate).toLocaleDateString()}</span>
                        <span className="hidden sm:inline">
                          {new Date(publishDate).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="hidden sm:inline">Язык оригинала:</span>
                        <span>{getLanguageFlag(item.lang)}</span>
                      </div>
                      {(item.titleCanonical !== item.titleCanonicalOriginal) && item.titleCanonicalOriginal && (
                      <div className="flex items-center gap-1">
                        <Languages className="w-3 h-3 sm:w-4 sm:h-4" />
                        <span onClick={() => handleShowOriginal(itemId)} className="text-xs cursor-pointer hover:opacity-80 transition-opacity touch-manipulation">
                        {isShowingOriginal ? 'Показать перевод' : 'Показать оригинал'}
                        </span>
                      </div>
                      )}
                    </div>
                    <Button
                      size="sm"
                      asChild
                      className="w-full sm:w-auto touch-manipulation"
                    >
                      <a href={item.url} target="_blank" rel="noopener noreferrer">
                        Читать
                      </a>
                    </Button>
                  </div>
                  
                  {/* Topics and Tags at the bottom */}
                  <div className="mt-3 sm:mt-4 space-y-2">
                    {topics.length > 0 && (
                      <div className="flex flex-wrap gap-1 items-center">
                        <span className="text-xs text-muted-foreground">Темы:</span>
                        {topics.map((topic, index) => (
                          <Badge
                            key={index}
                            variant="secondary"
                            className="text-xs cursor-pointer hover:opacity-80 transition-opacity touch-manipulation px-2 py-1"
                            onClick={() => handleTopicClick(topic)}
                          >
                            {topic}
                          </Badge>
                        ))}
                      </div>
                    )}
                    {tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 items-center">
                        <span className="text-xs text-muted-foreground">Теги:</span>
                        {tags.map((tag, index) => (
                          <Badge
                            key={index}
                            variant="outline"
                            className={`text-xs cursor-pointer hover:opacity-80 transition-opacity touch-manipulation px-2 py-1 ${
                              selectedTag === tag ? 'ring-2 ring-offset-1 ring-blue-500' : ''
                            }`}
                            onClick={() => handleTagClick(tag)}
                          >
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )
          })
          )}

          {loading && (
            <div className="flex justify-center py-6 sm:py-8">
              <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          )}

          {!hasMore && news.length > 0 && (
            <div className="text-center text-muted-foreground py-6 sm:py-8 text-sm">
              Больше новостей нет
            </div>
          )}
        </div>

      </div>

    </div>
  )
}