import mongoose from "mongoose";
import Course from "../models/courseModel.js";
import Module from "../models/moduleModel.js";
import Video from "../models/videoModel.js";
import CourseAccess from "../models/courseAccessModel.js";
import { HttpError } from "../common/httpError.js";

export const createCourse = async ({ title, description, thumbnailUrl }, adminId, companyId) => {
  if (!title || !title.trim()) {
    throw new HttpError(400, "Course title is required");
  }

  return Course.create({
    companyId,
    title: title.trim(),
    description: description?.trim() || "",
    thumbnailUrl: thumbnailUrl || "",
    createdBy: adminId,
  });
};

export const updateCourse = async (
  courseId,
  companyId,
  { title, description, thumbnailUrl }
) => {
  if (!mongoose.isValidObjectId(courseId)) {
    throw new HttpError(404, "Course not found");
  }

  const cleanTitle = String(title || "").trim();

  if (!cleanTitle) {
    throw new HttpError(400, "Course title is required");
  }

  const course = await Course.findOneAndUpdate(
    {
      _id: courseId,
      companyId,
    },
    {
      $set: {
        title: cleanTitle,
        description: String(description || "").trim(),
        thumbnailUrl: thumbnailUrl || "",
      },
    },
    {
      new: true,
      runValidators: true,
    }
  ).lean();

  if (!course) {
    throw new HttpError(404, "Course not found");
  }

  return course;
};

export const deleteCourse = async (courseId, companyId) => {
  if (!mongoose.isValidObjectId(courseId)) {
    throw new HttpError(404, "Course not found");
  }

  // First check that the course belongs to this company
  const course = await Course.findOne({
    _id: courseId,
    companyId,
  });

  if (!course) {
    throw new HttpError(404, "Course not found");
  }

  // Delete course access records
  await CourseAccess.deleteMany({
    courseId: course._id,
  });

  // Delete videos belonging to this course
  await Video.deleteMany({
    courseId: course._id,
  });

  // Delete modules belonging to this course
  await Module.deleteMany({
    courseId: course._id,
  });

  // Finally delete the course
  await Course.deleteOne({
    _id: course._id,
    companyId,
  });

  return {
    id: course._id,
    title: course.title,
  };
};

export const listCoursesAdmin = async (companyId) => {
  const courses = await Course.find({ companyId }).sort({ createdAt: -1 }).lean();

  return Promise.all(
    courses.map(async (course) => {
      const [moduleCount, videoCount, studentCount] = await Promise.all([
        Module.countDocuments({ courseId: course._id }),
        Video.countDocuments({ courseId: course._id }),
        CourseAccess.countDocuments({ courseId: course._id, revoked: false }),
      ]);

      return { ...course, moduleCount, videoCount, studentCount };
    }),
  );
};

// Always scoped to the caller's company: another company's course
// looks exactly like a course that doesn't exist.
const getCourseOr404 = async (courseId, companyId) => {
  if (!mongoose.isValidObjectId(courseId)) {
    throw new HttpError(404, "Course not found");
  }

  const course = await Course.findOne({ _id: courseId, companyId });

  if (!course) {
    throw new HttpError(404, "Course not found");
  }

  return course;
};

export const getCourseAdmin = async (courseId, companyId) => {
  const course = await getCourseOr404(courseId, companyId);

  const modules = await Module.find({ courseId }).sort({ order: 1 }).lean();

  const videos = await Video.find({ courseId })
    .sort({ order: 1 })
    .select("-publicId")
    .lean();

  const videosByModule = new Map();
  for (const video of videos) {
    const key = video.moduleId.toString();
    if (!videosByModule.has(key)) videosByModule.set(key, []);
    videosByModule.get(key).push(video);
  }

  return {
    course,
    modules: modules.map((mod) => ({
      ...mod,
      videos: videosByModule.get(mod._id.toString()) || [],
    })),
  };
};

// ---------------------------------------------------------------------
// Student-facing views
// ---------------------------------------------------------------------

export const listCoursesForStudent = async (userId, companyId) => {
  const grants = await CourseAccess.find({ userId, revoked: false }).lean();
  const courseIds = grants.map((g) => g.courseId);

  if (courseIds.length === 0) return [];

  const courses = await Course.find({ _id: { $in: courseIds }, companyId })
    .sort({ createdAt: -1 })
    .lean();

  return Promise.all(
    courses.map(async (course) => {
      const publishedVideoCount = await Video.countDocuments({
        courseId: course._id,
        published: true,
      });

      return { ...course, publishedVideoCount };
    }),
  );
};

export const assertActiveAccess = async (courseId, userId) => {
  const grant = await CourseAccess.findOne({ courseId, userId, revoked: false });

  if (!grant) {
    throw new HttpError(403, "You don't have access to this course");
  }
};

export const getCourseForStudent = async (courseId, userId, companyId) => {
  const course = await getCourseOr404(courseId, companyId);

  await assertActiveAccess(courseId, userId);

  const modules = await Module.find({ courseId }).sort({ order: 1 }).lean();

  const videos = await Video.find({ courseId, published: true })
    .sort({ order: 1 })
    .select("title description order durationSeconds moduleId")
    .lean();

  const videosByModule = new Map();
  for (const video of videos) {
    const key = video.moduleId.toString();
    if (!videosByModule.has(key)) videosByModule.set(key, []);
    videosByModule.get(key).push(video);
  }

  return {
    course,
    modules: modules.map((mod) => ({
      ...mod,
      videos: videosByModule.get(mod._id.toString()) || [],
    })),
  };
};

export { getCourseOr404 };