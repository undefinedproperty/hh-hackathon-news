export interface IngestorInput {
  batch_id: string;
  items: IngestorItem[];
}

export interface IngestorItem {
  id: string;
  source: string;
  url: string;
  title: string;
  raw_text?: string;
  published_at: string;
  raw_data: Record<string, unknown>;
}

export interface IngestorOutput {
  normalized: NormalizedItem[];
  issues: string[];
}

export interface NormalizedItem {
  external_id: string;
  source: string;
  url: string;
  title_canonical: string;
  lang: string;
  published_at: string;
  summary_short: string;
  summary_short_original: string;
  title_canonical_original: string;
  topics: string[];
  tags: string[];
  entities: {
    orgs: string[];
    people: string[];
    products: string[];
  };
  duplicate_hint: string | null;
  theme: string | null;
  score: number;
}

export interface AIAgentResponse {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
  };
}
