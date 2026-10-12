import mongoose from "mongoose";

// One document per (user, course) pair. Revoking sets `revoked` rather
// than deleting, so there's a record of when access was granted/removed.
const courseAccessSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SignUp",
      required: true,
      index: true,
    },
    courseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Course",
      required: true,
      index: true,
    },
    grantedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SignUp",
      required: true,
    },
    grantedAt: {
      type: Date,
      required: true,
    },
    revoked: {
      type: Boolean,
      default: false,
    },
    revokedAt: {
      type: Date,
      default: null,
    },
     companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      default: null,
      index: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

courseAccessSchema.index({ userId: 1, courseId: 1 }, { unique: true });

const CourseAccess = mongoose.model("CourseAccess", courseAccessSchema);
export default CourseAccess;
