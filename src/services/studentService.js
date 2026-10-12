import mongoose from "mongoose";
import SignUp from "../models/signupModels.js";
import CourseAccess from "../models/courseAccessModel.js";
import { HttpError } from "../common/httpError.js";

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const listAllStudents = async (search, companyId) => {
  const query = { role: "student", companyId };

  if (search && String(search).trim()) {
    const regex = new RegExp(escapeRegex(String(search).trim()), "i");
    query.$or = [{ name: regex }, { email: regex }];
  }

  const students = await SignUp.find(query)
    .select("name email mobilenumber createdAt")
    .sort({ createdAt: -1 })
    .lean();

  const grantCounts = await CourseAccess.aggregate([
    {
      $match: {
        revoked: false,
        companyId: new mongoose.Types.ObjectId(companyId),
      },
    },
    { $group: { _id: "$userId", count: { $sum: 1 } } },
  ]);

  const countByUserId = new Map(grantCounts.map((g) => [g._id.toString(), g.count]));

  return students.map((student) => ({
    ...student,
    activeCourseCount: countByUserId.get(student._id.toString()) || 0,
  }));
};

export const createStudent = async (companyId, { name, mobile, email }) => {
  const cleanMobile = String(mobile || "").replace(/\D/g, "");
  const cleanEmail = String(email || "").trim().toLowerCase();

  if (!name || !name.trim()) throw new HttpError(400, "Student name is required");
  if (cleanMobile.length < 10) throw new HttpError(400, "A valid mobile number is required");
  if (cleanEmail && !/^\S+@\S+\.\S+$/.test(cleanEmail)) {
    throw new HttpError(400, "Email is not valid");
  }

  if (await SignUp.findOne({ mobilenumber: cleanMobile }).lean()) {
    throw new HttpError(409, "This mobile number is already registered");
  }

  const student = await SignUp.create({
    name: name.trim(),
    mobilenumber: cleanMobile,
    ...(cleanEmail ? { email: cleanEmail } : {}),
    role: "student",
    companyId,
  });

  return {
    id: student._id,
    name: student.name,
    email: student.email,
    mobile: student.mobilenumber,
  };
};

export const bulkCreateStudents = async (companyId, rows) => {
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new HttpError(400, "No students provided");
  }
  if (rows.length > 1000) {
    throw new HttpError(400, "Maximum 1000 students per upload");
  }

  const skipped = [];
  const valid = [];
  const seen = new Set();

  rows.forEach((row, i) => {
    const rowNo = i + 2; // row 1 of the sheet is the header
    const name = String(row?.name || "").trim();
    const mobile = String(row?.mobile || "").replace(/\D/g, "");
    const email = String(row?.email || "").trim().toLowerCase();

    if (!name) return skipped.push({ row: rowNo, reason: "Name is missing" });
    if (mobile.length < 10) return skipped.push({ row: rowNo, reason: "Invalid mobile number" });
    if (email && !/^\S+@\S+\.\S+$/.test(email)) {
      return skipped.push({ row: rowNo, reason: "Invalid email" });
    }
    if (seen.has(mobile)) return skipped.push({ row: rowNo, reason: "Duplicate mobile in file" });

    seen.add(mobile);
    valid.push({ rowNo, name, mobile, email });
  });

  const existing = await SignUp.find({
    mobilenumber: { $in: valid.map((v) => v.mobile) },
  })
    .select("mobilenumber")
    .lean();
  const existingSet = new Set(existing.map((e) => e.mobilenumber));

  const toInsert = [];
  for (const v of valid) {
    if (existingSet.has(v.mobile)) {
      skipped.push({ row: v.rowNo, reason: "Mobile already registered" });
    } else {
      toInsert.push({
        name: v.name,
        mobilenumber: v.mobile,
        ...(v.email ? { email: v.email } : {}),
        role: "student",
        companyId,
      });
    }
  }

  let created = 0;
  if (toInsert.length) {
    const docs = await SignUp.insertMany(toInsert);
    created = docs.length;
  }

  skipped.sort((a, b) => a.row - b.row);

  return { created, skippedCount: skipped.length, skipped };
};

export const updateStudent = async (
  companyId,
  studentId,
  { name, mobile, email }
) => {
  // Validate MongoDB ID
  if (!mongoose.Types.ObjectId.isValid(studentId)) {
    throw new HttpError(400, "Invalid student ID");
  }

  const cleanName = String(name || "").trim();
  const cleanMobile = String(mobile || "").replace(/\D/g, "");
  const cleanEmail = String(email || "").trim().toLowerCase();

  // Validation
  if (!cleanName) {
    throw new HttpError(400, "Student name is required");
  }

  if (cleanMobile.length < 10) {
    throw new HttpError(400, "A valid mobile number is required");
  }

  if (cleanEmail && !/^\S+@\S+\.\S+$/.test(cleanEmail)) {
    throw new HttpError(400, "Email is not valid");
  }

  // Check duplicate mobile inside same company
  const existingStudent = await SignUp.findOne({
    companyId,
    role: "student",
    mobilenumber: cleanMobile,
    _id: { $ne: studentId },
  })
    .select("_id")
    .lean();

  if (existingStudent) {
    throw new HttpError(
      409,
      "This mobile number is already registered"
    );
  }

  // Build update correctly
  const updateData = {
    $set: {
      name: cleanName,
      mobilenumber: cleanMobile,
    },
  };

  if (cleanEmail) {
    updateData.$set.email = cleanEmail;
  } else {
    updateData.$unset = {
      email: 1,
    };
  }

  // Update student
  const student = await SignUp.findOneAndUpdate(
    {
      _id: studentId,
      companyId,
      role: "student",
    },
    updateData,
    {
      new: true,
      runValidators: true,
    }
  )
    .select("name email mobilenumber createdAt")
    .lean();

  if (!student) {
    throw new HttpError(404, "Student not found");
  }

  return {
    id: student._id,
    name: student.name,
    email: student.email || "",
    mobile: student.mobilenumber,
    createdAt: student.createdAt,
  };
};

export const deleteStudent = async (
  companyId,
  studentId
) => {
  if (!mongoose.Types.ObjectId.isValid(studentId)) {
    throw new HttpError(400, "Invalid student ID");
  }

  // Find the student first
  const student = await SignUp.findOne({
    _id: studentId,
    companyId,
    role: "student",
  });

  if (!student) {
    throw new HttpError(404, "Student not found");
  }

  // Revoke all course access for this student
  await CourseAccess.updateMany(
    {
      userId: student._id,
      companyId,
      revoked: false,
    },
    {
      $set: {
        revoked: true,
      },
    }
  );

  // Delete student
  await SignUp.deleteOne({
    _id: student._id,
    companyId,
    role: "student",
  });

  return {
    id: student._id,
    name: student.name,
    mobile: student.mobilenumber,
    email: student.email || "",
  };
};