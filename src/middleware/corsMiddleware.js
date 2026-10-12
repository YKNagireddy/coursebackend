import cors from "cors";

// Origins allowed to send/receive the login cookie cross-site.
// CLIENT_ORIGIN/ADMIN_ORIGIN let each deployed frontend be added via env
// instead of a code change; the two hardcoded entries stay for whatever
// was already relying on them.
const allowedOrigins = [
  "http://localhost:5173",
  "http://localhost:5175",
  "http://localhost:5174",
  "https://setuconnect.netlify.app",
  // process.env.CLIENT_ORIGIN,
  process.env.ADMIN_ORIGIN,
].filter(Boolean);

const corsMiddleware = cors({
  origin: function (origin, callback) {
    if (!origin) {
      return callback(null, true);
    }
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error("Not allowed by CORS"));
  },

  credentials: true,
});

export default corsMiddleware;
