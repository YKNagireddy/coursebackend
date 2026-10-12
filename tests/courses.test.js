import { jest } from "@jest/globals";
import express from "express";
import cookieParser from "cookie-parser";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import http from "http";

/*
|--------------------------------------------------------------------------
| Minimal in-memory Mongoose-alike, backing every model this router touches
|--------------------------------------------------------------------------
*/
let seq = 0;
const newId = () => `id_${++seq}`;

const matches = (doc, filter) =>
  Object.entries(filter).every(([key, cond]) => {
    if (key === "$or") return cond.some((sub) => matches(doc, sub));
    const value = doc[key];
    if (cond instanceof RegExp) return cond.test(String(value ?? ""));
    if (cond && typeof cond === "object" && !(cond instanceof Date) && !Array.isArray(cond)) {
      if ("$in" in cond) return cond.$in.map(String).includes(String(value));
      throw new Error(`Unsupported operator in fake: ${JSON.stringify(cond)}`);
    }
    return String(value) === String(cond);
  });

const applySelect = (doc, select) => {
  if (!select) return doc;
  if (select.startsWith("-")) {
    const { [select.slice(1)]: _omit, ...rest } = doc;
    return rest;
  }
  const fields = select.split(/\s+/);
  const out = { _id: doc._id };
  for (const f of fields) out[f] = doc[f];
  return out;
};

class FakeQuery {
  constructor(docs) {
    this.docs = [...docs];
    this._sort = null;
    this._select = null;
    this._populate = null;
  }
  sort(spec) {
    const [[key, dir]] = Object.entries(spec);
    this._sort = { key, dir };
    return this;
  }
  select(fields) {
    this._select = fields;
    return this;
  }
  lean() {
    return this;
  }
  populate(field, select) {
    this._populate = { field, select };
    return this;
  }
  async _resolve() {
    let result = this.docs.map((d) => ({ ...d }));
    if (this._sort) {
      const { key, dir } = this._sort;
      result.sort((a, b) => (a[key] > b[key] ? 1 : a[key] < b[key] ? -1 : 0) * dir);
    }
    if (this._populate) {
      const { field, select } = this._populate;
      result = result.map((d) => ({
        ...d,
        [field]: refCollections[field]
          ? applySelect(
              refCollections[field]._docs.find((r) => String(r._id) === String(d[field])),
              select,
            )
          : d[field],
      }));
    }
    if (this._select) {
      result = result.map((d) => applySelect(d, this._select));
    }
    return result;
  }
  then(resolve, reject) {
    this._resolve().then(resolve, reject);
  }
}

// Maps a foreign-key field name (e.g. "userId") to the collection it
// references, so FakeQuery.populate() can look the doc up.
const refCollections = {};

const makeModel = (name, { refs = {} } = {}) => {
  const docs = [];
  Object.assign(refCollections, refs);

  const attachInstanceMethods = (doc) => {
    doc.save = async () => {
      const idx = docs.findIndex((d) => d._id === doc._id);
      docs[idx] = doc;
      return doc;
    };
    doc.deleteOne = async () => {
      const idx = docs.findIndex((d) => d._id === doc._id);
      if (idx !== -1) docs.splice(idx, 1);
    };
    return doc;
  };

  return {
    _docs: docs,
    create: async (data) => {
      const doc = { _id: newId(), createdAt: new Date(), ...data };
      docs.push(doc);
      return attachInstanceMethods(doc);
    },
    find: (filter = {}) => new FakeQuery(docs.filter((d) => matches(d, filter))),
    findOne: async (filter) => {
      const doc = docs.find((d) => matches(d, filter));
      return doc ? attachInstanceMethods(doc) : null;
    },
    findById: async (id) => {
      const doc = docs.find((d) => String(d._id) === String(id));
      return doc ? attachInstanceMethods(doc) : null;
    },
    findOneAndUpdate: async (filter, update, opts = {}) => {
      let doc = docs.find((d) => matches(d, filter));
      if (!doc && opts.upsert) {
        doc = { _id: newId(), createdAt: new Date() };
        docs.push(doc);
      }
      if (!doc) return null;
      Object.assign(doc, update);
      return doc;
    },
    updateOne: async (filter, update) => {
      const doc = docs.find((d) => matches(d, filter));
      if (doc) Object.assign(doc, update);
      return { acknowledged: true };
    },
    countDocuments: async (filter = {}) => docs.filter((d) => matches(d, filter)).length,
    aggregate: async (pipeline) => {
      // Only supports the exact $match{revoked:false} -> $group{_id:$userId,count} used here.
      const grouped = new Map();
      for (const d of docs) {
        if (d.revoked) continue;
        const key = String(d.userId);
        grouped.set(key, (grouped.get(key) || 0) + 1);
      }
      return [...grouped.entries()].map(([_id, count]) => ({ _id, count }));
    },
  };
};

const users = makeModel("SignUp");
const courses = makeModel("Course");
const modules = makeModel("Module");
const videos = makeModel("Video");
const courseAccess = makeModel("CourseAccess", { refs: { userId: users } });

/*
|--------------------------------------------------------------------------
| Module mocks
|--------------------------------------------------------------------------
*/
jest.unstable_mockModule("../src/models/signupModels.js", () => ({ default: users }));
jest.unstable_mockModule("../src/models/courseModel.js", () => ({ default: courses }));
jest.unstable_mockModule("../src/models/moduleModel.js", () => ({ default: modules }));
jest.unstable_mockModule("../src/models/videoModel.js", () => ({ default: videos }));
jest.unstable_mockModule("../src/models/courseAccessModel.js", () => ({ default: courseAccess }));

const fakeCloudinary = {
  utils: {
    api_sign_request: jest.fn(() => "fake-signature"),
  },
  uploader: {
    destroy: jest.fn().mockResolvedValue({ result: "ok" }),
  },
  url: jest.fn(
    (publicId) => `https://res.cloudinary.com/demo/video/authenticated/s--sig--/${publicId}`,
  ),
};
jest.unstable_mockModule("../src/models/config/cloudinary.js", () => ({
  default: fakeCloudinary,
}));

const { default: courseRoutes } = await import("../src/routes/courseRoutes.js");
const { verifyCloudinaryNotification, VIDEO_FOLDER } = await import(
  "../src/common/cloudinaryVideoUtils.js"
);

/*
|--------------------------------------------------------------------------
| Test server + helpers
|--------------------------------------------------------------------------
*/
let server;
let baseUrl;

beforeAll(async () => {
  const app = express();
  // Mirror server.js: the webhook route needs the raw body, so it must be
  // registered before the global express.json() consumes the stream.
  app.post(
    "/api/videos/webhooks/cloudinary",
    express.raw({ type: "application/json" }),
    (await import("../src/controllers/videoController.js")).cloudinaryWebhookController,
  );
  app.use(express.json());
  app.use(cookieParser());
  app.use("/api", courseRoutes);
  await new Promise((resolve) => {
    server = app.listen(0, resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

afterAll(() => new Promise((resolve) => server.close(resolve)));

const tokenFor = (user) =>
  jwt.sign(
    { userId: user._id, email: user.email, role: user.role },
    process.env.JWT_ACCESS_SECRET,
    { expiresIn: "15m" },
  );

// Node's fetch refuses to send a "Cookie" header (it's on the Fetch spec's
// forbidden-header list), so authenticated calls use http.request instead.
const call = (method, path, { user, body } = {}) =>
  new Promise((resolve, reject) => {
    const payload = body !== undefined ? JSON.stringify(body) : undefined;
    const headers = { "Content-Type": "application/json" };
    if (user) headers.Cookie = `accessToken=${tokenFor(user)}`;
    if (payload) headers["Content-Length"] = Buffer.byteLength(payload);

    const req = http.request(`${baseUrl}${path}`, { method, headers }, (res) => {
      let raw = "";
      res.on("data", (chunk) => (raw += chunk));
      res.on("end", () => {
        resolve({ status: res.statusCode, body: raw ? JSON.parse(raw) : undefined });
      });
    });
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });

let admin, student, otherStudent;

beforeEach(async () => {
  users._docs.length = 0;
  courses._docs.length = 0;
  modules._docs.length = 0;
  videos._docs.length = 0;
  courseAccess._docs.length = 0;
  fakeCloudinary.uploader.destroy.mockClear();

  admin = await users.create({ name: "Admin", email: "admin@example.com", role: "admin" });
  student = await users.create({ name: "Stu Dent", email: "student@example.com", role: "student" });
  otherStudent = await users.create({ name: "Other", email: "other@example.com", role: "student" });
});

/*
|--------------------------------------------------------------------------
| Admin gate
|--------------------------------------------------------------------------
*/
describe("admin access", () => {
  test("a student cannot create a course", async () => {
    const res = await call("POST", "/api/admin/courses", {
      user: student,
      body: { title: "Sales 101" },
    });
    expect(res.status).toBe(403);
  });

  test("an unauthenticated request is rejected", async () => {
    const res = await call("POST", "/api/admin/courses", { body: { title: "Sales 101" } });
    expect(res.status).toBe(401);
  });

  test("an admin can create a course", async () => {
    const res = await call("POST", "/api/admin/courses", {
      user: admin,
      body: { title: "Sales 101", description: "Intro" },
    });
    expect(res.status).toBe(201);
    expect(res.body.data.title).toBe("Sales 101");
  });
});

/*
|--------------------------------------------------------------------------
| Courses, modules, listing
|--------------------------------------------------------------------------
*/
describe("courses and modules", () => {
  test("rejects a course with no title", async () => {
    const res = await call("POST", "/api/admin/courses", { user: admin, body: {} });
    expect(res.status).toBe(400);
  });

  test("creates modules with incrementing order", async () => {
    const course = (await call("POST", "/api/admin/courses", { user: admin, body: { title: "C1" } }))
      .body.data;

    const m1 = await call("POST", `/api/admin/courses/${course._id}/modules`, {
      user: admin,
      body: { title: "Intro" },
    });
    const m2 = await call("POST", `/api/admin/courses/${course._id}/modules`, {
      user: admin,
      body: { title: "Advanced" },
    });

    expect(m1.body.data.order).toBe(0);
    expect(m2.body.data.order).toBe(1);
  });

  test("404s creating a module under a nonexistent course", async () => {
    const res = await call("POST", "/api/admin/courses/does-not-exist/modules", {
      user: admin,
      body: { title: "Intro" },
    });
    expect(res.status).toBe(404);
  });

  test("admin course detail nests videos under their module, without exposing publicId", async () => {
    const course = (await call("POST", "/api/admin/courses", { user: admin, body: { title: "C1" } }))
      .body.data;
    const mod = (
      await call("POST", `/api/admin/courses/${course._id}/modules`, {
        user: admin,
        body: { title: "Intro" },
      })
    ).body.data;

    const sig = (
      await call("POST", "/api/admin/videos/upload-signature", {
        user: admin,
        body: { moduleId: mod._id },
      })
    ).body.data;

    await call("POST", "/api/admin/videos", {
      user: admin,
      body: { moduleId: mod._id, title: "Lesson 1", publicId: sig.publicId },
    });

    const detail = await call("GET", `/api/admin/courses/${course._id}`, { user: admin });

    expect(detail.status).toBe(200);
    expect(detail.body.data.modules).toHaveLength(1);
    expect(detail.body.data.modules[0].videos).toHaveLength(1);
    expect(detail.body.data.modules[0].videos[0].title).toBe("Lesson 1");
    expect(detail.body.data.modules[0].videos[0].publicId).toBeUndefined();
  });
});

/*
|--------------------------------------------------------------------------
| Upload -> processing -> publish
|--------------------------------------------------------------------------
*/
describe("video upload lifecycle", () => {
  let course, mod;

  beforeEach(async () => {
    course = (await call("POST", "/api/admin/courses", { user: admin, body: { title: "C1" } })).body
      .data;
    mod = (
      await call("POST", `/api/admin/courses/${course._id}/modules`, {
        user: admin,
        body: { title: "Intro" },
      })
    ).body.data;
  });

  test("upload signature scopes the publicId to this course", async () => {
    const res = await call("POST", "/api/admin/videos/upload-signature", {
      user: admin,
      body: { moduleId: mod._id },
    });

    expect(res.status).toBe(200);
    expect(res.body.data.publicId.startsWith(`${VIDEO_FOLDER}/${course._id}/`)).toBe(true);
    expect(res.body.data.signature).toBe("fake-signature");
  });

  test("rejects confirming a video with a publicId from another course", async () => {
    const res = await call("POST", "/api/admin/videos", {
      user: admin,
      body: {
        moduleId: mod._id,
        title: "Lesson 1",
        publicId: `${VIDEO_FOLDER}/someone-elses-course/abc`,
      },
    });
    expect(res.status).toBe(400);
  });

  test("new video starts as processing and unpublished", async () => {
    const sig = (
      await call("POST", "/api/admin/videos/upload-signature", {
        user: admin,
        body: { moduleId: mod._id },
      })
    ).body.data;

    const res = await call("POST", "/api/admin/videos", {
      user: admin,
      body: { moduleId: mod._id, title: "Lesson 1", publicId: sig.publicId },
    });

    expect(res.body.data.status).toBe("processing");
    expect(res.body.data.published).toBe(false);
  });

  test("cannot publish while still processing", async () => {
    const sig = (
      await call("POST", "/api/admin/videos/upload-signature", {
        user: admin,
        body: { moduleId: mod._id },
      })
    ).body.data;
    const video = (
      await call("POST", "/api/admin/videos", {
        user: admin,
        body: { moduleId: mod._id, title: "Lesson 1", publicId: sig.publicId },
      })
    ).body.data;

    const res = await call("PATCH", `/api/admin/videos/${video._id}/publish`, {
      user: admin,
      body: { published: true },
    });
    expect(res.status).toBe(400);
  });

  const sendWebhook = async (publicId, extra = {}) => {
    const payload = JSON.stringify({ public_id: publicId, duration: 42.5, format: "mp4", ...extra });
    const timestamp = Math.round(Date.now() / 1000);
    const signature = crypto
      .createHash("sha1")
      .update(payload + timestamp + process.env.CLOUDINARY_API_SECRET)
      .digest("hex");

    const res = await fetch(`${baseUrl}/api/videos/webhooks/cloudinary`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-cld-timestamp": String(timestamp),
        "x-cld-signature": signature,
      },
      body: payload,
    });
    return res.status;
  };

  test("webhook with a bad signature is rejected and does not change status", async () => {
    const sig = (
      await call("POST", "/api/admin/videos/upload-signature", {
        user: admin,
        body: { moduleId: mod._id },
      })
    ).body.data;
    const video = (
      await call("POST", "/api/admin/videos", {
        user: admin,
        body: { moduleId: mod._id, title: "Lesson 1", publicId: sig.publicId },
      })
    ).body.data;

    const status = await fetch(`${baseUrl}/api/videos/webhooks/cloudinary`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-cld-timestamp": String(Math.round(Date.now() / 1000)),
        "x-cld-signature": "not-the-real-signature",
      },
      body: JSON.stringify({ public_id: sig.publicId }),
    }).then((r) => r.status);

    expect(status).toBe(401);
    const stillProcessing = await call("GET", `/api/admin/videos/${video._id}`, { user: admin });
    expect(stillProcessing.body.data.status).toBe("processing");
  });

  test("a correctly signed webhook marks the video ready, and it can then be published and watched", async () => {
    const sig = (
      await call("POST", "/api/admin/videos/upload-signature", {
        user: admin,
        body: { moduleId: mod._id },
      })
    ).body.data;
    const video = (
      await call("POST", "/api/admin/videos", {
        user: admin,
        body: { moduleId: mod._id, title: "Lesson 1", publicId: sig.publicId },
      })
    ).body.data;

    const webhookStatus = await sendWebhook(sig.publicId);
    expect(webhookStatus).toBe(200);

    const afterWebhook = await call("GET", `/api/admin/videos/${video._id}`, { user: admin });
    expect(afterWebhook.body.data.status).toBe("ready");
    expect(afterWebhook.body.data.durationSeconds).toBe(42.5);

    const publish = await call("PATCH", `/api/admin/videos/${video._id}/publish`, {
      user: admin,
      body: { published: true },
    });
    expect(publish.status).toBe(200);
    expect(publish.body.data.published).toBe(true);

    // Student still can't watch without a grant.
    const blocked = await call("GET", `/api/videos/${video._id}/play`, { user: student });
    expect(blocked.status).toBe(403);

    await call("POST", `/api/admin/courses/${course._id}/access`, {
      user: admin,
      body: { studentId: student._id },
    });

    const allowed = await call("GET", `/api/videos/${video._id}/play`, { user: student });
    expect(allowed.status).toBe(200);
    expect(allowed.body.data.streamUrl).toContain(sig.publicId);
  });

  test("a failed transcode marks the video failed, and it still can't be published", async () => {
    const sig = (
      await call("POST", "/api/admin/videos/upload-signature", {
        user: admin,
        body: { moduleId: mod._id },
      })
    ).body.data;
    const video = (
      await call("POST", "/api/admin/videos", {
        user: admin,
        body: { moduleId: mod._id, title: "Lesson 1", publicId: sig.publicId },
      })
    ).body.data;

    await sendWebhook(sig.publicId, { status: "error" });

    const detail = await call("GET", `/api/admin/videos/${video._id}`, { user: admin });
    expect(detail.body.data.status).toBe("failed");

    const publish = await call("PATCH", `/api/admin/videos/${video._id}/publish`, {
      user: admin,
      body: { published: true },
    });
    expect(publish.status).toBe(400);
  });
});

/*
|--------------------------------------------------------------------------
| Edit, reorder, replace, delete
|--------------------------------------------------------------------------
*/
describe("editing videos", () => {
  let course, mod, videoA, videoB;

  const uploadVideo = async (title) => {
    const sig = (
      await call("POST", "/api/admin/videos/upload-signature", {
        user: admin,
        body: { moduleId: mod._id },
      })
    ).body.data;
    return (
      await call("POST", "/api/admin/videos", {
        user: admin,
        body: { moduleId: mod._id, title, publicId: sig.publicId },
      })
    ).body.data;
  };

  beforeEach(async () => {
    course = (await call("POST", "/api/admin/courses", { user: admin, body: { title: "C1" } })).body
      .data;
    mod = (
      await call("POST", `/api/admin/courses/${course._id}/modules`, {
        user: admin,
        body: { title: "Intro" },
      })
    ).body.data;
    videoA = await uploadVideo("Video A");
    videoB = await uploadVideo("Video B");
  });

  test("edits title and description", async () => {
    const res = await call("PATCH", `/api/admin/videos/${videoA._id}`, {
      user: admin,
      body: { title: "Renamed", description: "New description" },
    });
    expect(res.body.data.title).toBe("Renamed");
    expect(res.body.data.description).toBe("New description");
  });

  test("rejects an empty title", async () => {
    const res = await call("PATCH", `/api/admin/videos/${videoA._id}`, {
      user: admin,
      body: { title: "   " },
    });
    expect(res.status).toBe(400);
  });

  test("reorders videos within a module", async () => {
    expect(videoA.order).toBe(0);
    expect(videoB.order).toBe(1);

    const res = await call("PATCH", `/api/admin/modules/${mod._id}/videos/order`, {
      user: admin,
      body: { orderedVideoIds: [videoB._id, videoA._id] },
    });

    expect(res.status).toBe(200);
    const byId = Object.fromEntries(res.body.data.map((v) => [v._id, v.order]));
    expect(byId[videoB._id]).toBe(0);
    expect(byId[videoA._id]).toBe(1);
  });

  test("rejects a reorder that omits a video", async () => {
    const res = await call("PATCH", `/api/admin/modules/${mod._id}/videos/order`, {
      user: admin,
      body: { orderedVideoIds: [videoA._id] },
    });
    expect(res.status).toBe(400);
  });

  test("replacing a video keeps the same id, resets to processing/unpublished, and cleans up the old asset", async () => {
    const oldPublicId = videoA.publicId;

    const replaceSig = await call("POST", `/api/admin/videos/${videoA._id}/replace/upload-signature`, {
      user: admin,
    });
    expect(replaceSig.body.data.publicId).not.toBe(oldPublicId);

    const confirmed = await call("POST", `/api/admin/videos/${videoA._id}/replace/confirm`, {
      user: admin,
      body: { publicId: replaceSig.body.data.publicId },
    });

    expect(confirmed.status).toBe(200);
    expect(confirmed.body.data._id).toBe(videoA._id);
    expect(confirmed.body.data.status).toBe("processing");
    expect(confirmed.body.data.published).toBe(false);
    expect(fakeCloudinary.uploader.destroy).toHaveBeenCalledWith(
      oldPublicId,
      expect.objectContaining({ resource_type: "video" }),
    );
  });

  test("deleting a video destroys the Cloudinary asset and removes the record", async () => {
    const res = await call("DELETE", `/api/admin/videos/${videoA._id}`, { user: admin });
    expect(res.status).toBe(200);
    expect(fakeCloudinary.uploader.destroy).toHaveBeenCalledWith(
      videoA.publicId,
      expect.objectContaining({ resource_type: "video" }),
    );

    const gone = await call("GET", `/api/admin/videos/${videoA._id}`, { user: admin });
    expect(gone.status).toBe(404);
  });
});

/*
|--------------------------------------------------------------------------
| Access grants and student roster
|--------------------------------------------------------------------------
*/
describe("access control", () => {
  let course;

  beforeEach(async () => {
    course = (await call("POST", "/api/admin/courses", { user: admin, body: { title: "C1" } })).body
      .data;
  });

  test("granting then revoking removes access, and can be re-granted", async () => {
    await call("POST", `/api/admin/courses/${course._id}/access`, {
      user: admin,
      body: { studentId: student._id },
    });

    const listed1 = await call("GET", `/api/admin/courses/${course._id}/students`, { user: admin });
    expect(listed1.body.data.map((s) => s.student._id)).toContain(student._id);

    await call("DELETE", `/api/admin/courses/${course._id}/access/${student._id}`, { user: admin });

    const listed2 = await call("GET", `/api/admin/courses/${course._id}/students`, { user: admin });
    expect(listed2.body.data.map((s) => s.student._id)).not.toContain(student._id);

    await call("POST", `/api/admin/courses/${course._id}/access`, {
      user: admin,
      body: { studentId: student._id },
    });
    const listed3 = await call("GET", `/api/admin/courses/${course._id}/students`, { user: admin });
    expect(listed3.body.data.map((s) => s.student._id)).toContain(student._id);
  });

  test("revoking a student with no active grant 404s", async () => {
    const res = await call("DELETE", `/api/admin/courses/${course._id}/access/${student._id}`, {
      user: admin,
    });
    expect(res.status).toBe(404);
  });

  test("a student only sees courses they've been granted", async () => {
    await call("POST", `/api/admin/courses/${course._id}/access`, {
      user: admin,
      body: { studentId: student._id },
    });

    const forStudent = await call("GET", "/api/courses", { user: student });
    expect(forStudent.body.data.map((c) => c._id)).toEqual([course._id]);

    const forOther = await call("GET", "/api/courses", { user: otherStudent });
    expect(forOther.body.data).toEqual([]);
  });

  test("a student without access is blocked from the course detail", async () => {
    const res = await call("GET", `/api/courses/${course._id}`, { user: otherStudent });
    expect(res.status).toBe(403);
  });

  test("admin student roster lists students with their active grant count", async () => {
    await call("POST", `/api/admin/courses/${course._id}/access`, {
      user: admin,
      body: { studentId: student._id },
    });

    const res = await call("GET", "/api/admin/students", { user: admin });
    const entry = res.body.data.find((s) => s._id === student._id);
    expect(entry.activeCourseCount).toBe(1);

    const other = res.body.data.find((s) => s._id === otherStudent._id);
    expect(other.activeCourseCount).toBe(0);
  });

  test("student roster search filters by name/email", async () => {
    const res = await call("GET", "/api/admin/students?search=stu", { user: admin });
    expect(res.body.data.map((s) => s._id)).toEqual([student._id]);
  });
});
