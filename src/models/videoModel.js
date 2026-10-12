import mongoose from "mongoose";

const videoSchema = new mongoose.Schema(
  {
    moduleId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Module",
      required: true,
      index: true,
    },
    // Denormalized for quick access checks and course-level queries.
    courseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Course",
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
      default: "",
    },
    // Position among the module's videos.
    order: {
      type: Number,
      required: true,
      default: 0,
    },
    // Cloudinary public_id — never exposed to students directly;
    // playback goes through a signed URL built on request.
    publicId: {
      type: String,
      required: true,
    },
    durationSeconds: {
      type: Number,
      default: null,
    },
    sizeBytes: {
      type: Number,
      default: null,
    },
    format: {
      type: String,
      default: null,
    },
    // "processing" until Cloudinary's webhook confirms transcoding
    // finished. A video can only be published once it's "ready".
    status: {
      type: String,
      enum: ["processing", "ready", "failed"],
      default: "processing",
    },
    published: {
      type: Boolean,
      default: false,
    },
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SignUp",
      required: true,
    },
     companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      default: null,
      index: true,
    },
        // "upload" = uploaded through this app, "import" = added by pasting a Cloudinary URL
    source: { type: String, enum: ["upload", "import"], default: "upload" },
    // Cloudinary delivery type of the asset
    deliveryType: { type: String, enum: ["authenticated", "upload"], default: "authenticated" },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

const Video = mongoose.model("Video", videoSchema);
export default Video;
