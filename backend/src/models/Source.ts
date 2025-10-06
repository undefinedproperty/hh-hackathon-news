import mongoose, { Document, Schema } from 'mongoose';

export interface ISource extends Document {
  link: string;
  url: string; // Alias for link for compatibility
  title: string;
  description?: string;
  category?: string;
  language?: string;
  favicon?: string;
  public: boolean;
  isActive: boolean; // Alias for active
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
  owner: mongoose.Schema.Types.ObjectId | null;
  type: 'rss' | 'telegram';
  metadata: {
    feedUrl: string;
    title: string;
    description: string;
    link: string;
    author: string;
  };
}

const SourceSchema: Schema = new Schema({
  link: {
    type: String,
    required: true,
    trim: true,
  },
  title: {
    type: String,
    required: true,
    trim: true,
  },
  description: {
    type: String,
    trim: true,
  },
  category: {
    type: String,
    trim: true,
  },
  language: {
    type: String,
    default: 'ru',
    trim: true,
  },
  favicon: {
    type: String,
    trim: true,
  },
  active: {
    type: Boolean,
    required: true,
    default: true,
  },
  public: {
    type: Boolean,
    required: true,
    default: false,
  },
  owner: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
  type: {
    type: String,
    required: true,
    enum: ['rss'],
  },
  metadata: {
    type: Object,
    required: true,
  },
}, {
  timestamps: true
});

// Виртуальные поля для совместимости
SourceSchema.virtual('url').get(function() {
  return this.link;
});

SourceSchema.virtual('isActive').get(function() {
  return this.active;
});

// Индексы
SourceSchema.index({ link: 1 }, { unique: true });
SourceSchema.index({ public: 1, active: 1 });
SourceSchema.index({ category: 1 });
SourceSchema.index({ language: 1 });

export default mongoose.model<ISource>('Source', SourceSchema);
