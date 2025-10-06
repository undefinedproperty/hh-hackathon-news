import mongoose, { Document, Schema } from 'mongoose';

interface ISubscribedSource {
  sourceId: mongoose.Types.ObjectId;
  enabled: boolean;
  subscribedAt?: Date;
}

export interface IUser extends Document {
  telegramId: number;
  username?: string;
  firstName?: string;
  lastName?: string;
  isActive: boolean;
  lastLoginAt?: Date;
  subscribedSources: ISubscribedSource[];
  dailyDigestEnabled: boolean;
  dailyDigestTime: string; // HH:mm format in Moscow timezone
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema: Schema = new Schema(
  {
    telegramId: {
      type: Number,
      required: true,
      unique: true,
    },
    firstName: {
      type: String,
      trim: true,
    },
    lastName: {
      type: String,
      trim: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    lastLoginAt: {
      type: Date,
    },
    subscribedSources: {
      type: [{
        sourceId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Source',
          required: true
        },
        enabled: {
          type: Boolean,
          default: true
        },
        subscribedAt: {
          type: Date,
          default: Date.now
        }
      }],
      default: []
    },
    dailyDigestEnabled: {
      type: Boolean,
      default: false,
    },
    dailyDigestTime: {
      type: String,
      default: '20:00',
      validate: {
        validator: function(time: string) {
          return /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(time);
        },
        message: 'Invalid time format. Use HH:mm format'
      }
    },
  },
  {
    timestamps: true,
  }
);

// Индексы
UserSchema.index({ telegramId: 1 }, { unique: true });
UserSchema.index({ isActive: 1 });
UserSchema.index({ lastLoginAt: -1 });

// Виртуальные поля
UserSchema.virtual('fullName').get(function() {
  if (this.firstName && this.lastName) {
    return `${this.firstName} ${this.lastName}`;
  }
  if (this.firstName) return this.firstName;
  if (this.lastName) return this.lastName;
  return this.username || `User${this.telegramId}`;
});

UserSchema.virtual('displayName').get(function() {
  return this.username || this.fullName;
});

// Методы экземпляра
UserSchema.methods.updateLastLogin = function() {
  this.lastLoginAt = new Date();
  return this.save();
};

UserSchema.methods.deactivate = function() {
  this.isActive = false;
  return this.save();
};

UserSchema.methods.activate = function() {
  this.isActive = true;
  return this.save();
};


// Статические методы
UserSchema.statics.findByTelegramId = function(telegramId: number) {
  return this.findOne({ telegramId });
};

export interface IUserModel extends mongoose.Model<IUser> {
  findByTelegramId(telegramId: number): Promise<IUser | null>;
  findActiveUsers(): Promise<IUser[]>;
  getInactiveUsers(days?: number): Promise<IUser[]>;
}

UserSchema.statics.findActiveUsers = function() {
  return this.find({ isActive: true });
};

UserSchema.statics.getInactiveUsers = function(days: number = 30) {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);

  return this.find({
    $or: [
      { lastLoginAt: { $lt: cutoffDate } },
      { lastLoginAt: { $exists: false }, createdAt: { $lt: cutoffDate } }
    ]
  });
};

export default mongoose.model<IUser, IUserModel>('User', UserSchema);
