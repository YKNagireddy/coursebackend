// Run once:  node scripts/migrateToMultiTenant.js
// Optional:  ADMIN_EMAIL=you@example.com node scripts/migrateToMultiTenant.js
import "dotenv/config";
import mongoose from "mongoose";
import Company from "../src/models/companyModel.js";
import SignUp from "../src/models/signupModels.js";
import Course from "../src/models/courseModel.js";
import Module from "../src/models/moduleModel.js";
import Video from "../src/models/videoModel.js";
import CourseAccess from "../src/models/courseAccessModel.js";

const DEFAULT_NAME = process.env.DEFAULT_COMPANY_NAME || "Default Company";
const DEFAULT_SLUG = process.env.DEFAULT_COMPANY_SLUG || "default";

await mongoose.connect(process.env.MONGODB_URI);

let company = await Company.findOne({ slug: DEFAULT_SLUG });
if (!company) company = await Company.create({ name: DEFAULT_NAME, slug: DEFAULT_SLUG });
console.log("Default company:", company._id.toString());

const filter = { companyId: null };

const users = await SignUp.updateMany(
  { ...filter, role: { $ne: "superadmin" } },
  { $set: { companyId: company._id } },
);
const courses = await Course.updateMany(filter, { $set: { companyId: company._id } });
const modules = await Module.updateMany(filter, { $set: { companyId: company._id } });
const videos = await Video.updateMany(filter, { $set: { companyId: company._id } });
const access = await CourseAccess.updateMany(filter, { $set: { companyId: company._id } });

console.log({
  users: users.modifiedCount,
  courses: courses.modifiedCount,
  modules: modules.modifiedCount,
  videos: videos.modifiedCount,
  access: access.modifiedCount,
});

if (process.env.ADMIN_EMAIL) {
  const r = await SignUp.updateOne(
    { email: process.env.ADMIN_EMAIL.toLowerCase() },
    { $set: { role: "admin", companyId: company._id } },
  );
  console.log("Promoted admin:", r.modifiedCount === 1 ? "yes" : "no match");
}

await mongoose.disconnect();