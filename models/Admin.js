<<<<<<< HEAD
const mongoose = require("mongoose");

const adminSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true
  },
  password_hash: {
    type: String,
    required: true
  }
}, {
  timestamps: {
    createdAt: "created_at",
    updatedAt: false
  }
});

=======
const mongoose = require("mongoose");

const adminSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true
  },
  password_hash: {
    type: String,
    required: true
  }
}, {
  timestamps: {
    createdAt: "created_at",
    updatedAt: false
  }
});

>>>>>>> 9fac02cd86fb07b13cedcde3aaff65951c89fd90
module.exports = mongoose.model("Admin", adminSchema);