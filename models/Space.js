import mongoose from "mongoose";

const SpaceSchema = new mongoose.Schema({
  owner:            { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  name:             { type: String, required: true },
  icon:             { type: String },
  language:         { type: String },
  tags:             [String],
  progress:         { type: Number, default: 0, min: 0, max: 100 },
  docsCount:        { type: Number, default: 0 },
  notesCount:       { type: Number, default: 0 },
  snippetsCount:    { type: Number, default: 0 },
  reposCount:       { type: Number, default: 0 },
  promptsCount:     { type: Number, default: 0 },
  communitiesCount: { type: Number, default: 0 }
}, { timestamps: true });

export default mongoose.model('Space', SpaceSchema);
