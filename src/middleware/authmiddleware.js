import { verifyAccessToken } from "../common/jwtUtils.js";

const authMiddleware = (req, res, next) => {
  try {
    // =====================================================
    // 1. Try to get token from HttpOnly cookie
    // =====================================================

    let token = req.cookies?.accessToken;

    // =====================================================
    // 2. If cookie doesn't exist, also support
    //    Authorization: Bearer <token>
    // =====================================================

    if (!token) {
      const authHeader = req.headers.authorization;

      if (
        authHeader &&
        authHeader.startsWith("Bearer ")
      ) {
        token = authHeader.substring(7);
      }
    }

    // =====================================================
    // 3. No token
    // =====================================================

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    // =====================================================
    // 4. Verify token
    // =====================================================

    const decoded = verifyAccessToken(token);

    // =====================================================
    // 5. Store decoded user in request
    // =====================================================

    req.user = decoded;

    next();

  } catch (error) {
    console.error("AUTH MIDDLEWARE ERROR:", error);

    return res.status(401).json({
      success: false,
      message: "Invalid or expired access token",
    });
  }
};

export default authMiddleware;