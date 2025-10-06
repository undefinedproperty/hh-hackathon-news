import mongoose, { Document, Schema } from 'mongoose';

export interface INewsRaw extends Document {
  sourceId: mongoose.Types.ObjectId;
  sourceUrl: string;
  rawData: any;
  guid?: string;
  title?: string;
  link?: string;
  pubDate?: string;
  hasNormalized: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const NewsRawSchema: Schema = new Schema(
  {
    sourceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Source',
      required: true,
    },
    sourceUrl: {
      type: String,
      required: true,
    },
    rawData: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },
    guid: {
      type: String,
      sparse: true,
    },
    title: {
      type: String,
    },
    link: {
      type: String,
    },
    pubDate: {
      type: String,
    },
    hasNormalized: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
    collection: 'news-raw',
  }
);

NewsRawSchema.index({ sourceId: 1, guid: 1 }, { unique: true, sparse: true });
NewsRawSchema.index({ sourceId: 1, link: 1 }, { sparse: true });
NewsRawSchema.index({ createdAt: -1 });
NewsRawSchema.index({ hasNormalized: 1 });

export default mongoose.model<INewsRaw>('NewsRaw', NewsRawSchema);