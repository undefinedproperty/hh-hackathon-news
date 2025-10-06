import mongoose, { Document, Schema } from 'mongoose';

export interface INewsNormalized extends Document {
  newsRawId: mongoose.Types.ObjectId;
  sourceId: mongoose.Types.ObjectId;
  externalId: string;
  source: string;
  url: string;
  titleCanonical: string;
  lang: string;
  publishedAt: string;
  summaryShort: string;
  topics: string[];
  tags: string[];
  entities: {
    orgs: string[];
    people: string[];
    products: string[];
  };
  duplicateHint: string | null;
  theme: string | null;
  createdAt: Date;
  updatedAt: Date;
  summaryShortOriginal: string;
  titleCanonicalOriginal: string;
  score: number;
}

const NewsNormalizedSchema: Schema = new Schema(
  {
    newsRawId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'NewsRaw',
      required: true,
    },
    sourceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Source',
      required: true,
    },
    externalId: {
      type: String,
      required: true,
    },
    source: {
      type: String,
      required: true,
    },
    url: {
      type: String,
      required: true,
    },
    titleCanonical: {
      type: String,
      required: true,
    },
    lang: {
      type: String,
      required: true,
    },
    publishedAt: {
      type: String,
      required: true,
    },
    summaryShort: {
      type: String,
      required: true,
    },
    topics: {
      type: [String],
      default: [],
    },
    tags: {
      type: [String],
      default: [],
    },
    entities: {
      orgs: {
        type: [String],
        default: [],
      },
      people: {
        type: [String],
        default: [],
      },
      products: {
        type: [String],
        default: [],
      },
    },
    duplicateHint: {
      type: String,
      default: null,
    },
    theme: {
      type: String,
      default: null,
    },
    summaryShortOriginal: {
      type: String,
      required: false,
    },
    titleCanonicalOriginal: {
      type: String,
      required: false,
    },
    score: {
      type: Number,
      required: false,
    },
  },
  {
    timestamps: true,
  }
);

NewsNormalizedSchema.index({ newsRawId: 1 });
NewsNormalizedSchema.index({ sourceId: 1 });
NewsNormalizedSchema.index({ externalId: 1 });
NewsNormalizedSchema.index({ url: 1 });
NewsNormalizedSchema.index({ lang: 1 });
NewsNormalizedSchema.index({ publishedAt: -1 });
NewsNormalizedSchema.index({ topics: 1 });
NewsNormalizedSchema.index({ tags: 1 });

export default mongoose.model<INewsNormalized>('NewsNormalized', NewsNormalizedSchema);
