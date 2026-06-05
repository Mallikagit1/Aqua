<<<<<<< HEAD
const mongoose = require("mongoose");

const salesBillSchema = new mongoose.Schema({
    created_by: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Admin"
    },

    customer_name: {
        type: String,
        default: ""
    },

    customer_phone: {
        type: String,
        default: ""
    },

    subtotal_before_discount: {
        type: Number,
        default: 0
    },

    total_discount: {
        type: Number,
        default: 0
    },

    final_total_after_discount: {
        type: Number,
        default: 0
    },

   items: [{
    product_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Product"
    },
    product_name: String,
    quantity: Number,
    rate: Number,
    discount_percent: Number,
    subtotal_pre_disc: Number,
    subtotal_post_disc: Number
}]
}, {
    timestamps: {
        createdAt: "bill_date",
        updatedAt: false
    }
});

=======
const mongoose = require("mongoose");

const salesBillSchema = new mongoose.Schema({
    created_by: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Admin"
    },

    customer_name: {
        type: String,
        default: ""
    },

    customer_phone: {
        type: String,
        default: ""
    },

    subtotal_before_discount: {
        type: Number,
        default: 0
    },

    total_discount: {
        type: Number,
        default: 0
    },

    final_total_after_discount: {
        type: Number,
        default: 0
    },

   items: [{
    product_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Product"
    },
    product_name: String,
    quantity: Number,
    rate: Number,
    discount_percent: Number,
    subtotal_pre_disc: Number,
    subtotal_post_disc: Number
}]
}, {
    timestamps: {
        createdAt: "bill_date",
        updatedAt: false
    }
});

>>>>>>> 9fac02cd86fb07b13cedcde3aaff65951c89fd90
module.exports = mongoose.model("SalesBill", salesBillSchema);