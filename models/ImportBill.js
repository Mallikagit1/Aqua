const mongoose = require("mongoose");

const importBillSchema = new mongoose.Schema({
  created_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Admin"
  },

  imported_from: String,

  items: [{
    product_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Product"
    },
    product_name: String,
    quantity: Number
}]
}, {
  timestamps: {
    createdAt: "bill_date"
  }
});

module.exports = mongoose.model("ImportBill", importBillSchema);