import * as companyService from "../services/companyService.js";

const respondError = (res, error, label) => {
  const statusCode = error.statusCode || 500;
  if (statusCode === 500) console.error(`${label}:`, error);
  return res.status(statusCode).json({
    success: false,
    message: error.statusCode ? error.message : "Something went wrong. Please try again.",
  });
};

// Superadmin only
export const createCompanyController = async (req, res) => {
  try {
    const data = await companyService.createCompany(req.body);
    return res.status(201).json({ success: true, data });
  } catch (error) {
    return respondError(res, error, "Create company error");
  }
};

// Superadmin only
export const listCompaniesController = async (req, res) => {
  try {
    const data = await companyService.listCompanies();
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return respondError(res, error, "List companies error");
  }
};

// Company admin: adds another admin to THEIR OWN company
export const createAdminController = async (req, res) => {
  try {
    const data = await companyService.createAdmin(req.user.companyId, req.body);
    return res.status(201).json({ success: true, data });
  } catch (error) {
    return respondError(res, error, "Create admin error");
  }
};