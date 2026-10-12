import { listAllStudents, createStudent, bulkCreateStudents, updateStudent, deleteStudent } from "../services/studentService.js";

export const listAllStudentsController = async (req, res) => {
  try {
    const students = await listAllStudents(req.query.search, req.user.companyId);
    return res.status(200).json({ success: true, data: students });
  } catch (error) {
    console.error("List students error:", error);
    return res.status(500).json({ success: false, message: "Something went wrong. Please try again." });
  }
};

export const createStudentController = async (req, res) => {
  try {
    const student = await createStudent(req.user.companyId, req.body);
    return res.status(201).json({ success: true, data: student });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ success: false, message: error.message });
    }
    console.error("Create student error:", error);
    return res.status(500).json({ success: false, message: "Something went wrong. Please try again." });
  }
};
export const bulkCreateStudentsController = async (req, res) => {
  try {
    const data = await bulkCreateStudents(req.user.companyId, req.body.students);
    return res.status(201).json({ success: true, data });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ success: false, message: error.message });
    }
    console.error("Bulk create students error:", error);
    return res.status(500).json({ success: false, message: "Something went wrong. Please try again." });
  }
};

export const updateStudentController = async (
  req,
  res
) => {
  try {
    const { id } = req.params;

    const student = await updateStudent(
      req.user.companyId,
      id,
      req.body
    );

    return res.status(200).json({
      success: true,
      message: "Student updated successfully",
      data: student,
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message,
      });
    }

    console.error(
      "Update student error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Something went wrong. Please try again.",
    });
  }
};

export const deleteStudentController = async (
  req,
  res
) => {
  try {
    const { id } = req.params;

    const student = await deleteStudent(
      req.user.companyId,
      id
    );

    return res.status(200).json({
      success: true,
      message: "Student deleted successfully",
      data: student,
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message,
      });
    }

    console.error(
      "Delete student error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Something went wrong. Please try again.",
    });
  }
};