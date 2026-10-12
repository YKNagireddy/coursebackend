// Must run after authMiddleware, which sets req.user from the JWT.

// Company admin. Must belong to a company.
export const requireAdmin = (req, res, next) => {
  if (req.user?.role !== "admin") {
    return res.status(403).json({ success: false, message: "Admin access required" });
  }

  if (!req.user.companyId) {
    return res.status(403).json({
      success: false,
      message: "Admin account is not linked to a company",
    });
  }

  next();
};

// Platform owner (you). Manages companies.
export const requireSuperAdmin = (req, res, next) => {
  if (req.user?.role !== "superadmin") {
    return res.status(403).json({ success: false, message: "Superadmin access required" });
  }

  next();
};