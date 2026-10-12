import bcrypt from "bcryptjs";
import Company from "../models/companyModel.js";
import SignUp from "../models/signupModels.js";
import { HttpError } from "../common/httpError.js";

const normaliseMobile = (m) => String(m || "").replace(/\D/g, "");
const normaliseEmail = (e) => String(e || "").trim().toLowerCase();
const slugify = (s) =>
  String(s || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

const toPublicUser = (u) => ({
  id: u._id,
  name: u.name,
  email: u.email,
  mobile: u.mobilenumber,
  role: u.role,
  companyId: u.companyId,
});

// Shared by "create company" (first admin) and "create another admin".
const createAdminUser = async ({ companyId, name, email, mobile, password }) => {
  const cleanEmail = normaliseEmail(email);
  const cleanMobile = normaliseMobile(mobile);

  if (!name || !name.trim()) throw new HttpError(400, "Admin name is required");
  if (!/^\S+@\S+\.\S+$/.test(cleanEmail)) throw new HttpError(400, "A valid admin email is required");
  if (cleanMobile.length < 10) throw new HttpError(400, "A valid admin mobile number is required");
  if (!password || String(password).length < 8) {
    throw new HttpError(400, "Password must be at least 8 characters");
  }

  const existing = await SignUp.findOne({
    $or: [{ email: cleanEmail }, { mobilenumber: cleanMobile }],
  }).lean();

  if (existing) {
    throw new HttpError(409, "A user with this email or mobile number already exists");
  }

  const user = await SignUp.create({
    name: name.trim(),
    email: cleanEmail,
    mobilenumber: cleanMobile,
    password: await bcrypt.hash(String(password), 10),
    role: "admin",
    companyId,
    isEmailVerified: true,
  });

  return toPublicUser(user);
};

export const createCompany = async ({ name, slug, adminName, adminEmail, adminMobile, adminPassword }) => {
  if (!name || !name.trim()) throw new HttpError(400, "Company name is required");

  const finalSlug = slugify(slug || name);
  if (!finalSlug) throw new HttpError(400, "Company slug is invalid");

  if (await Company.findOne({ slug: finalSlug }).lean()) {
    throw new HttpError(409, "A company with this slug already exists");
  }

  const company = await Company.create({ name: name.trim(), slug: finalSlug });

  try {
    const admin = await createAdminUser({
      companyId: company._id,
      name: adminName,
      email: adminEmail,
      mobile: adminMobile,
      password: adminPassword,
    });

    return { company, admin };
  } catch (error) {
    // Don't leave a company with no admin behind.
    await Company.deleteOne({ _id: company._id });
    throw error;
  }
};

export const listCompanies = async () => Company.find().sort({ createdAt: -1 }).lean();

export const createAdmin = async (companyId, body) =>
  createAdminUser({ companyId, ...body, mobile: body.mobile });