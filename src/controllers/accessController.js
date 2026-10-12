import * as accessService from "../services/accessService.js";

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

export const grantAccessController = async (req, res) => {
  try {
    const grant = await accessService.grantAccess(
      req.params.courseId,
      req.body.studentId,
      req.user.userId,
      req.user.companyId
    );
    return res.status(200).json({ success: true, data: grant });
  } catch (error) {
    return respondError(res, error, "Grant access error");
  }
};

export const revokeAccessController = async (req, res) => {
  try {
    const grant = await accessService.revokeAccess(req.params.courseId, req.params.studentId, req.user.companyId);
    return res.status(200).json({ success: true, data: grant });
  } catch (error) {
    return respondError(res, error, "Revoke access error");
  }
};

export const listStudentsForCourseController = async (req, res) => {
  try {
    const students = await accessService.listStudentsForCourse(req.params.courseId, req.user.companyId);
    return res.status(200).json({ success: true, data: students });
  } catch (error) {
    return respondError(res, error, "List course students error");
  }
};
