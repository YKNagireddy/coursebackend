import * as videoService from "../services/videoService.js";

const respondError = (res, error, label) => {
  const statusCode = error.statusCode || 500;

  if (statusCode === 500) {
    console.error(`${label}:`, error);
  }

  return res.status(statusCode).json({
    success: false,
    message: error.statusCode ? error.message : "Something went wrong. Please try again.",
  });
};

export const getUploadSignatureController = async (req, res) => {
  try {
    const data = await videoService.getUploadSignature(req.body.moduleId, req.user.companyId);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return respondError(res, error, "Get upload signature error");
  }
};

export const createVideoController = async (req, res) => {
  try {
    const video = await videoService.createVideoRecord(req.body, req.user.userId, req.user.companyId);
    return res.status(201).json({ success: true, data: video });
  } catch (error) {
    return respondError(res, error, "Create video error");
  }
};

// Public: called by Cloudinary, not the browser. Authenticated by
// signature, not by a login session.
export const cloudinaryWebhookController = async (req, res) => {
  try {
    await videoService.handleCloudinaryNotification({
      rawBody: req.body.toString("utf8"),
      timestamp: req.headers["x-cld-timestamp"],
      signature: req.headers["x-cld-signature"],
    });
    return res.status(200).json({ success: true });
  } catch (error) {
    if (error.statusCode === 401) {
      console.error("Rejected Cloudinary webhook: bad signature");
      return res.status(401).json({ success: false, message: "Invalid signature" });
    }
    console.error("Cloudinary webhook error:", error);
    // Still 200 so Cloudinary doesn't retry a request we can't process.
    return res.status(200).json({ success: false });
  }
};

export const getVideoAdminController = async (req, res) => {
  try {
    const video = await videoService.getVideoAdmin(req.params.videoId, req.user.companyId);
    return res.status(200).json({ success: true, data: video });
  } catch (error) {
    return respondError(res, error, "Get video error");
  }
};

export const updateVideoController = async (req, res) => {
  try {
    const video = await videoService.updateVideoDetails(req.params.videoId, req.body, req.user.companyId);
    return res.status(200).json({ success: true, data: video });
  } catch (error) {
    return respondError(res, error, "Update video error");
  }
};

export const reorderVideosController = async (req, res) => {
  try {
    const videos = await videoService.reorderVideos(
      req.params.moduleId,
      req.body.orderedVideoIds,
      req.user.companyId
    );
    return res.status(200).json({ success: true, data: videos });
  } catch (error) {
    return respondError(res, error, "Reorder videos error");
  }
};

export const setPublishedController = async (req, res) => {
  try {
    const video = await videoService.setPublished(req.params.videoId, req.body.published, req.user.companyId);
    return res.status(200).json({ success: true, data: video });
  } catch (error) {
    return respondError(res, error, "Publish video error");
  }
};

export const deleteVideoController = async (req, res) => {
  try {
    const result = await videoService.deleteVideo(req.params.videoId, req.user.companyId);
    return res.status(200).json({ success: true, message: result.message });
  } catch (error) {
    return respondError(res, error, "Delete video error");
  }
};

export const getReplaceUploadSignatureController = async (req, res) => {
  try {
    const data = await videoService.getReplaceUploadSignature(req.params.videoId, req.user.companyId);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return respondError(res, error, "Get replace upload signature error");
  }
};

export const confirmReplaceController = async (req, res) => {
  try {
    const video = await videoService.confirmReplace(req.params.videoId, req.body, req.user.companyId);
    return res.status(200).json({ success: true, data: video });
  } catch (error) {
    return respondError(res, error, "Confirm replace error");
  }
};

export const getAdminPlaybackUrlController = async (req, res) => {
  try {
    const data = await videoService.getAdminPlaybackUrl(req.params.videoId, req.user.companyId);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return respondError(res, error, "Get admin playback url error");
  }
};

export const getPlaybackUrlController = async (req, res) => {
  try {
    const data = await videoService.getPlaybackUrl(req.params.videoId, req.user.userId, req.user.companyId);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return respondError(res, error, "Get playback url error");
  }
};

export const importVideoController = async (req, res) => {
  try {
    const video = await videoService.importVideoFromUrl(req.body, req.user.userId, req.user.companyId);
    return res.status(201).json({ success: true, data: video });
  } catch (error) {
    return respondError(res, error, "Import video error");
  }
};
