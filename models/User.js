import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const UserSchema = new mongoose.Schema({
  username: { type: String, unique: true, sparse: true, trim: true },
  email: { type: String, unique: true, sparse: true, lowercase: true, trim: true },
  passwordHash: { type: String, select: false },
  googleId: { type: String, unique: true, sparse: true },
  avatarUrl: { type: String },
  googleAvatarUrl: { type: String },
  displayName: { type: String },
  bio: { type: String, default: '' },
  role: { type: String, default: '' },
  skills: [{ type: String, trim: true }],
  phone: { type: String, default: '' },
  location: { type: String, default: '' },
  website: { type: String, default: '' },
  socials: {
    github: { type: String, default: '' },
    linkedin: { type: String, default: '' },
    twitter: { type: String, default: '' },
    website: { type: String, default: '' },
  },
  education: [
    {
      institution: { type: String, default: '' },
      degree: { type: String, default: '' },
      fieldOfStudy: { type: String, default: '' },
      startYear: { type: String, default: '' },
      endYear: { type: String, default: '' },
    }
  ],
  provider: { type: String, enum: ['local', 'google'], default: 'local' },
  isVerified: { type: Boolean, default: false },
  verifyToken: { type: String, select: false },
  verifyTokenExpiry: { type: Date, select: false },
  resetToken: { type: String, select: false },
  resetTokenExpiry: { type: Date, select: false },
  loginAttempts: { type: Number, default: 0 },
  lockUntil: { type: Date },
}, { timestamps: true });

UserSchema.pre('save', async function (next) {
  if (!this.isModified('passwordHash')) return next();
  this.passwordHash = await bcrypt.hash(this.passwordHash, 12);
  next();
});

UserSchema.methods.comparePassword = async function (plain) {
  if (!this.passwordHash) return false;
  return bcrypt.compare(plain, this.passwordHash);
};

UserSchema.virtual('isLocked').get(function () {
  return this.lockUntil && this.lockUntil > Date.now();
});

UserSchema.index({ displayName: 1 });

export default mongoose.model('User', UserSchema);