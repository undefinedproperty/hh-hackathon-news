import { OpenSearchService, NewsDocument } from './opensearch';
import NewsNormalized from '../models/NewsNormalized';
import NewsRaw from '../models/NewsRaw';

export class NewsDeduplicationService {
  private opensearchService: OpenSearchService;

  constructor() {
    this.opensearchService = new OpenSearchService();
  }

  async initialize(): Promise<void> {
    await this.opensearchService.initializeIndex();
  }

  async processNews(newsData: any): Promise<{ saved: boolean; reason: string; original?: any }> {
    try {
      console.log(`   🔍 Processing: "${newsData.title}"`);
      console.log(`   📅 Published: ${newsData.created_at}`);
      console.log(`   🏷️  Source: ${newsData.source}`);

      // Ensure we have proper content for hashing
      const contentText = newsData.content || newsData.description || newsData.summaryShort || '';
      const titleText = newsData.title || '';

      console.log(`   📄 Content length: ${contentText.length} chars`);
      console.log(`   📝 Title length: ${titleText.length} chars`);

      if (!titleText.trim()) {
        console.log(`   ❌ No title - skipping deduplication`);
        throw new Error('Article has no title');
      }

      // Convert MongoDB document to OpenSearch format
      const newsDocument: NewsDocument = {
        title: titleText,
        content: contentText,
        description: newsData.description || newsData.summaryShort,
        source: newsData.source,
        sourceId: newsData.sourceId, // Add missing sourceId field
        lang: newsData.lang,
        theme: newsData.theme,
        topics: newsData.topics || [],
        tags: newsData.tags || [],
        created_at: newsData.created_at || new Date(),
        url: newsData.url,
        image: newsData.image,
        summaryShortOriginal: newsData.summaryShortOriginal,
        titleCanonicalOriginal: newsData.titleCanonicalOriginal,
        score: newsData.score,
      };

      console.log(`   🔍 Checking OpenSearch for duplicates...`);

      // Check for duplicates with more conservative approach
      const duplicationResult = await this.opensearchService.checkForDuplicates(newsDocument);

      console.log(
        `   📊 Duplicate check result: isDuplicate=${duplicationResult.isDuplicate}, method=${duplicationResult.method}, score=${duplicationResult.similarity_score}`
      );

      if (duplicationResult.isDuplicate) {
        console.log(`   🚫 DUPLICATE DETECTED!`);
        console.log(
          `   📰 Original: "${duplicationResult.original?.title}" (${duplicationResult.original?.source})`
        );
        console.log(`   🔄 Current: "${newsData.title}" (${newsData.source})`);
        console.log(
          `   📊 Method: ${duplicationResult.method}, Score: ${duplicationResult.similarity_score}`
        );

        // Additional validation for confirmed duplicates - very high threshold to avoid false positives
        if (duplicationResult.similarity_score && duplicationResult.similarity_score >= 1.5) {
          console.log(`   ❌ DUPLICATE CONFIRMED - Rejecting`);
          return {
            saved: false,
            reason: `Confirmed duplicate (${duplicationResult.method}, score: ${duplicationResult.similarity_score?.toFixed(2)})`,
            original: duplicationResult.original,
          };
        } else {
          console.log(
            `   ⚠️  LOW CONFIDENCE MATCH - Saving anyway (score: ${duplicationResult.similarity_score})`
          );
          // Continue to save - might be a false positive
        }
      }

      console.log(`   💾 Saving to MongoDB...`);

      // No duplicate found or low-confidence duplicate, save to MongoDB and index in OpenSearch
      const normalizedNewsData = {
        newsRawId: newsData.newsRawId,
        sourceId: newsData.sourceId,
        externalId: newsData.externalId,
        source: newsData.source,
        url: newsData.url,
        titleCanonical: newsData.title,
        lang: newsData.lang,
        publishedAt: newsData.publishedAt || newsData.created_at,
        summaryShort: newsData.description || newsData.content,
        topics: newsData.topics || [],
        tags: newsData.tags || [],
        entities: newsData.entities || { orgs: [], people: [], products: [] },
        duplicateHint: newsData.duplicateHint,
        theme: newsData.theme,
        created_at: newsData.created_at,
        summaryShortOriginal: newsData.summaryShortOriginal,
        titleCanonicalOriginal: newsData.titleCanonicalOriginal,
        score: newsData.score,
      };

      const savedNews = await NewsNormalized.create(normalizedNewsData);
      console.log(`   ✅ Saved to MongoDB with ID: ${savedNews._id}`);

      // Index in OpenSearch with MongoDB _id
      console.log(`   🔍 Indexing in OpenSearch...`);
      newsDocument.id = (savedNews._id as string).toString();
      await this.opensearchService.indexNews(newsDocument);
      console.log(`   ✅ Indexed in OpenSearch`);

      return {
        saved: true,
        reason: 'New article saved successfully',
      };
    } catch (error) {
      console.error('❌ Error in news deduplication process:', error);

      try {
        // Fallback to MongoDB only if OpenSearch fails
        console.log(`   🔄 Fallback: Saving to MongoDB only...`);
        const normalizedNewsData = {
          newsRawId: newsData.newsRawId,
          sourceId: newsData.sourceId,
          externalId: newsData.externalId,
          source: newsData.source,
          url: newsData.url,
          titleCanonical: newsData.title,
          lang: newsData.lang,
          publishedAt: newsData.publishedAt || newsData.created_at,
          summaryShort: newsData.description || newsData.content,
          topics: newsData.topics || [],
          tags: newsData.tags || [],
          entities: newsData.entities || { orgs: [], people: [], products: [] },
          duplicateHint: newsData.duplicateHint,
          theme: newsData.theme,
          created_at: newsData.created_at,
        };

        const savedNews = await NewsNormalized.create(normalizedNewsData);
        console.log(`   ✅ Fallback save successful: ${savedNews._id}`);

        return {
          saved: true,
          reason: 'Saved to MongoDB (OpenSearch failed)',
        };
      } catch (fallbackError) {
        console.error('❌ Fallback save also failed:', fallbackError);
        return {
          saved: false,
          reason: `Save failed: ${fallbackError instanceof Error ? fallbackError.message : 'Unknown error'}`,
        };
      }
    }
  }

  async searchSimilarNews(
    title: string,
    content: string,
    limit: number = 5
  ): Promise<NewsDocument[]> {
    const newsDocument: NewsDocument = {
      title,
      content,
      source: '',
      created_at: new Date(),
    };

    const result = await this.opensearchService.checkForDuplicates(newsDocument);
    return result.candidates?.slice(0, limit) || [];
  }

  async syncExistingNews(): Promise<{ indexed: number; errors: number }> {
    let indexed = 0;
    let errors = 0;

    try {
      // Get all news from MongoDB that aren't indexed yet
      const existingNews = await NewsNormalized.find({}).limit(1000);

      for (const news of existingNews) {
        try {
          const newsDocument: NewsDocument = {
            id: (news._id as string).toString(),
            title: news.titleCanonical,
            content: news.summaryShort || '',
            description: news.summaryShort,
            source: news.source,
            lang: news.lang,
            theme: news.theme || undefined,
            topics: news.topics || [],
            tags: news.tags || [],
            created_at: news.createdAt || new Date(),
            url: news.url,
          };

          await this.opensearchService.indexNews(newsDocument);
          indexed++;
        } catch (error) {
          console.error(`Error indexing news ${news._id}:`, error);
          errors++;
        }
      }

      console.log(`Sync completed: ${indexed} indexed, ${errors} errors`);
    } catch (error) {
      console.error('Error during sync:', error);
      throw error;
    }

    return { indexed, errors };
  }

  async recreateIndexAndSync(): Promise<{ recreated: boolean; indexed: number; errors: number }> {
    try {
      console.log(`🚀 Starting index recreation and full sync...`);

      // Recreate the OpenSearch index with new mapping
      await this.opensearchService.recreateIndex();

      // Sync all existing news from MongoDB
      const syncResults = await this.syncExistingNews();

      console.log(`🎉 Full recreation and sync completed!`);
      console.log(`   📊 Results: ${syncResults.indexed} indexed, ${syncResults.errors} errors`);

      return {
        recreated: true,
        ...syncResults
      };
    } catch (error) {
      console.error('❌ Error during index recreation and sync:', error);
      throw error;
    }
  }

  async getDeduplicationStats(): Promise<any> {
    try {
      const response = await this.opensearchService.searchNews({});
      const totalIndexed = response.length;

      // Count documents with duplicate references
      const duplicatesResponse = await NewsNormalized.countDocuments({
        duplicate_of: { $exists: true, $ne: null },
      });

      return {
        totalIndexed,
        duplicatesFound: duplicatesResponse,
        deduplicationRate:
          totalIndexed > 0 ? ((duplicatesResponse / totalIndexed) * 100).toFixed(2) + '%' : '0%',
      };
    } catch (error) {
      console.error('Error getting deduplication stats:', error);
      return null;
    }
  }

  async findAndRemoveDuplicates(dryRun: boolean = true): Promise<{
    duplicatesFound: number;
    duplicatesRemoved: number;
    errors: number;
    details: Array<{
      title: string;
      originalTitle?: string;
      method: string;
      similarity: number;
      action: 'removed' | 'error' | 'dry-run';
      collections: string[];
      createdAt: string;
      originalCreatedAt?: string;
      reason: string;
    }>;
  }> {
    const results = {
      duplicatesFound: 0,
      duplicatesRemoved: 0,
      errors: 0,
      details: [] as Array<{
        title: string;
        originalTitle?: string;
        method: string;
        similarity: number;
        action: 'removed' | 'error' | 'dry-run';
        collections: string[];
        createdAt: string;
        originalCreatedAt?: string;
        reason: string;
      }>,
    };

    try {
      console.log(
        `🔍 Starting duplicate detection${dryRun ? ' (DRY RUN)' : ' and removal'} process...`
      );

      // Get all normalized news
      const allNews = await NewsNormalized.find({}).sort({ createdAt: 1 }); // Oldest first to keep the original
      console.log(`📊 Found ${allNews.length} normalized news articles to check`);

      // Group articles by similarity for better analysis
      const processedArticles = new Map<string, (typeof allNews)[0]>();
      const duplicatesToRemove: Array<{
        id: string;
        title: string;
        reason: string;
        original?: (typeof allNews)[0];
        similarity: number;
        method: string;
      }> = [];

      for (let i = 0; i < allNews.length; i++) {
        const currentNews = allNews[i];

        try {
          console.log(
            `\n🔍 Checking article ${i + 1}/${allNews.length}: "${currentNews.titleCanonical}"`
          );
          console.log(`   📅 Created: ${currentNews.createdAt}`);
          console.log(`   🏷️  Source: ${currentNews.source}`);

          let isDuplicate = false;
          let originalArticle: (typeof allNews)[0] | undefined;
          let duplicateMethod = '';
          let similarityScore = 0;

          // 1. Check for exact title matches first (using multiple similarity methods)
          for (const [hash, existingArticle] of processedArticles.entries()) {
            const advancedSimilarity = this.calculateTitleSimilarity(
              currentNews.titleCanonical.toLowerCase().trim(),
              existingArticle.titleCanonical.toLowerCase().trim()
            );
            const simpleSimilarity = this.calculateSimpleSimilarity(
              currentNews.titleCanonical.toLowerCase().trim(),
              existingArticle.titleCanonical.toLowerCase().trim()
            );

            console.log(`   🔍 Comparing with: "${existingArticle.titleCanonical}"`);
            console.log(`   📊 Advanced similarity: ${(advancedSimilarity * 100).toFixed(1)}%`);
            console.log(`   📊 Simple similarity: ${(simpleSimilarity * 100).toFixed(1)}%`);

            // Use multiple criteria for better detection
            const isExactMatch = advancedSimilarity > 0.85 || simpleSimilarity > 0.9;
            
            if (isExactMatch) {
              isDuplicate = true;
              originalArticle = existingArticle;
              duplicateMethod = simpleSimilarity > 0.9 ? 'simple_title_match' : 'advanced_title_match';
              similarityScore = Math.max(advancedSimilarity, simpleSimilarity);
              console.log(`   ✅ TITLE MATCH FOUND! (${duplicateMethod}, ${(similarityScore * 100).toFixed(1)}%)`);
              break;
            }
          }

          // 2. If no exact title match, check content similarity
          if (!isDuplicate) {
            // Create content hash for exact duplicate detection
            const contentForHash = (
              currentNews.titleCanonical +
              ' ' +
              (currentNews.summaryShort || '')
            )
              .toLowerCase()
              .trim();
            const contentHash = this.opensearchService.generateContentHash(contentForHash);

            console.log(`   🔢 Content hash: ${contentHash.substring(0, 16)}...`);

            // Check if we've seen this exact content before
            for (const [existingHash, existingArticle] of processedArticles.entries()) {
              const existingContentHash = this.opensearchService.generateContentHash(
                (existingArticle.titleCanonical + ' ' + (existingArticle.summaryShort || ''))
                  .toLowerCase()
                  .trim()
              );

              if (contentHash === existingContentHash) {
                isDuplicate = true;
                originalArticle = existingArticle;
                duplicateMethod = 'exact_content_hash';
                similarityScore = 1.0;
                console.log(`   ✅ EXACT CONTENT HASH MATCH FOUND!`);
                break;
              }
            }
          }

          // 3. If still no duplicate found, check semantic similarity via OpenSearch
          if (!isDuplicate && processedArticles.size > 0) {
            const newsDocument: NewsDocument = {
              title: currentNews.titleCanonical,
              content: currentNews.summaryShort || '',
              source: currentNews.source,
              created_at: currentNews.createdAt || new Date(),
              url: currentNews.url,
              lang: currentNews.lang || undefined,
              theme: currentNews.theme || undefined,
              score: currentNews.score || 0,
            };

            console.log(`   🧠 Checking semantic similarity via OpenSearch...`);
            const duplicationResult = await this.opensearchService.checkForDuplicates(newsDocument);

            if (
              duplicationResult.isDuplicate &&
              duplicationResult.similarity_score &&
              duplicationResult.similarity_score > 0.9
            ) {
              // Find the original in our processed articles
              for (const [hash, existingArticle] of processedArticles.entries()) {
                if (
                  duplicationResult.original &&
                  existingArticle.titleCanonical === duplicationResult.original.title
                ) {
                  isDuplicate = true;
                  originalArticle = existingArticle;
                  duplicateMethod = duplicationResult.method;
                  similarityScore = duplicationResult.similarity_score;
                  console.log(
                    `   ✅ SEMANTIC SIMILARITY MATCH FOUND! Score: ${(duplicationResult.similarity_score * 100).toFixed(1)}%`
                  );
                  break;
                }
              }
            }
          }

          if (isDuplicate && originalArticle) {
            console.log(`   🚫 DUPLICATE DETECTED!`);
            console.log(
              `   📰 Original: "${originalArticle.titleCanonical}" (${originalArticle.createdAt})`
            );
            console.log(
              `   🔄 Duplicate: "${currentNews.titleCanonical}" (${currentNews.createdAt})`
            );
            console.log(
              `   📊 Method: ${duplicateMethod}, Similarity: ${(similarityScore * 100).toFixed(1)}%`
            );

            duplicatesToRemove.push({
              id: (currentNews._id as string).toString(),
              title: currentNews.titleCanonical,
              reason: `${duplicateMethod}_similarity_${similarityScore.toFixed(2)}`,
              original: originalArticle,
              similarity: similarityScore,
              method: duplicateMethod,
            });

            results.duplicatesFound++;
            results.details.push({
              title: currentNews.titleCanonical,
              originalTitle: originalArticle.titleCanonical,
              method: duplicateMethod,
              similarity: similarityScore,
              action: dryRun ? 'dry-run' : 'removed',
              collections: ['news-normalized'],
              createdAt: currentNews.createdAt?.toISOString() || 'unknown',
              originalCreatedAt: originalArticle.createdAt?.toISOString() || 'unknown',
              reason: `Duplicate of "${originalArticle.titleCanonical}"`,
            });
          } else {
            console.log(`   ✅ UNIQUE - Adding to processed articles`);
            // Add to processed articles with content hash as key
            const contentHash = this.opensearchService.generateContentHash(
              (currentNews.titleCanonical + ' ' + (currentNews.summaryShort || ''))
                .toLowerCase()
                .trim()
            );
            processedArticles.set(contentHash, currentNews);
          }
        } catch (error) {
          console.error(`❌ Error processing news ${currentNews.titleCanonical}:`, error);
          results.errors++;
          results.details.push({
            title: currentNews.titleCanonical,
            method: 'error',
            similarity: 0,
            action: 'error',
            collections: [],
            createdAt: currentNews.createdAt?.toISOString() || 'unknown',
            reason: `Processing error: ${error instanceof Error ? error.message : 'unknown'}`,
          });
        }
      }

      if (dryRun) {
        console.log(`\n🧪 DRY RUN COMPLETED - No articles were actually removed`);
        console.log(`📊 Would remove ${duplicatesToRemove.length} duplicate articles`);
      } else {
        // Remove duplicates
        console.log(`\n🗑️  Removing ${duplicatesToRemove.length} duplicate articles...`);

        for (const duplicate of duplicatesToRemove) {
          try {
            // Remove from NewsNormalized collection
            await NewsNormalized.findByIdAndDelete(duplicate.id);

            // Find and mark corresponding NewsRaw as duplicate
            const correspondingRaw = await NewsRaw.findOne({
              $or: [
                {
                  'rawData.title': {
                    $regex: duplicate.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
                    $options: 'i',
                  },
                },
                {
                  title: {
                    $regex: duplicate.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
                    $options: 'i',
                  },
                },
              ],
            });

            if (correspondingRaw) {
              await NewsRaw.findByIdAndUpdate(correspondingRaw._id, {
                isDuplicate: true,
                duplicateReason: `Removed duplicate: ${duplicate.reason}`,
                hasNormalized: false,
              });

              // Update details to show both collections affected
              const detailIndex = results.details.findIndex((d) => d.title === duplicate.title);
              if (detailIndex >= 0) {
                results.details[detailIndex].collections = ['news-normalized', 'news-raw'];
              }
            }

            // Remove from OpenSearch index if exists
            try {
              await this.opensearchService.deleteDocument(duplicate.id);
            } catch (osError) {
              console.error(`❌ Error removing document from OpenSearch:`, osError);
              // Ignore if document doesn't exist in OpenSearch
            }

            results.duplicatesRemoved++;
            console.log(`✅ Removed duplicate: "${duplicate.title}"`);
            console.log(`   📰 Original was: "${duplicate.original?.titleCanonical}"`);
            console.log(
              `   📊 Method: ${duplicate.method}, Similarity: ${(duplicate.similarity * 100).toFixed(1)}%`
            );
          } catch (error) {
            console.error(`❌ Error removing duplicate ${duplicate.title}:`, error);
            results.errors++;

            const detailIndex = results.details.findIndex((d) => d.title === duplicate.title);
            if (detailIndex >= 0) {
              results.details[detailIndex].action = 'error';
            }
          }
        }
      }

      console.log(`\n🎉 Process completed!`);
      console.log(
        `📊 Summary: ${results.duplicatesFound} duplicates found${dryRun ? '' : `, ${results.duplicatesRemoved} removed`}, ${results.errors} errors`
      );
    } catch (error) {
      console.error('❌ Fatal error in duplicate detection process:', error);
      throw error;
    }

    return results;
  }

  private calculateTitleSimilarity(title1: string, title2: string): number {
    // Remove common words and normalize
    const commonWords = [
      'в', 'на', 'с', 'по', 'для', 'из', 'о', 'от', 'к', 'и', 'а', 'но', 'или',
      'что', 'как', 'за', 'до', 'при', 'со', 'во', 'не', 'же',
    ];

    const normalize = (text: string) =>
      text
        .toLowerCase()
        .replace(/[«»""„]/g, '"')
        .replace(/[—–]/g, '-')
        .replace(/[.,!?;:]/g, '')
        .replace(/\s+/g, ' ')
        .trim();

    const words1 = normalize(title1)
      .split(' ')
      .filter((w) => w.length > 2 && !commonWords.includes(w));
    const words2 = normalize(title2)
      .split(' ')
      .filter((w) => w.length > 2 && !commonWords.includes(w));

    console.log(`       🔍 Title similarity debug:`);
    console.log(`         Title 1: "${title1}"`);
    console.log(`         Title 2: "${title2}"`);
    console.log(`         Words 1: [${words1.join(', ')}]`);
    console.log(`         Words 2: [${words2.join(', ')}]`);

    if (words1.length === 0 || words2.length === 0) {
      console.log(`         Result: 0% (no meaningful words)`);
      return 0;
    }

    // Calculate Jaccard similarity
    const set1 = new Set(words1);
    const set2 = new Set(words2);
    const intersection = new Set([...set1].filter((x) => set2.has(x)));
    const union = new Set([...set1, ...set2]);
    const similarity = intersection.size / union.size;

    console.log(`         Common words: [${[...intersection].join(', ')}]`);
    console.log(`         Jaccard similarity: ${intersection.size}/${union.size} = ${(similarity * 100).toFixed(1)}%`);

    return similarity;
  }

  private calculateSimpleSimilarity(title1: string, title2: string): number {
    if (!title1 || !title2) return 0;

    const normalize = (text: string) =>
      text
        .toLowerCase()
        .trim()
        .replace(/[^\w\s]/g, '')
        .replace(/\s+/g, ' ');
    const norm1 = normalize(title1);
    const norm2 = normalize(title2);

    if (norm1 === norm2) return 1.0;

    const words1 = norm1.split(' ').filter((w) => w.length > 2);
    const words2 = norm2.split(' ').filter((w) => w.length > 2);

    if (words1.length === 0 || words2.length === 0) return 0;

    const set1 = new Set(words1);
    const set2 = new Set(words2);
    const intersection = new Set([...set1].filter((x) => set2.has(x)));
    const union = new Set([...set1, ...set2]);

    return intersection.size / union.size;
  }
}
