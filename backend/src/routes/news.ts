import { Router, Request, Response } from 'express';
import NewsNormalized from '../models/NewsNormalized';
import User, { IUser } from '../models/User';
import { NewsDeduplicationService } from '../services/deduplication';
import { OpenSearchService } from '../services/opensearch';
import z from 'zod';

interface AuthenticatedRequest extends Request {
  user?: IUser;
}

const router = Router();
const deduplicationService = new NewsDeduplicationService();
const openSearchService = new OpenSearchService();

const getNewsSchema = z.object({
  lang: z.string().optional(),
  source: z.string().optional(),
  topic: z.string().optional(),
  theme: z.string().optional(),
  tag: z.string().optional(),
  offset: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : 0)),
  limit: z
    .string()
    .optional()
    .default('10')
    .transform((val) => parseInt(val, 10)),
});

const searchNewsSchema = z.object({
  q: z.string().min(2, 'Search query must be at least 2 characters long'),
  lang: z.string().optional(),
  source: z.string().optional(),
  sources: z
    .string()
    .optional()
    .transform((val) => (val ? val.split(',') : undefined)),
  theme: z.string().optional(),
  themes: z
    .string()
    .optional()
    .transform((val) => (val ? val.split(',') : undefined)),
  tags: z
    .string()
    .optional()
    .transform((val) => (val ? val.split(',') : undefined)),
  from_date: z
    .string()
    .optional()
    .refine((val) => !val || !isNaN(Date.parse(val)), {
      message: 'Invalid date format',
    }),
  to_date: z
    .string()
    .optional()
    .refine((val) => !val || !isNaN(Date.parse(val)), {
      message: 'Invalid date format',
    }),
  sort_by: z.enum(['relevance', 'date', 'popularity']).optional().default('relevance'),
  offset: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : 0)),
  limit: z
    .string()
    .optional()
    .default('10')
    .transform((val) => Math.min(parseInt(val, 10), 100)), // Max 100 results
  highlight: z
    .string()
    .optional()
    .transform((val) => val === 'true'),
  min_score: z
    .string()
    .optional()
    .transform((val) => (val ? parseFloat(val) : undefined)),
});

router.get('/', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const validatedData = getNewsSchema.parse(req.query);
    console.log(validatedData);

    const { offset, limit, topic, tag, ...queryFilters } = validatedData;

    // Map topic to theme for database query
    if (topic) {
      queryFilters.theme = topic;
    }

    // Handle tag filtering with MongoDB $in operator for array field
    let mongoQuery: any = queryFilters;
    if (tag) {
      mongoQuery = { ...queryFilters, tags: { $in: [tag] } };
    }

    // Filter by user's enabled sources if user is authenticated
    console.log('🔍 NEWS ENDPOINT - Authentication check:', {
      hasUser: !!req.user,
      userId: req.user?._id,
    });

    if (req.user) {
      console.log('🔍 NEWS ENDPOINT - User authenticated, fetching user data...');
      const user = await User.findById(req.user._id);

      console.log('🔍 NEWS ENDPOINT - User found:', {
        userId: user?._id,
        hasSubscribedSources: !!user?.subscribedSources,
        subscribedSourcesLength: user?.subscribedSources?.length || 0,
        subscribedSources: user?.subscribedSources,
      });

      if (user && user.subscribedSources.length > 0) {
        // Get only enabled source IDs
        const enabledSourceIds = user.subscribedSources
          .filter((sub: any) => sub.enabled)
          .map((sub: any) => sub.sourceId);

        console.log('🔍 NEWS ENDPOINT - Enabled sources filtering:', {
          totalSubscriptions: user.subscribedSources.length,
          enabledSourceIds: enabledSourceIds.length,
          enabledSourceIdsList: enabledSourceIds,
        });

        if (enabledSourceIds.length > 0) {
          console.log('🔍 NEWS ENDPOINT - Found enabled sources:', {
            enabledSourcesFound: enabledSourceIds.length,
            enabledSourceIds,
          });

          // Add sourceId filter to mongo query
          mongoQuery.sourceId = { $in: enabledSourceIds };
          console.log('🔍 NEWS ENDPOINT - Applied sourceId filter to mongoQuery:', {
            sourceIdFilter: mongoQuery.sourceId,
          });
        } else {
          console.log('🔍 NEWS ENDPOINT - User has subscriptions but no enabled sources, returning empty results');
          // User has subscriptions but no enabled sources, return empty results
          return res.json({
            news: [],
            pagination: {
              offset,
              limit,
              total: 0,
              hasMore: false,
              nextOffset: null,
            },
          });
        }
      } else {
        console.log('🔍 NEWS ENDPOINT - User has no subscribed sources, returning empty results');
        // User has no subscribed sources at all, return empty results
        return res.json({
          news: [],
          pagination: {
            offset,
            limit,
            total: 0,
            hasMore: false,
            nextOffset: null,
          },
        });
      }
    } else {
      console.log('🔍 NEWS ENDPOINT - No authenticated user, showing all news');
    }

    console.log('🔍 NEWS ENDPOINT - Final mongo query:', mongoQuery);

    // Build query with filters
    const query = NewsNormalized.find(mongoQuery);

    // Sort by publishedAt (freshest first), fallback to createdAt if publishedAt is missing
    query.sort({ publishedAt: -1, createdAt: -1 });

    // Apply pagination
    query.skip(offset).limit(limit);

    console.log('🔍 NEWS ENDPOINT - Executing query with pagination:', { offset, limit });

    const news = await query.exec();

    // Get total count for pagination metadata
    const totalCount = await NewsNormalized.countDocuments(mongoQuery);

    console.log('🔍 NEWS ENDPOINT - Query results:', {
      newsFound: news.length,
      totalCount,
      sources: [...new Set(news.map((n) => n.source))],
      newsIds: news
        .slice(0, 3)
        .map((n) => ({ id: n._id, title: n.titleCanonical?.slice(0, 50), source: n.source })),
    });

    res.json({
      news,
      pagination: {
        offset,
        limit,
        total: totalCount,
        hasMore: offset + limit < totalCount,
        nextOffset: offset + limit < totalCount ? offset + limit : null,
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET endpoint for deduplication stats
router.get('/stats', async (req: Request, res: Response) => {
  try {
    const stats = await deduplicationService.getDeduplicationStats();
    res.json(stats);
  } catch (error) {
    console.error('Error getting stats:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET endpoint to test OpenSearch analyzer
router.get('/test-search/:term', async (req: Request, res: Response) => {
  try {
    const { opensearchClient } = require('../config/opensearch');
    const { term } = req.params;

    console.log(`Testing search for term: "${term}"`);

    // Test with a simple match query first
    const simpleSearch = await opensearchClient.search({
      index: 'news-normalized',
      body: {
        query: {
          multi_match: {
            query: term,
            fields: ['title', 'content', 'description', 'theme', 'topics', 'tags'],
            fuzziness: 'AUTO'
          }
        },
        size: 5
      }
    });

    const results = simpleSearch.body.hits.hits.map((hit: any) => ({
      id: hit._id,
      score: hit._score,
      title: hit._source.title,
      theme: hit._source.theme,
      topics: hit._source.topics,
      tags: hit._source.tags
    }));

    res.json({
      searchTerm: term,
      totalHits: simpleSearch.body.hits.total?.value || 0,
      results
    });
  } catch (error) {
    console.error('Error testing search:', error);
    res.status(500).json({
      error: 'Error testing search',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// GET endpoint to check OpenSearch index status
router.get('/opensearch-status', async (req: Request, res: Response) => {
  try {
    const { opensearchClient } = require('../config/opensearch');

    // Check if index exists
    const indexExists = await opensearchClient.indices.exists({ index: 'news-normalized' });

    let indexStats = null;
    let sampleDocs = null;

    if (indexExists.body) {
      // Get index stats
      const stats = await opensearchClient.indices.stats({ index: 'news-normalized' });
      indexStats = {
        totalDocs: stats.body.indices['news-normalized']?.total?.docs?.count || 0,
        indexSize: stats.body.indices['news-normalized']?.total?.store?.size_in_bytes || 0
      };

      // Get a few sample documents to check mapping
      const sampleResponse = await opensearchClient.search({
        index: 'news-normalized',
        body: {
          query: { match_all: {} },
          size: 3
        }
      });

      sampleDocs = sampleResponse.body.hits.hits.map((hit: any) => ({
        id: hit._id,
        title: hit._source.title,
        theme: hit._source.theme,
        topics: hit._source.topics,
        tags: hit._source.tags,
        created_at: hit._source.created_at
      }));
    }

    res.json({
      indexExists: indexExists.body,
      indexStats,
      sampleDocs
    });
  } catch (error) {
    console.error('Error checking OpenSearch status:', error);
    res.status(500).json({
      error: 'Error checking OpenSearch status',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// POST endpoint to sync existing news to OpenSearch
router.post('/sync', async (req: Request, res: Response) => {
  try {
    const result = await deduplicationService.syncExistingNews();
    res.json({
      message: 'Sync completed',
      ...result,
    });
  } catch (error) {
    console.error('Error syncing news:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST endpoint to recreate index and sync all existing news
router.post('/recreate-index', async (req: Request, res: Response) => {
  try {
    console.log('🚀 Starting OpenSearch index recreation...');
    const result = await deduplicationService.recreateIndexAndSync();
    res.json({
      message: 'Index recreated and sync completed successfully',
      ...result,
    });
  } catch (error) {
    console.error('Error recreating index:', error);
    res.status(500).json({
      error: 'Failed to recreate index',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// POST endpoint to sync existing MongoDB news to OpenSearch
router.post('/sync-to-opensearch', async (req: Request, res: Response) => {
  try {
    console.log('🔄 Starting sync of existing MongoDB news to OpenSearch...');

    // Get all news from MongoDB
    const allNews = await NewsNormalized.find({}).limit(1000); // Process in batches
    console.log(`Found ${allNews.length} news items in MongoDB`);

    const { opensearchClient } = require('../config/opensearch');
    let synced = 0;
    let errors = 0;

    for (const news of allNews) {
      try {
        // Create OpenSearch document
        const opensearchDoc = {
          title: news.titleCanonical,
          content: news.summaryShort || '',
          description: news.summaryShort,
          source: news.source,
          sourceId: news.sourceId?.toString(), // Convert ObjectId to string
          lang: news.lang,
          theme: news.theme,
          topics: news.topics || [],
          tags: news.tags || [],
          created_at: news.createdAt || news.publishedAt,
          url: news.url,
        };

        // Index in OpenSearch with MongoDB _id as the document ID
        await opensearchClient.index({
          index: 'news-normalized',
          id: (news._id as any).toString(),
          body: opensearchDoc,
        });

        synced++;
        if (synced % 10 === 0) {
          console.log(`Synced ${synced}/${allNews.length} documents...`);
        }
      } catch (error) {
        console.error(`Error syncing news ${(news._id as any).toString()}:`, error);
        errors++;
      }
    }

    console.log(`✅ Sync completed: ${synced} synced, ${errors} errors`);

    res.json({
      message: 'Sync completed',
      synced,
      errors,
      total: allNews.length
    });
  } catch (error) {
    console.error('Error syncing to OpenSearch:', error);
    res.status(500).json({
      error: 'Failed to sync to OpenSearch',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// POST endpoint to find similar news
router.post('/similar', async (req: Request, res: Response) => {
  try {
    const { title, content, limit = 5 } = req.body;

    if (!title && !content) {
      return res.status(400).json({ error: 'Title or content is required' });
    }

    const similar = await deduplicationService.searchSimilarNews(
      title || '',
      content || '',
      parseInt(limit)
    );

    res.json({ similar });
  } catch (error) {
    console.error('Error finding similar news:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST endpoint to find and remove duplicates (test function)
router.post('/remove-duplicates', async (req: Request, res: Response) => {
  try {
    const { dryRun = true } = req.body;

    console.log(`🧪 Starting duplicate ${dryRun ? 'detection (dry run)' : 'removal'}...`);

    const results = await deduplicationService.findAndRemoveDuplicates(dryRun);

    res.json({
      success: true,
      message: dryRun ? 'Duplicate detection completed (dry run)' : 'Duplicate removal completed',
      dryRun,
      results,
    });
  } catch (error) {
    console.error('Error in duplicate process:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error during duplicate process',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// GET endpoint for advanced search using OpenSearch
router.get('/search', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const params = searchNewsSchema.parse(req.query);
    console.log('Search parameters:', params);

    const {
      q,
      lang,
      source,
      sources,
      theme,
      themes,
      tags,
      from_date,
      to_date,
      sort_by,
      offset,
      limit,
      highlight,
      min_score,
    } = params;

    // Build OpenSearch query
    const searchQuery: any = {
      bool: {
        must: [],
        filter: [],
        should: [],
        minimum_should_match: 0,
      },
    };

    // Main text search across title, content, themes, and tags
    if (q) {
      // Use a more flexible approach - combine multiple search strategies
      searchQuery.bool.should = [
        // Exact and fuzzy matching
        {
          multi_match: {
            query: q,
            fields: [
              'title^3',
              'content^2',
              'description^1.5',
              'theme^1.2',
              'topics^1.1',
              'tags^1.0',
            ],
            type: 'best_fields',
            fuzziness: 'AUTO',
            boost: 2.0,
          },
        },
        // Prefix matching for partial words
        {
          multi_match: {
            query: q,
            fields: ['title^2.5', 'content^1.5', 'description^1.2', 'topics^1.0', 'tags^1.0'],
            type: 'phrase_prefix',
            boost: 1.8,
          },
        },
        // Wildcard search
        {
          query_string: {
            query: `*${q}*`,
            fields: ['title^2', 'content^1', 'description^1', 'topics^1', 'tags^1'],
            boost: 1.5,
          },
        },
        // N-gram style matching
        {
          multi_match: {
            query: q,
            fields: ['title', 'content', 'description', 'topics', 'tags'],
            type: 'phrase',
            slop: 2,
            boost: 1.0,
          },
        },
      ];

      searchQuery.bool.minimum_should_match = 1;
      // Clear the must array since we're using should with minimum_should_match
      searchQuery.bool.must = [];
    }

    // Language filter
    if (lang) {
      searchQuery.bool.filter.push({ term: { lang } });
    }

    // Filter by user's enabled sources if user is authenticated
    if (req.user) {
      const user = await User.findById(req.user._id);
      if (user && user.subscribedSources.length > 0) {
        // Get only enabled source IDs
        const enabledSourceIds = user.subscribedSources
          .filter((sub: any) => sub.enabled)
          .map((sub: any) => sub.sourceId);

        if (enabledSourceIds.length > 0) {
          // Override any existing source filters with user's enabled sources
          searchQuery.bool.filter.push({
            terms: { sourceId: enabledSourceIds.map((id) => id.toString()) },
          });
        } else {
          // User has subscriptions but no enabled sources, return empty results
          return res.json({
            query: params.q,
            results: [],
            pagination: {
              offset: params.offset,
              limit: params.limit,
              total: 0,
              hasMore: false,
              nextOffset: null,
            },
            search_metadata: {
              took: 0,
              timed_out: false,
              max_score: 0,
              total_hits: 0,
              sort_by: params.sort_by,
              highlight_enabled: !!params.highlight,
            },
            filters_applied: {
              lang,
              sources: [],
              themes: themes || (theme ? [theme] : []),
              tags: tags || [],
              date_range: {
                from: from_date,
                to: to_date,
              },
            },
          });
        }
      } else {
        // User has no subscribed sources at all, return empty results
        return res.json({
          query: params.q,
          results: [],
          pagination: {
            offset: params.offset,
            limit: params.limit,
            total: 0,
            hasMore: false,
            nextOffset: null,
          },
          search_metadata: {
            took: 0,
            timed_out: false,
            max_score: 0,
            total_hits: 0,
            sort_by: params.sort_by,
            highlight_enabled: !!params.highlight,
          },
          filters_applied: {
            lang,
            sources: [],
            themes: themes || (theme ? [theme] : []),
            tags: tags || [],
            date_range: {
              from: from_date,
              to: to_date,
            },
          },
        });
      }
    }

    // Source filters (single or multiple) - only apply if user is not authenticated
    if (!req.user) {
      if (source) {
        searchQuery.bool.filter.push({ term: { source } });
      } else if (sources && sources.length > 0) {
        searchQuery.bool.filter.push({ terms: { source: sources } });
      }
    }

    // Theme filters (single or multiple)
    if (theme) {
      searchQuery.bool.filter.push({ term: { theme } });
    } else if (themes && themes.length > 0) {
      searchQuery.bool.filter.push({ terms: { theme: themes } });
    }

    // Tags filter (array field)
    if (tags && tags.length > 0) {
      searchQuery.bool.filter.push({ terms: { tags: tags } });
    }

    // Date range filter
    if (from_date || to_date) {
      const dateRange: any = {};
      if (from_date) dateRange.gte = from_date;
      if (to_date) dateRange.lte = to_date;

      searchQuery.bool.filter.push({
        range: { created_at: dateRange },
      });
    }

    // Build sorting
    let sort: any[] = [];
    switch (sort_by) {
      case 'date':
        sort.push({ created_at: { order: 'desc' } });
        break;
      case 'popularity':
        // Assuming we have a popularity score field, fallback to date
        sort.push({ _score: { order: 'desc' } }, { created_at: { order: 'desc' } });
        break;
      case 'relevance':
      default:
        sort.push({ _score: { order: 'desc' } }, { created_at: { order: 'desc' } });
        break;
    }

    // Build the full OpenSearch query
    const opensearchQuery: any = {
      index: 'news-normalized', // Use the same index as defined in config
      body: {
        query: searchQuery,
        sort,
        from: offset,
        size: limit,
      },
    };

    // Add highlighting if requested
    if (highlight) {
      opensearchQuery.body.highlight = {
        fields: {
          title: {
            pre_tags: ['<mark>'],
            post_tags: ['</mark>'],
            fragment_size: 100,
            number_of_fragments: 1,
          },
          content: {
            pre_tags: ['<mark>'],
            post_tags: ['</mark>'],
            fragment_size: 150,
            number_of_fragments: 3,
          },
          description: {
            pre_tags: ['<mark>'],
            post_tags: ['</mark>'],
            fragment_size: 100,
            number_of_fragments: 1,
          },
        },
      };
    }

    // Add minimum score filter if specified
    if (min_score) {
      opensearchQuery.body.min_score = min_score;
    }

    console.log('🔍 SEARCH DEBUG - Full OpenSearch query:', JSON.stringify(opensearchQuery, null, 2));
    console.log('🔍 SEARCH DEBUG - Query string:', q);
    console.log('🔍 SEARCH DEBUG - Query length:', q.length);

    // Execute the search using the opensearch client directly
    const { opensearchClient } = require('../config/opensearch');
    const response = await opensearchClient.search(opensearchQuery);

    console.log('🔍 SEARCH DEBUG - Raw OpenSearch response status:', response.statusCode);
    console.log('🔍 SEARCH DEBUG - Raw response body structure:', {
      hasBody: !!response.body,
      hasHits: !!response.body?.hits,
      hitsStructure: response.body?.hits ? Object.keys(response.body.hits) : 'No hits object'
    });

    // Process results
    const hits = response.body.hits.hits;
    const totalHits =
      typeof response.body.hits.total === 'number'
        ? response.body.hits.total
        : response.body.hits.total?.value || 0;

    console.log('🔍 SEARCH DEBUG - Hits processing:', {
      totalHitsRaw: response.body.hits.total,
      totalHitsProcessed: totalHits,
      hitsArrayLength: hits ? hits.length : 'No hits array',
      firstHitKeys: hits && hits[0] ? Object.keys(hits[0]) : 'No first hit'
    });

    const results = hits.map((hit: any) => {
      console.log('🔍 SEARCH DEBUG - Processing hit:', {
        id: hit._id,
        score: hit._score,
        sourceKeys: hit._source ? Object.keys(hit._source) : 'No source',
        title: hit._source?.title?.substring(0, 50) + '...',
        theme: hit._source?.theme,
        hasTopics: !!hit._source?.topics,
        hasTags: !!hit._source?.tags
      });

      return {
        id: hit._id,
        score: hit._score,
        ...hit._source,
        highlight: highlight ? hit.highlight : undefined,
        // Convert date back to Date object
        created_at: new Date(hit._source.created_at),
        // Ensure theme, tags, and topics are properly included
        theme: hit._source.theme,
        tags: hit._source.tags || [],
        topics: hit._source.topics || [],
      };
    });

    console.log('🔍 SEARCH DEBUG - Final results:', {
      resultsLength: results.length,
      totalHits: totalHits,
      sampleResult: results[0] ? {
        id: results[0].id,
        title: results[0].title?.substring(0, 50) + '...',
        theme: results[0].theme
      } : 'No results'
    });

    // Build aggregations for faceted search (optional enhancement)
    const aggregations = response.body.aggregations;

    res.json({
      query: q,
      results,
      pagination: {
        offset,
        limit,
        total: totalHits,
        hasMore: offset + limit < totalHits,
        nextOffset: offset + limit < totalHits ? offset + limit : null,
      },
      search_metadata: {
        took: response.body.took,
        timed_out: response.body.timed_out,
        max_score: response.body.hits.max_score,
        total_hits: totalHits,
        sort_by,
        highlight_enabled: !!highlight,
      },
      aggregations,
      filters_applied: {
        lang,
        sources: sources || (source ? [source] : []),
        themes: themes || (theme ? [theme] : []),
        tags: tags || [],
        date_range: {
          from: from_date,
          to: to_date,
        },
      },
    });
  } catch (error) {
    console.error('Search error:', error);

    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Invalid search parameters',
        details: error,
      });
    }

    res.status(500).json({
      error: 'Search service error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export { router as newsRoutes };
