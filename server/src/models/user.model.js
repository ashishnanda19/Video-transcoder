const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    displayName: {
      type: String,
    },

    googleId: {
      type: String,
      required: true,
      unique: true,
    },

    email: {
      type: String,
    },

    avatar: {
      type: String,
    },
  },
  { timestamps: true }
);

const User = mongoose.models.User || mongoose.model("User", userSchema);
module.exports = User;
