import mongoose from "mongoose";
import Module from "../models/moduleModel.js";
import { getCourseOr404 } from "./courseService.js";
import { HttpError } from "../common/httpError.js";

export const createModule = async (courseId, { title }, companyId) => {
  await getCourseOr404(courseId, companyId);

  if (!title || !title.trim()) {
    throw new HttpError(400, "Module title is required");
  }

  const order = await Module.countDocuments({ courseId });

  return Module.create({
    companyId,
    courseId,
    title: title.trim(),
    order,
  });
};

export const getModuleOr404 = async (moduleId, companyId) => {
  if (!mongoose.isValidObjectId(moduleId)) {
    throw new HttpError(404, "Module not found");
  }

  const mod = await Module.findOne({ _id: moduleId, companyId });

  if (!mod) {
    throw new HttpError(404, "Module not found");
  }

  return mod;
};