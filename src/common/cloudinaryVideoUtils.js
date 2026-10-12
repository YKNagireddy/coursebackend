import crypto from "crypto";
import cloudinary from "../models/config/cloudinary.js";
import { HttpError } from "./httpError.js";

export const VIDEO_FOLDER = "course-videos";

// A public_id namespaced to a course so a student can't guess or reuse
// another course's asset id when confirming an upload.
export const buildPublicId = (companyId, courseId) =>
  `${VIDEO_FOLDER}/${companyId}/${courseId}/${crypto.randomUUID()}`;

/*
  Signs the parameters an admin's browser needs to upload a video
  straight to Cloudinary (never through our server — video files are
  too large for that). Cloudinary transcodes it in the background and
  POSTs the result to our webhook when it's done.
*/
export const buildUploadSignature = ({ publicId, notificationUrl }) => {
  const timestamp = Math.round(Date.now() / 1000);

  const paramsToSign = {
    timestamp,
    public_id: publicId,
    type: "authenticated",
    eager: "q_auto",
    eager_async: true,
  };

  // Cloudinary can't reach localhost, so only ask for a callback when we have a public URL.
  if (notificationUrl) paramsToSign.notification_url = notificationUrl;

  const signature = cloudinary.utils.api_sign_request(
    paramsToSign,
    process.env.CLOUDINARY_API_SECRET,
  );

  return {
    // These field names (public_id, eager_async, notification_url) must
    // match verbatim — they're posted straight to Cloudinary's upload form.
    ...paramsToSign,
    signature,
    apiKey: process.env.CLOUDINARY_API_KEY,
    cloudName: process.env.CLOUDINARY_CLOUD_NAME,
    uploadUrl: `https://api.cloudinary.com/v1_1/${process.env.CLOUDINARY_CLOUD_NAME}/video/upload`,
    // camelCase alias for our own API — the client echoes this back
    // verbatim when confirming the upload in POST /admin/videos.
    publicId,
  };
};

/*
  Cloudinary signs every webhook call with sha1(rawBody + timestamp + secret).
  rawBody must be the exact bytes Cloudinary sent — parse it AFTER this check,
  never before.
*/
export const verifyCloudinaryNotification = (rawBody, timestamp, signature) => {
  if (!rawBody || !timestamp || !signature) {
    return false;
  }

  const expected = crypto
    .createHash("sha1")
    .update(rawBody + timestamp + process.env.CLOUDINARY_API_SECRET)
    .digest("hex");

  // Reject stale notifications (Cloudinary retries for up to ~9 minutes,
  // but a replayed request from months ago should not be honored).
  const twoHoursAgo = Math.round(Date.now() / 1000) - 2 * 60 * 60;

  if (Number(timestamp) <= twoHoursAgo) {
    return false;
  }

  return (
    expected.length === signature.length &&
    crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature))
  );
};

// Authenticated assets must be destroyed with type: "authenticated", otherwise
// Cloudinary says "not found" and the file stays in your account.
export const destroyVideoAsset = async (publicId, type = "authenticated") => {
  try {
    await cloudinary.uploader.destroy(publicId, { resource_type: "video", type });
  } catch (error) {
    console.error(`Failed to delete Cloudinary asset ${publicId}:`, error);
  }
};

export const buildPlaybackUrl = (publicId, deliveryType = "authenticated") => {
  if (deliveryType === "upload") {
    // Public asset (e.g. uploaded by hand in the Cloudinary dashboard)
    return cloudinary.url(publicId, { resource_type: "video", type: "upload", secure: true });
  }

  return cloudinary.url(publicId, {
    resource_type: "video",
    type: "authenticated",
    sign_url: true,
    secure: true,
  });
};

// Turns a Cloudinary video URL into { publicId, type }.
export const parseCloudinaryVideoUrl = (rawUrl) => {
  let url;
  try {
    url = new URL(String(rawUrl || "").trim());
  } catch {
    throw new HttpError(400, "Enter a valid Cloudinary video URL");
  }

  if (url.hostname !== "res.cloudinary.com") {
    throw new HttpError(400, "Only Cloudinary URLs (res.cloudinary.com) are supported");
  }

  const [cloudName, resourceType, type, ...rest] = url.pathname.split("/").filter(Boolean);

  if (cloudName !== process.env.CLOUDINARY_CLOUD_NAME) {
    throw new HttpError(400, "This URL belongs to a different Cloudinary account");
  }
  if (resourceType !== "video") {
    throw new HttpError(400, "This is not a video URL");
  }
  if (type !== "upload" && type !== "authenticated") {
    throw new HttpError(400, "Only 'upload' and 'authenticated' videos are supported");
  }

  // Skip transformations / signature; the public_id starts after the version segment.
  const versionIndex = rest.findIndex((s) => /^v\d+$/.test(s));
  const idParts = versionIndex >= 0 ? rest.slice(versionIndex + 1) : rest;

  if (idParts.length === 0) {
    throw new HttpError(400, "Could not read the video id from this URL");
  }

  const last = idParts.length - 1;
  idParts[last] = idParts[last].replace(/\.(mp4|mov|webm|mkv|avi|m4v|ogv|flv|3gp|wmv)$/i, "");

  return { publicId: decodeURIComponent(idParts.join("/")), type };
};

// Asks Cloudinary for the asset's details. Returns null if it doesn't exist.
export const fetchVideoAsset = async (publicId, type) => {
  try {
    return await cloudinary.api.resource(publicId, { resource_type: "video", type });
  } catch (error) {
    const code = error?.error?.http_code ?? error?.http_code;
    if (code === 404) return null;
    throw error;
  }
};