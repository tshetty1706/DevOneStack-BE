import mongoose from "mongoose";

const SpaceSchema = new mongoose.Schema({
  owner:            { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  name:             { type: String, required: true, trim: true },
  description:      { type: String, default: '', trim: true, maxlength: 500 },
  tool:             { type: String, default: '', trim: true },
  thumbnail:        { type: String, default: '' },
  visibility:       { type: String, enum: ['public', 'private'], default: 'private', index: true },
  allowCloning:     { type: Boolean, default: true },
  
  // Private space request link
  requestLinkEnabled:{ type: Boolean, default: false },
  requestLinkToken:  { type: String, sparse: true, index: true, default: null },
  requestDescription:{ type: String, default: '', maxlength: 300, trim: true },
  
  // Clone lineage & credits
  clonedFrom:        { type: mongoose.Schema.Types.ObjectId, ref: 'Space', default: null },
  rootSpaceId:       { type: mongoose.Schema.Types.ObjectId, ref: 'Space', default: null },
  clonedFromOwner:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  clonedFromPrivate: { type: Boolean, default: false },
  clonePermissions:  {
    allowPublishing:   { type: Boolean, default: false },
    allowCollaborators:{ type: Boolean, default: false },
    allowOthersToClone:{ type: Boolean, default: false }
  },

  // Collaborators
  collaborators: [{
    user:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    role:    { type: String, enum: ['viewer', 'editor'], default: 'viewer' },
    addedAt: { type: Date, default: Date.now }
  }],

  starsCount:       { type: Number, default: 0, min: 0 },
  viewsCount:       { type: Number, default: 0, min: 0 },
  sharesCount:      { type: Number, default: 0, min: 0 },
  contributorsCount:{ type: Number, default: 1, min: 1 },
  starredBy:        [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  icon:             { type: String },
  iconKey:          { type: String },
  language:         { type: String },
  tags:             [String],
  template:         { type: String, default: 'blank' },
  enabledModules:   { type: [String], default: ['overview', 'explorer', 'notes', 'learnings', 'snippets', 'docs'] },
  readme:           { type: String, default: '' },
  progress:         { type: Number, default: 0, min: 0, max: 100 },
  docsCount:        { type: Number, default: 0, min: 0 },
  notesCount:       { type: Number, default: 0, min: 0 },
  learningsCount:   { type: Number, default: 0, min: 0 },
  snippetsCount:    { type: Number, default: 0, min: 0 },
  reposCount:       { type: Number, default: 0, min: 0 },
  promptsCount:     { type: Number, default: 0, min: 0 },
  imagesCount:      { type: Number, default: 0, min: 0 },
  communitiesCount: { type: Number, default: 0, min: 0 },
  isPinned:         { type: Boolean, default: false },
  isArchived:       { type: Boolean, default: false }
}, { timestamps: true });

SpaceSchema.index({ owner: 1, isPinned: -1, updatedAt: -1 });
SpaceSchema.index({ visibility: 1, updatedAt: -1 });
SpaceSchema.index({ starredBy: 1, visibility: 1 });
SpaceSchema.index({ visibility: 1, starsCount: -1, viewsCount: -1 });
SpaceSchema.index({ 'collaborators.user': 1 });

export default mongoose.model('Space', SpaceSchema);
