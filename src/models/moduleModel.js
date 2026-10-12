import mongoose from "mongoose";

const moduleSchema = new mongoose.Schema(
  {
    courseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Course",
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    // Position among the course's modules. Set once at creation
    // (append-to-end); no dedicated reorder endpoint was requested.
    order: {
      type: Number,
      required: true,
      default: 0,
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

const Module = mongoose.model("Module", moduleSchema);
export default Module;
