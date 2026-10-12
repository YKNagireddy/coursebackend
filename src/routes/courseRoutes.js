import express from "express";

import authMiddleware from "../middleware/authmiddleware.js";

import {
  createCourseController,
  listCoursesAdminController,
  getCourseAdminController,
  listCoursesForStudentController,
  getCourseForStudentController,
  updateCourseController,
  deleteCourseController
} from "../controllers/courseController.js";

import { createModuleController } from "../controllers/moduleController.js";

import {
  getUploadSignatureController,
  createVideoController,
  getVideoAdminController,
  updateVideoController,
  reorderVideosController,
  setPublishedController,
  deleteVideoController,
  getReplaceUploadSignatureController,
  confirmReplaceController,
  getPlaybackUrlController,
  getAdminPlaybackUrlController,
  importVideoController
} from "../controllers/videoController.js";

import {
  grantAccessController,
  revokeAccessController,
  listStudentsForCourseController,
} from "../controllers/accessController.js";

import { saveProgressController, getProgressController } from "../controllers/progressController.js";
import { requireAdmin, requireSuperAdmin } from "../common/roleMiddleware.js";

import {
  createCompanyController,
  listCompaniesController,
  createAdminController,
} from "../controllers/companyController.js";

import {
  listAllStudentsController,
  createStudentController,
  bulkCreateStudentsController,
  updateStudentController,
  deleteStudentController
} from "../controllers/studentController.js";

const router = express.Router();

// Every route here requires login; requireAdmin narrows further.
// router.use(authMiddleware);
router.use(authMiddleware);

/*
|--------------------------------------------------------------------------
| Admin: courses & modules
|--------------------------------------------------------------------------
*/

router.post("/admin/courses", requireAdmin, createCourseController);
router.get("/admin/courses", requireAdmin, listCoursesAdminController);
router.get("/admin/courses/:courseId", requireAdmin, getCourseAdminController);
router.put("/courses/:courseId", updateCourseController);
router.delete("/courses/:courseId", deleteCourseController);

router.post("/admin/courses/:courseId/modules", requireAdmin, createModuleController);

/*
|--------------------------------------------------------------------------
| Admin: videos
|--------------------------------------------------------------------------
*/

// Step 1 of upload: browser gets a signed Cloudinary upload URL.
router.post("/admin/videos/import-url", requireAdmin, importVideoController);
router.post("/admin/videos/upload-signature", requireAdmin, getUploadSignatureController);
// Step 2: browser uploads directly to Cloudinary (not through this API).
// Step 3: browser tells us the upload finished so we can save a record.
router.post("/admin/videos", requireAdmin, createVideoController);

router.get("/admin/videos/:videoId", requireAdmin, getVideoAdminController);
router.patch("/admin/videos/:videoId", requireAdmin, updateVideoController);
router.patch("/admin/videos/:videoId/publish", requireAdmin, setPublishedController);
router.delete("/admin/videos/:videoId", requireAdmin, deleteVideoController);

router.post(
  "/admin/videos/:videoId/replace/upload-signature",
  requireAdmin,
  getReplaceUploadSignatureController,
);
router.post("/admin/videos/:videoId/replace/confirm", requireAdmin, confirmReplaceController);

router.patch("/admin/modules/:moduleId/videos/order", requireAdmin, reorderVideosController);

// Admin preview — unlike the student /videos/:id/play, does not require
// the video to be published or the caller to have course access.
router.get("/admin/videos/:videoId/play", requireAdmin, getAdminPlaybackUrlController);

/*
|--------------------------------------------------------------------------
| Admin: access & students
|--------------------------------------------------------------------------
*/

router.post("/admin/courses/:courseId/access", requireAdmin, grantAccessController);
router.delete(
  "/admin/courses/:courseId/access/:studentId",
  requireAdmin,
  revokeAccessController,
);
router.get("/admin/courses/:courseId/students", requireAdmin, listStudentsForCourseController);

router.get("/admin/students", requireAdmin, listAllStudentsController);

/*
|--------------------------------------------------------------------------
| Student-facing
|--------------------------------------------------------------------------
*/

router.get("/courses", listCoursesForStudentController);
router.get("/courses/:courseId", getCourseForStudentController);
router.get("/videos/:videoId/play", getPlaybackUrlController);

/*
|--------------------------------------------------------------------------
| Student-facing: watch progress (resume + sync)
|--------------------------------------------------------------------------
*/

router.put("/progress/:videoId", saveProgressController);
router.get("/progress", getProgressController);

/*
|--------------------------------------------------------------------------
| Superadmin: companies
|--------------------------------------------------------------------------
*/
router.post("/superadmin/companies", requireSuperAdmin, createCompanyController);
router.get("/superadmin/companies", requireSuperAdmin, listCompaniesController);

/*
|--------------------------------------------------------------------------
| Company admin: add admins / students
|--------------------------------------------------------------------------
*/
router.post("/admin/admins", requireAdmin, createAdminController);
router.post("/admin/students", requireAdmin, createStudentController);
router.post("/admin/students/bulk", requireAdmin, bulkCreateStudentsController);
router.put("/admin/students/:id", updateStudentController);
router.delete("/admin/students/:id", deleteStudentController);

export default router;
