import mongoose from "mongoose";
import CourseAccess from "../models/courseAccessModel.js";
import SignUp from "../models/signupModels.js";
import { getCourseOr404 } from "./courseService.js";
import { HttpError } from "../common/httpError.js";

export const grantAccess = async (courseId, studentId, adminId, companyId) => {
  await getCourseOr404(courseId, companyId);

  if (!mongoose.isValidObjectId(studentId)) {
    throw new HttpError(404, "Student not found");
  }

  // Student must be in the SAME company as the course.
  const student = await SignUp.findOne({ _id: studentId, companyId, role: "student" });

  if (!student) {
    throw new HttpError(404, "Student not found");
  }

  const grant = await CourseAccess.findOneAndUpdate(
    { courseId, userId: studentId },
    {
      companyId,
      courseId,
      userId: studentId,
      grantedBy: adminId,
      grantedAt: new Date(),
      revoked: false,
      revokedAt: null,
    },
    { upsert: true, new: true },
  );

  return grant;
};

export const revokeAccess = async (courseId, studentId, companyId) => {
  await getCourseOr404(courseId, companyId);

  const grant = await CourseAccess.findOneAndUpdate(
    { courseId, userId: studentId, companyId, revoked: false },
    { revoked: true, revokedAt: new Date() },
    { new: true },
  );

  if (!grant) {
    throw new HttpError(404, "This student doesn't have active access to revoke");
  }

  return grant;
};

export const listStudentsForCourse = async (courseId, companyId) => {
  await getCourseOr404(courseId, companyId);

  const grants = await CourseAccess.find({ courseId, companyId, revoked: false })
    .populate("userId", "name email")
    .sort({ grantedAt: -1 })
    .lean();

  return grants
    .filter((g) => g.userId)
    .map((g) => ({
      student: g.userId,
      grantedAt: g.grantedAt,
      grantedBy: g.grantedBy,
    }));
};