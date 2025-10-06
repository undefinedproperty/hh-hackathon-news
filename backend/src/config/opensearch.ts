import { Client } from '@opensearch-project/opensearch';

const opensearchConfig = {
  node: process.env.OPENSEARCH_NODE,
  ssl: {
    rejectUnauthorized: false
  }
};

export const opensearchClient = new Client(opensearchConfig);

export const NEWS_INDEX = 'news-normalized';

export const newsIndexMapping = {
  mappings: {
    properties: {
      title: {
        type: 'text',
        analyzer: 'russian_analyzer',
        fields: {
          keyword: { type: 'keyword' }
        }
      },
      content: {
        type: 'text',
        analyzer: 'russian_analyzer'
      },
      description: {
        type: 'text',
        analyzer: 'russian_analyzer'
      },
      source: {
        type: 'keyword'
      },
      lang: {
        type: 'keyword'
      },
      theme: {
        type: 'keyword'
      },
      created_at: {
        type: 'date'
      },
      content_hash: {
        type: 'keyword'
      },
      title_hash: {
        type: 'keyword'
      },
      url: {
        type: 'keyword'
      },
      image: {
        type: 'keyword'
      },
      duplicate_of: {
        type: 'keyword'
      },
      similarity_score: {
        type: 'float'
      },
      topics: {
        type: 'text',
        analyzer: 'russian_analyzer',
        fields: {
          keyword: { type: 'keyword' }
        }
      },
      tags: {
        type: 'text',
        analyzer: 'russian_analyzer',
        fields: {
          keyword: { type: 'keyword' }
        }
      },
      sourceId: {
        type: 'keyword'
      }
    }
  },
  settings: {
    analysis: {
      analyzer: {
        russian_analyzer: {
          type: 'custom',
          tokenizer: 'standard',
          filter: [
            'lowercase',
            'russian_stop',
            'russian_stemmer'
          ]
        },
        news_analyzer: {
          type: 'custom',
          tokenizer: 'standard',
          filter: ['lowercase', 'stop', 'stemmer']
        }
      },
      filter: {
        russian_stop: {
          type: 'stop',
          stopwords: '_russian_'
        },
        russian_stemmer: {
          type: 'stemmer',
          language: 'russian'
        }
      }
    }
  }
};