// node scripts/createSuperAdmin.js "Your Name" you@example.com 9999999999 'StrongPassword123'
import "dotenv/config";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import SignUp from "../src/models/signupModels.js";

const [name, email, mobile, password] = process.argv.slice(2);
if (!name || !email || !mobile || !password) {
  console.error("Usage: node scripts/createSuperAdmin.js <name> <email> <mobile> <password>");
  process.exit(1);
}

await mongoose.connect(process.env.MONGODB_URI);

await SignUp.create({
  name,
  email: email.toLowerCase(),
  mobilenumber: mobile.replace(/\D/g, ""),
  password: await bcrypt.hash(password, 10),
  role: "superadmin",
  companyId: null,
  isEmailVerified: true,
});

console.log("Superadmin created");
await mongoose.disconnect();