const mongoose = require("mongoose");

const productSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  product_count: {
    type: Number,
    default: 0
  },
  product_rate: {
    type: Number,
    default: 0
  }
}, {
  timestamps: {
    createdAt: "created_at",
    updatedAt: false
  }
});

module.exports = mongoose.model("Product", productSchema);