import VideoProgress from "../models/videoProgressModel.js";
import Video from "../models/videoModel.js";
import { assertActiveAccess } from "./courseService.js";
import { HttpError } from "../common/httpError.js";

const getVideoOr404 = async (videoId) => {
  const video = await Video.findById(videoId).select("courseId durationSeconds published").lean();
  if (!video) throw new HttpError(404, "Video not found");
  return video;
};

const normalisePosition = (positionSeconds, durationSeconds) => {
  const value = Number(positionSeconds);
  if (!Number.isFinite(value) || value < 0) {
    throw new HttpError(400, "positionSeconds must be a non-negative number");
  }

  if (durationSeconds && Number.isFinite(durationSeconds)) {
    return Math.min(value, durationSeconds);
  }
  return value;
};

export const getProgress = async (videoId, userId) => {
  const video = await getVideoOr404(videoId);
  await assertActiveAccess(video.courseId, userId);

  const progress = await VideoProgress.findOne({ userId, videoId }).lean();
  return progress || {
    videoId,
    positionSeconds: 0,
    completed: false,
    lastWatchedAt: null,
  };
};

export const saveProgress = async (videoId, userId, { positionSeconds, completed }) => {
  const video = await getVideoOr404(videoId);
  await assertActiveAccess(video.courseId, userId);

  if (!video.published) {
    throw new HttpError(403, "This video isn't available yet");
  }

  const position = normalisePosition(positionSeconds, video.durationSeconds);
  const isCompleted = completed === true ||
    (video.durationSeconds && position >= Math.max(0, video.durationSeconds - 5));

  return VideoProgress.findOneAndUpdate(
    { userId, videoId },
    {
      $set: {
        positionSeconds: position,
        completed: Boolean(isCompleted),
        lastWatchedAt: new Date(),
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).lean();
};
