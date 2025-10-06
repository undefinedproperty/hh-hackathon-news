import crypto from 'crypto';
import { URL } from 'url';
import Source, { ISource } from '../models/Source';

interface RSSMetadata {
  title?: string;
  description?: string;
  link?: string;
  feedUrl?: string;
  items?: any[];
}

interface DuplicationCheckResult {
  isDuplicate: boolean;
  existingSource?: ISource;
  reason?: string;
  confidence: number; // 0-1, where 1 is 100% certain it's a duplicate
}

export class RSSDeduplicationService {

  /**
   * Нормализует URL для поиска дублей
   */
  private normalizeUrl(url: string): string {
    try {
      const urlObj = new URL(url);

      // Убираем www. префикс
      urlObj.hostname = urlObj.hostname.replace(/^www\./, '');

      // Приводим к нижнему регистру
      urlObj.hostname = urlObj.hostname.toLowerCase();
      urlObj.pathname = urlObj.pathname.toLowerCase();

      // Убираем trailing slash
      if (urlObj.pathname.endsWith('/') && urlObj.pathname.length > 1) {
        urlObj.pathname = urlObj.pathname.slice(0, -1);
      }

      // Убираем стандартные порты
      if ((urlObj.protocol === 'http:' && urlObj.port === '80') ||
          (urlObj.protocol === 'https:' && urlObj.port === '443')) {
        urlObj.port = '';
      }

      // Сортируем query параметры для консистентности
      const params = new URLSearchParams(urlObj.search);
      const sortedParams = new URLSearchParams();
      Array.from(params.keys()).sort().forEach(key => {
        sortedParams.append(key, params.get(key) || '');
      });
      urlObj.search = sortedParams.toString();

      return urlObj.toString();
    } catch {
      return url.toLowerCase();
    }
  }

  /**
   * Генерирует хеш контента для сравнения
   */
  private generateContentHash(metadata: RSSMetadata): string {
    const contentString = [
      metadata.title?.toLowerCase().trim(),
      metadata.description?.toLowerCase().trim(),
      this.normalizeUrl(metadata.link || ''),
      this.normalizeUrl(metadata.feedUrl || '')
    ]
    .filter(Boolean)
    .join('|');

    return crypto.createHash('md5').update(contentString).digest('hex');
  }

  /**
   * Вычисляет похожесть между двумя строками (Levenshtein distance)
   */
  private calculateStringSimilarity(str1: string = '', str2: string = ''): number {
    if (!str1 || !str2) return 0;

    const s1 = str1.toLowerCase().trim();
    const s2 = str2.toLowerCase().trim();

    if (s1 === s2) return 1;

    const matrix = [];
    const n = s1.length;
    const m = s2.length;

    if (n === 0) return m === 0 ? 1 : 0;
    if (m === 0) return 0;

    for (let i = 0; i <= m; i++) {
      matrix[i] = [i];
    }

    for (let j = 0; j <= n; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        if (s2.charAt(i - 1) === s1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            Math.min(matrix[i][j - 1] + 1, matrix[i - 1][j] + 1)
          );
        }
      }
    }

    const distance = matrix[m][n];
    const maxLength = Math.max(n, m);
    return maxLength === 0 ? 1 : (maxLength - distance) / maxLength;
  }

  /**
   * Извлекает домен из URL
   */
  private extractDomain(url: string): string {
    try {
      return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
    } catch {
      return '';
    }
  }

  /**
   * Проверяет, является ли новый источник дублем существующего
   */
  async checkForDuplicate(newUrl: string, metadata: RSSMetadata): Promise<DuplicationCheckResult> {
    try {
      const normalizedUrl = this.normalizeUrl(newUrl);
      const contentHash = this.generateContentHash(metadata);
      const domain = this.extractDomain(newUrl);

      // 1. Проверка точного совпадения URL
      const exactUrlMatch = await Source.findOne({
        link: { $in: [newUrl, normalizedUrl] }
      });

      if (exactUrlMatch) {
        return {
          isDuplicate: true,
          existingSource: exactUrlMatch,
          reason: 'Exact URL match',
          confidence: 1.0
        };
      }

      // 2. Получаем все источники с того же домена
      const sameDomainSources = await Source.find({
        link: { $regex: domain.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' }
      });

      if (sameDomainSources.length === 0) {
        return {
          isDuplicate: false,
          confidence: 0
        };
      }

      // 3. Проверяем похожесть контента
      let highestConfidence = 0;
      let bestMatch: ISource | undefined;
      let bestReason = '';

      for (const source of sameDomainSources) {
        const sourceMetadata = source.metadata as RSSMetadata;
        let confidence = 0;
        const reasons: string[] = [];

        // Проверяем похожесть заголовков
        const titleSimilarity = this.calculateStringSimilarity(
          metadata.title,
          sourceMetadata?.title
        );
        if (titleSimilarity > 0.85) {
          confidence += titleSimilarity * 0.4;
          reasons.push(`title similarity: ${Math.round(titleSimilarity * 100)}%`);
        }

        // Проверяем похожесть описаний
        const descSimilarity = this.calculateStringSimilarity(
          metadata.description,
          sourceMetadata?.description
        );
        if (descSimilarity > 0.8) {
          confidence += descSimilarity * 0.3;
          reasons.push(`description similarity: ${Math.round(descSimilarity * 100)}%`);
        }

        // Проверяем похожесть ссылок на сайт
        const linkSimilarity = this.calculateStringSimilarity(
          this.normalizeUrl(metadata.link || ''),
          this.normalizeUrl(sourceMetadata?.link || '')
        );
        if (linkSimilarity > 0.9) {
          confidence += linkSimilarity * 0.3;
          reasons.push(`website link similarity: ${Math.round(linkSimilarity * 100)}%`);
        }

        // Проверяем нормализованные URL
        const normalizedExisting = this.normalizeUrl(source.link);
        const urlSimilarity = this.calculateStringSimilarity(normalizedUrl, normalizedExisting);
        if (urlSimilarity > 0.8) {
          confidence += urlSimilarity * 0.2;
          reasons.push(`URL similarity: ${Math.round(urlSimilarity * 100)}%`);
        }

        if (confidence > highestConfidence) {
          highestConfidence = confidence;
          bestMatch = source;
          bestReason = reasons.join(', ');
        }
      }

      // Считаем дублем если уверенность больше 75%
      const isDuplicate = highestConfidence > 0.75;

      return {
        isDuplicate,
        existingSource: bestMatch,
        reason: bestReason || 'Content similarity analysis',
        confidence: highestConfidence
      };

    } catch (error) {
      console.error('Error in duplicate check:', error);
      return {
        isDuplicate: false,
        confidence: 0
      };
    }
  }

  /**
   * Находит все потенциальные дубли для существующего источника
   */
  async findPotentialDuplicates(sourceId: string, threshold: number = 0.7): Promise<{
    source: ISource;
    duplicates: Array<{
      source: ISource;
      confidence: number;
      reason: string;
    }>;
  }> {
    try {
      const source = await Source.findById(sourceId);
      if (!source) {
        throw new Error('Source not found');
      }

      const domain = this.extractDomain(source.link);
      const otherSources = await Source.find({
        _id: { $ne: sourceId },
        link: { $regex: domain.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' }
      });

      const duplicates = [];

      for (const otherSource of otherSources) {
        const result = await this.checkForDuplicate(otherSource.link, otherSource.metadata);
        if (result.confidence > threshold) {
          duplicates.push({
            source: otherSource,
            confidence: result.confidence,
            reason: result.reason || 'Similarity analysis'
          });
        }
      }

      return {
        source,
        duplicates: duplicates.sort((a, b) => b.confidence - a.confidence)
      };

    } catch (error) {
      console.error('Error finding duplicates:', error);
      throw error;
    }
  }

  /**
   * Получает статистику дублирования
   */
  async getDuplicationStats(): Promise<{
    totalSources: number;
    potentialDuplicates: number;
    duplicateGroups: Array<{
      domain: string;
      sources: ISource[];
      avgConfidence: number;
    }>;
  }> {
    try {
      const allSources = await Source.find({ public: true });
      const totalSources = allSources.length;

      const domainGroups = new Map<string, ISource[]>();

      // Группируем по доменам
      allSources.forEach(source => {
        const domain = this.extractDomain(source.link);
        if (!domainGroups.has(domain)) {
          domainGroups.set(domain, []);
        }
        domainGroups.get(domain)!.push(source);
      });

      const duplicateGroups = [];
      let potentialDuplicates = 0;

      for (const [domain, sources] of domainGroups) {
        if (sources.length > 1) {
          // Проверяем источники в этом домене
          let totalConfidence = 0;
          let pairCount = 0;

          for (let i = 0; i < sources.length; i++) {
            for (let j = i + 1; j < sources.length; j++) {
              const result = await this.checkForDuplicate(
                sources[j].link,
                sources[j].metadata
              );
              if (result.confidence > 0.5) {
                totalConfidence += result.confidence;
                pairCount++;
              }
            }
          }

          if (pairCount > 0) {
            duplicateGroups.push({
              domain,
              sources,
              avgConfidence: totalConfidence / pairCount
            });
            potentialDuplicates += sources.length;
          }
        }
      }

      return {
        totalSources,
        potentialDuplicates,
        duplicateGroups: duplicateGroups.sort((a, b) => b.avgConfidence - a.avgConfidence)
      };

    } catch (error) {
      console.error('Error getting duplication stats:', error);
      throw error;
    }
  }
}

export const rssDeduplicationService = new RSSDeduplicationService();