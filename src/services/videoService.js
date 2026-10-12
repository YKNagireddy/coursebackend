import mongoose from "mongoose";
import Video from "../models/videoModel.js";
import { getModuleOr404 } from "./moduleService.js";
import { assertActiveAccess } from "./courseService.js";
import {
  buildPublicId,
  buildUploadSignature,
  verifyCloudinaryNotification,
  destroyVideoAsset,
  buildPlaybackUrl,
  parseCloudinaryVideoUrl,
  fetchVideoAsset,
  VIDEO_FOLDER,
} from "../common/cloudinaryVideoUtils.js";
import { HttpError } from "../common/httpError.js";

const WEBHOOK_PATH = "/api/videos/webhooks/cloudinary";

const notificationUrl = () => {
  const base = process.env.SERVER_PUBLIC_URL;
  if (!base) return null; // local dev: no webhook
  return `${base.replace(/\/$/, "")}${WEBHOOK_PATH}`;
};

// A public_id must live under this company's course folder.
const assertOwnedPublicId = (publicId, companyId, courseId) => {
  const expectedPrefix = `${VIDEO_FOLDER}/${companyId}/${courseId}/`;

  if (!publicId || !publicId.startsWith(expectedPrefix)) {
    throw new HttpError(400, "Invalid publicId for this course");
  }
};

// ---------------------------------------------------------------------
// Upload
// ---------------------------------------------------------------------

export const getUploadSignature = async (moduleId, companyId) => {
  const mod = await getModuleOr404(moduleId, companyId);

  const publicId = buildPublicId(companyId, mod.courseId);

  return {
    ...buildUploadSignature({ publicId, notificationUrl: notificationUrl() }),
    moduleId: mod._id,
    courseId: mod.courseId,
  };
};

export const createVideoRecord = async (
  { moduleId, title, description, publicId, durationSeconds, sizeBytes, format },
  adminId,
  companyId,
) => {
  const mod = await getModuleOr404(moduleId, companyId);

  if (!title || !title.trim()) {
    throw new HttpError(400, "Video title is required");
  }

  assertOwnedPublicId(publicId, companyId, mod.courseId);

  const order = await Video.countDocuments({ moduleId });

  return Video.create({
    companyId,
    moduleId,
    courseId: mod.courseId,
    title: title.trim(),
    description: description?.trim() || "",
    order,
    publicId,
    durationSeconds: durationSeconds ?? null,
    sizeBytes: sizeBytes ?? null,
    format: format ?? null,
    status: "ready",
    published: false,
    uploadedBy: adminId,
  });
};

// ---------------------------------------------------------------------
// Cloudinary webhook — processing status (no company: authenticated by signature)
// ---------------------------------------------------------------------

export const handleCloudinaryNotification = async ({ rawBody, timestamp, signature }) => {
  if (!verifyCloudinaryNotification(rawBody, timestamp, signature)) {
    throw new HttpError(401, "Invalid webhook signature");
  }

  const payload = JSON.parse(rawBody);
  const publicId = payload.public_id || payload.asset_id ? payload.public_id : null;

  if (!publicId) {
    return { acknowledged: true };
  }

  const video = await Video.findOne({ publicId });

  if (!video) {
    return { acknowledged: true };
  }

  const eagerFailed = Array.isArray(payload.eager)
    ? payload.eager.some((e) => e.status && e.status !== "ok")
    : false;

  if (payload.status === "error" || eagerFailed) {
    video.status = "failed";
  } else {
    video.status = "ready";
    if (payload.duration) video.durationSeconds = payload.duration;
    if (payload.bytes) video.sizeBytes = payload.bytes;
    if (payload.format) video.format = payload.format;
  }

  await video.save();

  return { acknowledged: true };
};

// ---------------------------------------------------------------------
// Admin CRUD
// ---------------------------------------------------------------------

export const getVideoOr404 = async (videoId, companyId) => {
  if (!mongoose.isValidObjectId(videoId)) {
    throw new HttpError(404, "Video not found");
  }

  const video = await Video.findOne({ _id: videoId, companyId });

  if (!video) {
    throw new HttpError(404, "Video not found");
  }

  return video;
};

export const getVideoAdmin = async (videoId, companyId) => getVideoOr404(videoId, companyId);

export const updateVideoDetails = async (videoId, { title, description }, companyId) => {
  const video = await getVideoOr404(videoId, companyId);

  if (title !== undefined) {
    if (!title.trim()) {
      throw new HttpError(400, "Video title cannot be empty");
    }
    video.title = title.trim();
  }

  if (description !== undefined) {
    video.description = description.trim();
  }

  await video.save();

  return video;
};

export const reorderVideos = async (moduleId, orderedVideoIds, companyId) => {
  await getModuleOr404(moduleId, companyId);

  const videos = await Video.find({ moduleId, companyId });

  if (
    !Array.isArray(orderedVideoIds) ||
    orderedVideoIds.length !== videos.length ||
    !videos.every((v) => orderedVideoIds.includes(v._id.toString()))
  ) {
    throw new HttpError(400, "orderedVideoIds must list every video in this module exactly once");
  }

  await Promise.all(
    orderedVideoIds.map((id, index) =>
      Video.updateOne({ _id: id, moduleId, companyId }, { order: index }),
    ),
  );

  return Video.find({ moduleId, companyId }).sort({ order: 1 });
};

export const setPublished = async (videoId, published, companyId) => {
  const video = await getVideoOr404(videoId, companyId);

  if (published && video.status !== "ready") {
    throw new HttpError(400, "Video can only be published once processing is complete");
  }

  video.published = Boolean(published);
  await video.save();

  return video;
};

export const deleteVideo = async (videoId, companyId) => {
  const video = await getVideoOr404(videoId, companyId);

  // Imported files were added by you in Cloudinary; deleting the record
  // here should not delete your original file.
  if (video.source !== "import") {
    await destroyVideoAsset(video.publicId, video.deliveryType);
  }

  await video.deleteOne();

  return { message: "Video deleted" };
};

// ---------------------------------------------------------------------
// Replace
// ---------------------------------------------------------------------

export const getReplaceUploadSignature = async (videoId, companyId) => {
  const video = await getVideoOr404(videoId, companyId);

  const publicId = buildPublicId(companyId, video.courseId);

  return {
    ...buildUploadSignature({ publicId, notificationUrl: notificationUrl() }),
    videoId: video._id,
  };
};

export const confirmReplace = async (
  videoId,
  { publicId, durationSeconds, sizeBytes, format },
  companyId,
) => {
  const video = await getVideoOr404(videoId, companyId);

  assertOwnedPublicId(publicId, companyId, video.courseId);

 const oldPublicId = video.publicId;
  const oldSource = video.source;
  const oldType = video.deliveryType;

  video.publicId = publicId;
  video.source = "upload";
  video.deliveryType = "authenticated";
  video.durationSeconds = durationSeconds ?? null;
  video.sizeBytes = sizeBytes ?? null;
  video.format = format ?? null;
  video.status = "ready";
  video.published = false;

  await video.save();
  if (oldSource !== "import") {
    await destroyVideoAsset(oldPublicId, oldType);
  }

  return video;
};

// ---------------------------------------------------------------------
// Playback
// ---------------------------------------------------------------------

export const getAdminPlaybackUrl = async (videoId, companyId) => {
  const video = await getVideoOr404(videoId, companyId);

 return { streamUrl: buildPlaybackUrl(video.publicId, video.deliveryType) };
};

export const getPlaybackUrl = async (videoId, userId, companyId) => {
  const video = await getVideoOr404(videoId, companyId);

  if (!video.published) {
    throw new HttpError(403, "This video isn't available yet");
  }

  await assertActiveAccess(video.courseId, userId);

  return { streamUrl: buildPlaybackUrl(video.publicId, video.deliveryType) };
};

// Adds a video that already exists in Cloudinary, from its URL.
export const importVideoFromUrl = async ({ moduleId, title, url }, adminId, companyId) => {
  const mod = await getModuleOr404(moduleId, companyId);

  if (!title || !title.trim()) {
    throw new HttpError(400, "Video title is required");
  }

  const { publicId, type } = parseCloudinaryVideoUrl(url);

  // Never import another company's course videos.
  if (
    publicId.startsWith(`${VIDEO_FOLDER}/`) &&
    !publicId.startsWith(`${VIDEO_FOLDER}/${companyId}/`)
  ) {
    throw new HttpError(403, "This video belongs to another company");
  }

  // Two records pointing at one file would break when either is deleted.
  if (await Video.exists({ publicId })) {
    throw new HttpError(409, "This video has already been added");
  }

  const asset = await fetchVideoAsset(publicId, type);

  if (!asset) {
    throw new HttpError(400, "Video not found in Cloudinary. Check the URL.");
  }

  const order = await Video.countDocuments({ moduleId });

  return Video.create({
    companyId,
    moduleId,
    courseId: mod.courseId,
    title: title.trim(),
    description: "",
    order,
    publicId,
    durationSeconds: asset.duration ?? null,
    sizeBytes: asset.bytes ?? null,
    format: asset.format ?? null,
    status: "ready",
    published: false,
    source: "import",
    deliveryType: type,
    uploadedBy: adminId,
  });
};