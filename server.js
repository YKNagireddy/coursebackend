import "dotenv/config";
import express from "express";
import cookieParser from "cookie-parser";

import connectDB from "./src/models/config/db.js";
import authRoutes from "./src/routes/authRoutes.js";
import courseRoutes from "./src/routes/courseRoutes.js";
import corsMiddleware from "./src/middleware/corsMiddleware.js";
import { cloudinaryWebhookController } from "./src/controllers/videoController.js";

const app = express();

connectDB();
app.use(cookieParser());
app.use(express.json({ limit: "1mb" }));

app.use(corsMiddleware);

// Cloudinary signs this request over the RAW request body, so it must be
// read as a raw buffer before the global JSON parser touches it — mounted
// ahead of express.json() for that reason.
app.post(
  "/api/videos/webhooks/cloudinary",
  express.raw({ type: "application/json" }),
  cloudinaryWebhookController,
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
// Read HttpOnly cookies


app.get("/", (req, res) => {
  res.json({
    status: "ok",
    service: "business-portfolio-backend",
  });
});

app.use("/api/auth", authRoutes);
app.use("/api/", courseRoutes);
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Route not found: ${req.method} ${req.originalUrl}`,
  });
});
app.use((err, req, res, next) => {
  console.error("Error:", err);

  res.status(err.statusCode || 500).json({
    success: false,
    message: err.message || "Internal Server Error",
  });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on http://0.0.0.0:${PORT}`);
});
