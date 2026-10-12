import {
  getProgress,
  saveProgress,
} from "../services/videoProgressService.js";

export const getProgressController = async (req, res, next) => {
  try {
    const { videoId } = req.params;

    const userId = req.user?.id || req.user?._id || req.user?.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const progress = await getProgress(videoId, userId);

    return res.status(200).json({
      success: true,
      data: progress,
    });
  } catch (error) {
    next(error);
  }
};

export const saveProgressController = async (req, res, next) => {
  try {
    const { videoId } = req.params;

    const userId = req.user?.id || req.user?._id || req.user?.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const { positionSeconds, completed } = req.body;

    const progress = await saveProgress(videoId, userId, {
      positionSeconds,
      completed,
    });

    return res.status(200).json({
      success: true,
      data: progress,
    });
  } catch (error) {
    next(error);
  }
};