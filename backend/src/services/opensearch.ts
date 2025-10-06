import { opensearchClient, NEWS_INDEX, newsIndexMapping } from '../config/opensearch';
import crypto from 'crypto';

export interface NewsDocument {
  id?: string;
  title: string;
  content: string;
  description?: string;
  source: string;
  sourceId?: string;
  lang?: string;
  theme?: string;
  topics?: string[];
  tags?: string[];
  created_at: Date;
  url?: string;
  image?: string;
  content_hash?: string;
  title_hash?: string;
  duplicate_of?: string;
  similarity_score?: number;
  summaryShortOriginal?: string;
  titleCanonicalOriginal?: string;
  score?: number;
}

export interface DuplicationResult {
  isDuplicate: boolean;
  original?: NewsDocument;
  similarity_score?: number;
  method: 'hash' | 'text_similarity' | 'none';
  candidates?: NewsDocument[];
}

export class OpenSearchService {
  async initializeIndex(): Promise<void> {
    try {
      const indexExists = await opensearchClient.indices.exists({ index: NEWS_INDEX });

      if (!indexExists.body) {
        await opensearchClient.indices.create({
          index: NEWS_INDEX,
          body: newsIndexMapping as any,
        });
        console.log(`Created index: ${NEWS_INDEX}`);
      }
    } catch (error) {
      console.error('Error initializing OpenSearch index:', error);
      throw error;
    }
  }

  async recreateIndex(): Promise<void> {
    try {
      console.log(`🗑️  Checking if index ${NEWS_INDEX} exists...`);
      const indexExists = await opensearchClient.indices.exists({ index: NEWS_INDEX });

      if (indexExists.body) {
        console.log(`🗑️  Deleting existing index: ${NEWS_INDEX}`);
        await opensearchClient.indices.delete({ index: NEWS_INDEX });
        console.log(`✅ Index deleted successfully`);
      }

      console.log(`🆕 Creating new index with updated mapping...`);
      await this.initializeIndex();
      console.log(`✅ Index recreated successfully`);
    } catch (error) {
      console.error('Error recreating OpenSearch index:', error);
      throw error;
    }
  }

  generateContentHash(text: string): string {
    // Return special hash for empty or very short content to avoid false matches
    if (!text || text.trim().length < 10) {
      return crypto.createHash('sha256').update(`EMPTY_CONTENT_${Math.random()}`).digest('hex');
    }

    const normalized = text
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    // Still return random hash for very short normalized content
    if (normalized.length < 10) {
      return crypto.createHash('sha256').update(`SHORT_CONTENT_${Math.random()}`).digest('hex');
    }

    return crypto.createHash('sha256').update(normalized).digest('hex');
  }

  async indexNews(news: NewsDocument): Promise<string> {
    const contentHash = this.generateContentHash(news.title + ' ' + news.content);
    const titleHash = this.generateContentHash(news.title);

    const document = {
      ...news,
      content_hash: contentHash,
      title_hash: titleHash,
      created_at: news.created_at.toISOString(),
    };

    const response = await opensearchClient.index({
      index: NEWS_INDEX,
      body: document,
    });

    return response.body._id;
  }

  async checkForDuplicates(news: NewsDocument): Promise<DuplicationResult> {
    const titleText = news.title || '';
    const contentText = news.content || '';
    const combinedText = titleText + ' ' + contentText;

    console.log(`       📝 Title: "${titleText}" (${titleText.length} chars)`);
    console.log(
      `       📄 Content: "${contentText.substring(0, 100)}..." (${contentText.length} chars)`
    );

    // Skip hash matching for articles with insufficient content to avoid false positives
    const hasEnoughContent = combinedText.trim().length >= 20;
    console.log(`       📊 Has enough content for hash matching: ${hasEnoughContent}`);

    try {
      if (hasEnoughContent) {
        const contentHash = this.generateContentHash(combinedText);
        const titleHash = this.generateContentHash(titleText);

        console.log(
          `       🔢 Generated hashes: title=${titleHash.substring(0, 12)}..., content=${contentHash.substring(0, 12)}...`
        );
        console.log(`       🔍 Full title hash: ${titleHash}`);
        console.log(`       🔍 Full content hash: ${contentHash}`);

        // Check for exact hash match
        console.log(`       🔍 Checking exact hash matches...`);
        const exactMatch = await opensearchClient.search({
          index: NEWS_INDEX,
          body: {
            query: {
              bool: {
                should: [
                  { term: { content_hash: contentHash } },
                  { term: { title_hash: titleHash } },
                ],
                minimum_should_match: 1,
              },
            },
          },
        });

        const totalHits =
          typeof exactMatch.body.hits.total === 'number'
            ? exactMatch.body.hits.total
            : exactMatch.body.hits.total?.value || 0;

        console.log(`       📊 Exact hash matches found: ${totalHits}`);

        if (totalHits > 0) {
          console.log(`       🎯 Processing ${totalHits} hash matches:`);

          for (let i = 0; i < Math.min(totalHits, 3); i++) {
            const matchedDoc = exactMatch.body.hits.hits[i];
            const original = matchedDoc._source as NewsDocument;
            const matchType =
              matchedDoc._source?.title_hash === titleHash ? 'title_hash' : 'content_hash';

            console.log(`       📰 Match ${i + 1}: "${original.title}" (${matchType})`);
            console.log(`       📅 Original published: ${original.created_at}`);
            console.log(`       🏷️  Original source: ${original.source}`);

            // Enhanced validation with multiple similarity checks
            const originalTitle = (original.title || '').toLowerCase().trim();
            const currentTitle = titleText.toLowerCase().trim();
            const simpleTitleSimilarity = this.calculateSimpleSimilarity(
              originalTitle,
              currentTitle
            );
            const detailedTitleSimilarity = this.calculateDetailedSimilarity(
              originalTitle,
              currentTitle
            );
            const combinedSimilarity = this.calculateDetailedSimilarity(
              originalTitle + ' ' + (original.content || ''),
              currentTitle + ' ' + contentText
            );

            console.log(
              `       📊 Simple title similarity: ${(simpleTitleSimilarity * 100).toFixed(1)}%`
            );
            console.log(
              `       📊 Detailed title similarity: ${(detailedTitleSimilarity * 100).toFixed(1)}%`
            );
            console.log(
              `       📊 Combined content similarity: ${(combinedSimilarity * 100).toFixed(1)}%`
            );

            // Multiple criteria for duplicate detection
            const isHashDuplicate = matchType === 'title_hash' && titleHash === original.title_hash;
            const isSimpleDuplicate = simpleTitleSimilarity > 0.9; // Very high simple similarity
            const isDetailedDuplicate = detailedTitleSimilarity > 0.7; // High detailed similarity
            const isCombinedDuplicate = combinedSimilarity > 0.5 && detailedTitleSimilarity > 0.5; // Moderate combined similarity

            console.log(`       🔍 Detection criteria:`);
            console.log(`         - Hash match: ${isHashDuplicate}`);
            console.log(`         - Simple similarity (>90%): ${isSimpleDuplicate}`);
            console.log(`         - Detailed similarity (>70%): ${isDetailedDuplicate}`);
            console.log(
              `         - Combined similarity (>50% + title>50%): ${isCombinedDuplicate}`
            );

            if (
              isHashDuplicate ||
              isSimpleDuplicate ||
              isDetailedDuplicate ||
              isCombinedDuplicate
            ) {
              console.log(
                `       ✅ DUPLICATE CONFIRMED via ${
                  isHashDuplicate
                    ? 'hash match'
                    : isSimpleDuplicate
                      ? 'simple similarity'
                      : isDetailedDuplicate
                        ? 'detailed similarity'
                        : 'combined similarity'
                }`
              );
              return {
                isDuplicate: true,
                original,
                similarity_score: Math.max(
                  simpleTitleSimilarity,
                  detailedTitleSimilarity,
                  combinedSimilarity
                ),
                method: 'hash',
              };
            }
          }

          console.log(
            `       ⚠️  Hash matches found but similarity criteria not met - continuing to semantic search`
          );
        }
      } else {
        console.log(`       ⚠️  Insufficient content for hash matching - skipping hash check`);
      }

      // Text similarity search using More Like This - but with much higher threshold
      console.log(`       🧠 Checking semantic similarity...`);
      const similaritySearch = await opensearchClient.search({
        index: NEWS_INDEX,
        body: {
          query: {
            bool: {
              must: [
                {
                  more_like_this: {
                    fields: ['title^3', 'content'], // Increased title weight, removed description
                    like: [
                      {
                        _index: NEWS_INDEX,
                        doc: {
                          title: news.title,
                          content: news.content,
                        },
                      },
                    ],
                    min_term_freq: 1, // Allow more flexible matching
                    max_query_terms: 25, // Allow more query terms
                    minimum_should_match: '60%', // More flexible matching for cross-source duplicates
                  },
                },
              ],
              filter: [
                {
                  range: {
                    created_at: {
                      gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(), // Extended to 7 days to catch more potential duplicates
                    },
                  },
                },
                // Removed same-source filtering to allow cross-source duplicate detection
              ],
            },
          },
          min_score: 2.0, // Reduced threshold for better duplicate detection
        },
      });

      const hits = similaritySearch.body.hits.hits;
      console.log(`       📊 Semantic similarity candidates: ${hits.length}`);

      if (hits.length > 0) {
        const topMatch = hits[0];
        const rawScore = (topMatch._score as number) || 0;
        const similarityScore = rawScore / 10; // Normalize score

        console.log(`       🎯 Top match: "${(topMatch._source as NewsDocument).title}"`);
        console.log(`       📊 Raw score: ${rawScore}, Normalized: ${similarityScore.toFixed(3)}`);

        // Much more conservative threshold - only very high semantic similarity
        if (similarityScore > 1.5) {
          // Additional content validation - check if articles are actually about the same topic
          const originalTitle = (topMatch._source as NewsDocument).title || '';
          const originalContent = (topMatch._source as NewsDocument).content || '';
          const currentTitle = titleText || '';
          const currentContent = contentText || '';

          console.log(`       🔍 Additional content validation...`);
          const contentSimilarity = this.calculateDetailedSimilarity(
            originalTitle + ' ' + originalContent,
            currentTitle + ' ' + currentContent
          );

          console.log(
            `       📊 Detailed content similarity: ${(contentSimilarity * 100).toFixed(1)}%`
          );

          if (contentSimilarity > 0.5) {
            console.log(
              `       ✅ HIGH SIMILARITY MATCH CONFIRMED (${(similarityScore * 100).toFixed(1)}%)`
            );
            return {
              isDuplicate: true,
              original: topMatch._source as NewsDocument,
              similarity_score: similarityScore,
              method: 'text_similarity',
              candidates: hits.slice(1).map((hit: any) => hit._source as NewsDocument),
            };
          } else {
            console.log(`       ❌ CONTENT TOO DIFFERENT - Not a duplicate despite high score`);
          }
        } else {
          console.log(
            `       ⚠️  MODERATE SIMILARITY - Not considered duplicate (${(similarityScore * 100).toFixed(1)}%)`
          );
        }

        return {
          isDuplicate: false,
          method: 'none',
          candidates: hits.map((hit: any) => hit._source as NewsDocument),
        };
      }

      console.log(`       ✅ No similar articles found`);
      return {
        isDuplicate: false,
        method: 'none',
      };
    } catch (error) {
      console.error('       ❌ Error checking for duplicates:', error);
      // Return no duplicates on error
      return {
        isDuplicate: false,
        method: 'none',
      };
    }
  }

  async searchNews(query: Record<string, any>): Promise<NewsDocument[]> {
    try {
      const response = await opensearchClient.search({
        index: NEWS_INDEX,
        body: {
          query: {
            bool: {
              must: Object.entries(query).map(([key, value]) => ({
                term: { [key]: value },
              })),
            },
          },
          sort: [{ created_at: { order: 'desc' } }],
        },
      });

      return response.body.hits.hits.map((hit: any) => ({
        id: hit._id,
        ...hit._source,
        created_at: new Date(hit._source.created_at),
      }));
    } catch (error) {
      console.error('Error searching news:', error);
      return [];
    }
  }

  async updateDuplicateReference(
    duplicateId: string,
    originalId: string,
    similarityScore: number
  ): Promise<void> {
    await opensearchClient.update({
      index: NEWS_INDEX,
      id: duplicateId,
      body: {
        doc: {
          duplicate_of: originalId,
          similarity_score: similarityScore,
        },
      },
    });
  }

  async deleteDocument(id: string): Promise<void> {
    await opensearchClient.delete({
      index: NEWS_INDEX,
      id,
    });
  }

  private calculateSimpleSimilarity(text1: string, text2: string): number {
    if (!text1 || !text2) return 0;

    const normalize = (text: string) =>
      text
        .toLowerCase()
        .trim()
        .replace(/[^\w\s]/g, '')
        .replace(/\s+/g, ' ');
    const norm1 = normalize(text1);
    const norm2 = normalize(text2);

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

  private calculateDetailedSimilarity(text1: string, text2: string): number {
    if (!text1 || !text2) return 0;

    // Normalize text - remove punctuation, extra spaces, convert to lowercase
    const normalize = (text: string) =>
      text
        .toLowerCase()
        .replace(/[«»\"\"„']/g, '') // Remove quotes
        .replace(/[—–-]/g, ' ') // Replace dashes with spaces
        .replace(/[.,!?;:()]/g, ' ') // Replace punctuation with spaces
        .replace(/\s+/g, ' ') // Normalize spaces
        .trim();

    const norm1 = normalize(text1);
    const norm2 = normalize(text2);

    // Extract meaningful words (longer than 2 characters)
    const getWords = (text: string) =>
      text
        .split(' ')
        .filter((word) => word.length > 2)
        .filter(
          (word) =>
            ![
              'для',
              'как',
              'что',
              'это',
              'все',
              'она',
              'они',
              'его',
              'её',
              'их',
              'был',
              'была',
              'были',
              'при',
              'над',
              'под',
              'про',
              'без',
              'через',
            ].includes(word)
        );

    const words1 = getWords(norm1);
    const words2 = getWords(norm2);

    if (words1.length === 0 || words2.length === 0) return 0;

    // Calculate weighted similarity
    const set1 = new Set(words1);
    const set2 = new Set(words2);
    const intersection = new Set([...set1].filter((x) => set2.has(x)));

    // Weight by both intersection and coverage of each text
    const jaccardSimilarity = intersection.size / new Set([...set1, ...set2]).size;
    const coverage1 = intersection.size / set1.size;
    const coverage2 = intersection.size / set2.size;

    // Average of jaccard similarity and minimum coverage
    return (jaccardSimilarity + Math.min(coverage1, coverage2)) / 2;
  }
}
