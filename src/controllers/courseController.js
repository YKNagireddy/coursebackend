import * as courseService from "../services/courseService.js";

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

export const createCourseController = async (req, res) => {
  try {
    const course = await courseService.createCourse(req.body, req.user.userId, req.user.companyId);
    return res.status(201).json({ success: true, data: course });
  } catch (error) {
    return respondError(res, error, "Create course error");
  }
};

export const updateCourseController = async (req, res) => {
  try {
    const { courseId } = req.params;

    const course = await updateCourse(
      courseId,
      req.user.companyId,
      req.body
    );

    return res.status(200).json({
      success: true,
      message: "Course updated successfully",
      data: course,
    });
  } catch (error) {
    console.error("Update course error:", error);

    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message,
      });
    }

    return res.status(500).json({
      success: false,
      message: "Something went wrong. Please try again.",
    });
  }
};

export const deleteCourseController = async (req, res) => {
  try {
    const { courseId } = req.params;

    const course = await deleteCourse(
      courseId,
      req.user.companyId
    );

    return res.status(200).json({
      success: true,
      message: "Course deleted successfully",
      data: course,
    });
  } catch (error) {
    console.error("Delete course error:", error);

    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message,
      });
    }

    return res.status(500).json({
      success: false,
      message: "Something went wrong. Please try again.",
    });
  }
};

export const listCoursesAdminController = async (req, res) => {
  try {
    const courses = await courseService.listCoursesAdmin(req.user.companyId);
    return res.status(200).json({ success: true, data: courses });
  } catch (error) {
    return respondError(res, error, "List courses error");
  }
};

export const getCourseAdminController = async (req, res) => {
  try {
    const data = await courseService.getCourseAdmin(req.params.courseId, req.user.companyId);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return respondError(res, error, "Get course error");
  }
};

export const listCoursesForStudentController = async (req, res) => {
  try {
    const courses = await courseService.listCoursesForStudent(req.user.userId, req.user.companyId);
    return res.status(200).json({ success: true, data: courses });
  } catch (error) {
    return respondError(res, error, "List student courses error");
  }
};

export const getCourseForStudentController = async (req, res) => {
  try {
    const data = await courseService.getCourseForStudent(req.params.courseId, req.user.userId, req.user.companyId);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return respondError(res, error, "Get student course error");
  }
};
