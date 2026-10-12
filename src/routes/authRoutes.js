import express from "express";

import {
  loginController,
  meController,
  refreshController,
  logoutController,
} from "../controllers/authController.js";


import authMiddleware from "../middleware/authmiddleware.js";

const router = express.Router();

router.post("/refresh", refreshController);
router.post("/logout", logoutController);
// Public route — no JWT required
router.post("/login", loginController);

// Protected route — JWT required
router.get("/me", authMiddleware, meController);

export default router;