import * as moduleService from "../services/moduleService.js";

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

export const createModuleController = async (req, res) => {
  try {
    const mod = await moduleService.createModule(req.params.courseId, req.body, req.user.companyId);
    return res.status(201).json({ success: true, data: mod });
  } catch (error) {
    return respondError(res, error, "Create module error");
  }
};
