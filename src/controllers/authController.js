import bcrypt from "bcryptjs";
import SignUp from "../models/signupModels.js";
import {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
} from "../common/jwtUtils.js";

// ============================================================
// TEMPORARY OTP STORE
// ============================================================

const otpStore = new Map();

// ============================================================
// HELPERS
// ============================================================

const normaliseEmail = (email) => {
  return String(email || "").trim().toLowerCase();
};

const normaliseMobile = (mobile) => {
  return String(mobile || "").replace(/\D/g, "");
};

const createOtp = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// Same shape everywhere
const buildUserResponse = (user, role) => ({
  id: user._id,
  name: user.name,
  email: user.email,
  mobile: user.mobilenumber,
  role,
  companyId: user.companyId || null,
});

// ============================================================
// COOKIE HELPERS
// ============================================================

const setAuthCookies = (res, accessToken, refreshToken) => {
  // Access token
  res.cookie("accessToken", accessToken, {
    httpOnly: true,
    secure: false, // localhost uses HTTP
    sameSite: "lax",
    path: "/",
    maxAge: 15 * 60 * 1000, // 15 minutes
  });

  // Refresh token
  res.cookie("refreshToken", refreshToken, {
    httpOnly: true,
    secure: false, // localhost uses HTTP
    sameSite: "lax",
    path: "/",
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  });
};

// ============================================================
// POST /api/auth/login
// ============================================================

export const loginController = async (req, res, next) => {
  try {
    const {
      email,
      password,
      mobile,
      otp,
    } = req.body;

    // ========================================================
    // EMAIL + PASSWORD LOGIN
    // ADMIN / SUPERADMIN
    // ========================================================

    if (email && password) {
      const normalizedEmail = normaliseEmail(email);

      if (!normalizedEmail) {
        return res.status(400).json({
          success: false,
          message: "Email is required",
        });
      }

      if (!password) {
        return res.status(400).json({
          success: false,
          message: "Password is required",
        });
      }

      // Find user
      const user = await SignUp.findOne({
        email: normalizedEmail,
      }).select("+password");

      if (!user) {
        return res.status(401).json({
          success: false,
          message: "Invalid email or password",
        });
      }

      // Make sure password exists
      if (!user.password) {
        console.error(
          "Password hash is missing for user:",
          user._id
        );

        return res.status(500).json({
          success: false,
          message:
            "Password information is missing for this account",
        });
      }

      // Check password
      const passwordValid = await bcrypt.compare(
        password,
        user.password
      );

      if (!passwordValid) {
        return res.status(401).json({
          success: false,
          message: "Invalid email or password",
        });
      }

      // Role
      const loginRole = user.role || "student";

      // ======================================================
      // CREATE JWT TOKENS
      // ======================================================

      const accessToken = generateAccessToken({
        ...user.toObject(),
        role: loginRole,
      });

      const refreshToken = generateRefreshToken({
        ...user.toObject(),
        role: loginRole,
      });

      // ======================================================
      // STORE TOKENS IN HTTP-ONLY COOKIES
      // ======================================================

      setAuthCookies(
        res,
        accessToken,
        refreshToken
      );

      // ======================================================
      // RESPONSE
      // ======================================================

      return res.status(200).json({
        success: true,
        message: "Login successful",

        user: buildUserResponse(
          user,
          loginRole
        ),
      });
    }

    // ========================================================
    // STUDENT LOGIN
    // ========================================================

    if (mobile) {
      const mobileNumber = normaliseMobile(mobile);

      if (mobileNumber.length < 10) {
        return res.status(400).json({
          success: false,
          message: "Invalid mobile number",
        });
      }

      // ======================================================
      // STEP 1: REQUEST OTP
      // ======================================================

      if (!otp) {
        const user = await SignUp.findOne({
          mobilenumber: mobileNumber,
        });

        if (!user) {
          return res.status(404).json({
            success: false,
            message: "Student account not found",
          });
        }

        const generatedOtp = createOtp();

        otpStore.set(mobileNumber, {
          otp: generatedOtp,
          expiresAt: Date.now() + 5 * 60 * 1000,
        });

        // Development only
        console.log(
          `OTP for ${mobileNumber}: ${generatedOtp}`
        );

        return res.status(200).json({
          success: true,
          message: "OTP generated successfully",
          requiresOtp: true,

          // Development only
          devOtp:
            process.env.NODE_ENV === "production"
              ? undefined
              : generatedOtp,
        });
      }

      // ======================================================
      // STEP 2: VERIFY OTP
      // ======================================================

      const storedOtp = otpStore.get(mobileNumber);

      if (!storedOtp) {
        return res.status(401).json({
          success: false,
          message: "OTP expired or not requested",
        });
      }

      if (Date.now() > storedOtp.expiresAt) {
        otpStore.delete(mobileNumber);

        return res.status(401).json({
          success: false,
          message: "OTP expired",
        });
      }

      if (String(otp) !== storedOtp.otp) {
        return res.status(401).json({
          success: false,
          message: "Invalid OTP",
        });
      }

      // OTP verified
      otpStore.delete(mobileNumber);

      // Find user
      const user = await SignUp.findOne({
        mobilenumber: mobileNumber,
      });

      if (!user) {
        return res.status(404).json({
          success: false,
          message: "Student account not found",
        });
      }

      const loginRole = user.role || "student";

      // ======================================================
      // CREATE JWT TOKENS
      // ======================================================

      const accessToken = generateAccessToken({
        ...user.toObject(),
        role: loginRole,
      });

      const refreshToken = generateRefreshToken({
        ...user.toObject(),
        role: loginRole,
      });

      // ======================================================
      // STORE TOKENS IN HTTP-ONLY COOKIES
      // ======================================================

      setAuthCookies(
        res,
        accessToken,
        refreshToken
      );

      // ======================================================
      // RESPONSE
      // ======================================================

      return res.status(200).json({
        success: true,
        message: "Login successful",

        user: buildUserResponse(
          user,
          loginRole
        ),
      });
    }

    // ========================================================
    // NO LOGIN DATA
    // ========================================================

    return res.status(400).json({
      success: false,
      message:
        "Provide email and password, or mobile number",
    });

  } catch (error) {
    console.error("LOGIN ERROR:", error);
    next(error);
  }
};

// ============================================================
// GET /api/auth/me
// ============================================================

export const meController = async (req, res, next) => {
  try {
    const userId =
      req.user?.userId ||
      req.user?.id ||
      req.user?._id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const user = await SignUp.findById(userId)
      .select(
        "name email mobilenumber role companyId createdAt"
      )
      .lean();

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const loginRole = user.role || "student";

    return res.status(200).json({
      success: true,

      user: {
        ...buildUserResponse(
          user,
          loginRole
        ),
        createdAt: user.createdAt,
      },
    });

  } catch (error) {
    console.error("ME ERROR:", error);
    next(error);
  }
};


// POST /api/auth/refresh  (uses the refreshToken cookie)
export const refreshController = async (req, res, next) => {
  try {
    const token = req.cookies?.refreshToken;

    if (!token) {
      return res.status(401).json({ success: false, message: "Authentication required" });
    }

    let decoded;
    try {
      decoded = verifyRefreshToken(token);
    } catch {
      return res.status(401).json({ success: false, message: "Session expired. Please log in again." });
    }

    const user = await SignUp.findById(decoded.userId);

    if (!user) {
      return res.status(401).json({ success: false, message: "User not found" });
    }

    const payload = { ...user.toObject(), role: user.role || "student" };

    setAuthCookies(res, generateAccessToken(payload), generateRefreshToken(payload));

    return res.status(200).json({ success: true, message: "Token refreshed" });
  } catch (error) {
    console.error("REFRESH ERROR:", error);
    next(error);
  }
};

// POST /api/auth/logout
export const logoutController = (req, res) => {
  res.clearCookie("accessToken", { path: "/" });
  res.clearCookie("refreshToken", { path: "/" });
  return res.status(200).json({ success: true, message: "Logged out" });
};