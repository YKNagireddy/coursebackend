import mongoose from "mongoose";

const signupSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },

    email: {
      type: String,
      lowercase: true,
      trim: true,
      sparse: true,
    },

    password: {
      type: String,
      select: false,
    },

    mobilenumber: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },

    businessName: {
      type: String,
      trim: true,
    },

    businessGst: {
      type: String,
      trim: true,
    },

    isEmailVerified: {
      type: Boolean,
      default: false,
    },

    role: {
      type: String,
      enum: ["student", "admin", "superadmin"],
      default: "student",
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

const SignUp = mongoose.model("SignUp", signupSchema);

export default SignUp;