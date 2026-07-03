import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
    {
        name: { type: String, required: true },
        email: { type: String, required: true, unique: true, lowercase: true },
        avatar: { type: String },
        password: { type: String, select: false }, // only for email/password users
        provider: { type: String, enum: ["local", "google", "github"], required: true },
        providerId: { type: String }, // google sub / github id
        refreshToken: { type: String, select: false },
    },
    { timestamps: true }
);

export default mongoose.model("User", userSchema);