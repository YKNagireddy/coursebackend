import mongoose from "mongoose";

const videoProgressSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SignUp",
      required: true,
      index: true,
    },
    videoId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Video",
      required: true,
      index: true,
    },
    positionSeconds: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    completed: {
      type: Boolean,
      default: false,
    },
    lastWatchedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true, versionKey: false },
);

videoProgressSchema.index({ userId: 1, videoId: 1 }, { unique: true });

const VideoProgress = mongoose.model("VideoProgress", videoProgressSchema);
export default VideoProgress;
