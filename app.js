
const express = require('express');

const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const bodyParser = require("body-parser");
const session = require("express-session");
const expressEjsLayouts = require('express-ejs-layouts')
const path = require("path");
require("dotenv").config();

// =================== INITIALIZE APP ===================
const app = express();
const PORT = process.env.PORT || 3000;

// =================== MIDDLEWARES ===================

app.use(session({
    secret: process.env.SESSION_SECRET || 'a-very-secret-key-that-you-should-change',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: process.env.NODE_ENV === 'production' }
}));

app.use(bodyParser.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

// =================== VIEW ENGINE SETUP ===================
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
const mongoose = require("mongoose");
const Admin = require("./models/Admin");
const Product = require("./models/Product");
const SalesBill = require("./models/SalesBill");
require("dotenv").config();


mongoose.connect(process.env.MONGODB_URI)
.then(() => {
    console.log("MongoDB Connected");
})
.catch(err => {
    console.error("MongoDB Error:", err);
});

// =================== JWT MIDDLEWARE ===================
// NOTE: This is still useful if you want to secure certain pages/actions.
const verifyToken = (req, res, next) => {
    // ➡️ FIX 2: Correctly attach req.admin on success and ensure redirect on failure
    if (req.session && req.session.adminId) {
        req.admin = { 
            id: req.session.adminId, 
            email: req.session.adminEmail 
        };
        return next(); // Continue processing the request
    }
    
    // If session is missing, redirect to login
    return res.redirect("/login"); 

    // NOTE: If you decide to re-implement JWT token logic later, ensure 
    // it also defines req.admin and calls next().
};

// =================== ROUTES ===================

// --- Page rendering routes ---
app.get("/", (req, res) => {
    res.render("login", { title: "Login", error: "" });
});

app.get("/login", (req, res) => {
    res.render("login", { title: "Admin Login", error: "" });
});

app.get("/admin/register", (req, res) => {
    res.render("register", { title: "Admin Registration" });
});

app.get("/dashboard", (req, res) => {
    if (!req.session.adminId) {
        return res.redirect("/login");
    }
    const admin = {
        id: req.session.adminId,
        email: req.session.adminEmail
    };
    res.render("dashboard", { title: "Dashboard", admin: admin });
});

// --- Admin action routes ---
app.post("/admin/register", async (req, res) => {
    const db = req.app.get('db');
    const { email, password } = req.body;
    if (!email || !password) {
        return res.render('message', { message: '❌ Email and password are required.', backLink: '/admin/register' });
    }
    try {
        const hash = await bcrypt.hash(password, 10);
        await Admin.create({email,password_hash: hash
});
        res.render('message', { message: '✅ Registration successful!', backLink: '/login' });
    } catch (err) {
        console.error("Registration error:", err);
        res.render('message', { message: '❌ Registration failed. The email might already be in use.', backLink: '/admin/register' });
    }
});

app.post("/admin/login", async (req, res) => {
   
    const { email, password } = req.body;
    if (!email || !password) {
        return res.render("login", { title: "Login", error: "Please enter both email and password." });
    }
    try {
        const admin = await Admin.findOne({ email });
        
        if (!admin) {
            return res.render("login", { title: "Login", error: "Invalid email or password" });
        }
        const match = await bcrypt.compare(password.trim(), admin.password_hash);
        if (!match) {
            return res.render("login", { title: "Login", error: "Invalid email or password" });
        }
        req.session.adminId = admin.id;
        req.session.adminEmail = admin.email;
        res.redirect("/dashboard");
    } catch (err) {
        console.error("Login error:", err);
        res.render('message', { message: '❌ Login failed due to a server error.', backLink: '/login' });
    }
});

// =================== PRODUCT ROUTES ===================
app.post("/products/add", verifyToken, async (req, res) => {
    const db = req.app.get('db');
   const { name, product_count, product_rate } = req.body;

    try {
        await Product.create({
    name,
    product_count: product_count || 0,
    product_rate: product_rate || 0
});
        res.render('message', { message: '✅ Product added successfully!', backLink: '/products' });
    } catch (err) {
        console.error(err);
        res.render('message', { message: '❌ Failed to add product.', backLink: '/products' });
    }
});

app.post("/products/update-rate", verifyToken, async (req, res) => {
    const db = req.app.get('db');
    const { pid, product_rate } = req.body;
    try {
        await Product.findByIdAndUpdate(
    pid,
    { product_rate }
);
        res.render('message', { message: '✅ Rate updated successfully!', backLink: '/products' });
    } catch (err) {
        console.error(err);
        res.render('message', { message: '❌ Update failed.', backLink: '/products' });
    }
});
app.get("/products", verifyToken, async (req, res) => {
    const db = req.app.get('db');
    try {
        const rows = await Product.find();
        res.render("products", {
            products: rows,
            title: "Product List",
            admin: req.admin // 'req.admin' is now available due to the fix above
        });
    } catch (err) {
        console.error(err);
        res.render('message', { message: '❌ Failed to fetch products.', backLink: '/dashboard' });
    }
});
/**
 * GET /bills/import
 * Renders the form to create a new import bill.
 */
const ImportBill = require("./models/ImportBill");
app.get("/bills/import", verifyToken, async (req, res) => {
    const db = req.app.get('db'); // Get database connection
    try {
        // Fetch the list of all products from the database
       const dbProducts = await Product.find(
    {},
    {
        name: 1,
        product_count: 1
    }
).sort({ name: 1 });

        const admin = {
          id: req.session.adminId,
          email: req.session.adminEmail
        };

        // Render the form, passing the products from the DATABASE
        res.render("import-bill", { 
            products: dbProducts, // Use the real product list
            admin: admin
        });

    } catch (err) {
        console.error(err);
        res.render('message', { message: '❌ Failed to load import page.', backLink: '/dashboard' });
    }
});

/**
 * POST /bills/import
 * Handles the form submission to create a new bill entry.
 */
/**
 * POST /bills/import
 * Handles creating a new import bill with MULTIPLE items.
 */
app.get("/import-bill", verifyToken, async (req, res) => {
    try {

        const dbProducts = await Product.find()
            .sort({ name: 1 });

        res.render("import-bill", {
            products: dbProducts,
            admin: req.admin
        });

    } catch (err) {

        console.error(err);

        res.render("message", {
            message: "❌ Failed to load import page.",
            backLink: "/dashboard",
            admin: req.admin
        });
    }
});

/**
 * POST /import-bill
 * Handles creating a new import bill with MULTIPLE items (No Rate).
 */
/**
 * POST /import-bill
 * Handles creating a new import bill with MULTIPLE items (No Rate).
 */
app.post("/import-bill", verifyToken, async (req, res) => {


const { items, importedFrom } = req.body;

if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({
        message: "Cannot create an empty bill."
    });
}

try {

    const billItems = [];

    for (const item of items) {

        const quantity = Number(item.quantity);

        if (quantity <= 0) {
            throw new Error(
                `Invalid quantity for product ${item.product_id}`
            );
        }
const product = await Product.findById(item.product_id);

if (!product) {
    throw new Error(`Product not found: ${item.product_id}`);
}
        billItems.push({
    product_id: item.product_id,
    product_name: product.name,
    quantity: quantity
});

        await Product.findByIdAndUpdate(
            item.product_id,
            {
                $inc: {
                    product_count: quantity
                }
            }
        );
    }

    await ImportBill.create({
    created_by: req.admin.id,
    imported_from: importedFrom || "",
    items: billItems
});

    return res.status(200).json({
        message: "Import Bill created successfully!"
    });

} catch (err) {

    console.error("Import Bill Error:", err);

    return res.status(500).json({
        message: err.message
    });
}


});

// --- Sold Bill Routes ---

// --- GET ROUTE ---
app.get("/sold-bill", verifyToken, async (req, res) => {
    try {

        const products = await Product.find()
            .sort({ name: 1 });

        res.render("sold-bill", {
            products,
            admin: req.admin
        });

    } catch (err) {

        console.error(err);

        res.render("message", {
            message: "❌ Failed to load the sold billing page.",
            backLink: "/dashboard",
            admin: req.admin
        });
    }
});

// --- POST ROUTE ---
app.post("/sold-bill", verifyToken, async (req, res) => {


const {
    billItems,
    subtotal,
    finalTotal,
    totalDiscount,
    customerName,
    customerPhone
} = req.body;

const adminId = req.admin.id;


if (!billItems || !Array.isArray(billItems) || billItems.length === 0) {
    return res.status(400).json({
        message: "Cannot create an empty bill."
    });
}

try {

    const saleItems = [];

    for (const item of billItems) {

        const product = await Product.findById(
            item.product_id
        );

        const numQuantity = Number(item.quantity);
        const numRate = Number(item.rate);
const numDiscountPercent = Number(item.discount_percent);
const numPreDisc = Number(item.subtotal_pre_disc);
const numPostDisc = Number(item.subtotal_post_disc);

        if (!product) {
            throw new Error(
                `Product not found: ${item.product_id}`
            );
        }

        if (product.product_count < numQuantity) {
            throw new Error(
                `Insufficient stock for ${product.name}`
            );
        }
        

        saleItems.push({
    product_id: item.product_id,
    product_name: product.name,
    quantity: numQuantity,
    rate: numRate,
    discount_percent: numDiscountPercent,
    subtotal_pre_disc: numPreDisc,
    subtotal_post_disc: numPostDisc
});
        await Product.findByIdAndUpdate(
            item.product_id,
            {
                $inc: {
                    product_count: -numQuantity
                }
            }
        );
    }

   await SalesBill.create({
    created_by: adminId,
    customer_name: customerName || "",
    customer_phone: customerPhone || "",
    subtotal_before_discount: subtotal,
    total_discount: totalDiscount,
    final_total_after_discount: finalTotal,
    items: saleItems
});

    return res.status(200).json({
        message: "Sold Bill created successfully!"
    });

} catch (err) {

    console.error("Sold Bill Error:", err);

    return res.status(500).json({
        message: err.message
    });
}


});


// --- Reports Route ---

app.get("/reports", verifyToken, async (req, res) => {

    const { type, level, billId, date } = req.query;

    const admin = req.admin;

    let billType = type;
    let levelToUse = level;

    let reportType = "Select Bill Report Type";
    let reportData = [];
    let isDetailed = false;
    let isItemized = false;

    if (!billType || !["sale", "import"].includes(billType)) {

        return res.render("bills-report-view", {
            reportType,
            data: [],
            level: undefined,
            isDetailed: false,
            isItemized: false,
            billType: undefined,
            admin
        });
    }

    try {

        // ==================================================
        // BILL DETAILS
        // ==================================================

        if (billId) {

            let bill;

            if (billType === "sale") {
                bill = await SalesBill.findById(billId);
            } else {
                bill = await ImportBill.findById(billId);
            }

            if (!bill) {
                throw new Error("Bill not found");
            }

            return res.render("bill-details-view", {
                bill,
                items: bill.items || [],
                billType,
                admin
            });
        }

        // ==================================================
        // DAILY REPORT
        // ==================================================

        if (levelToUse === "day") {

            isDetailed = true;

            if (billType === "sale") {

                const bills = await SalesBill.find()
                    .sort({ bill_date: -1 });

                reportData = bills.map(bill => ({
                    id: bill._id,
                    total_value: bill.final_total_after_discount,
                    created_at: bill.bill_date,
                    created_by: bill.created_by,
                    customer_name: bill.customer_name,
                    customer_phone: bill.customer_phone
                }));

            } else {

                const bills = await ImportBill.find()
                    .sort({ bill_date: -1 });

                reportData = bills.map(bill => ({
                    id: bill._id,
                    total_value: 0,
                    created_at: bill.bill_date,
                    created_by: bill.created_by,
                    imported_from: bill.imported_from
                }));
            }

            reportType = `Daily ${billType} Bills`;
        }

        // ==================================================
        // MONTHLY ITEMIZED REPORT
        // ==================================================

        else if (levelToUse === "monthly_detail" && date) {

            isItemized = true;

            const [year, month] = date.split("-");

            if (billType === "sale") {

                const bills = await SalesBill.find();

                bills.forEach(bill => {

                    const d = new Date(bill.bill_date);

                    if (
                        d.getFullYear() == year &&
                        (d.getMonth() + 1) == month
                    ) {

                        bill.items.forEach(item => {

                            reportData.push({
                                bill_id: bill._id,
                                bill_date: bill.bill_date,
                                product_name: item.product_name,
                                quantity: item.quantity,
                                rate: item.rate,
                                net_item_value: item.subtotal_post_disc,
                                customer_name: bill.customer_name
                            });
                        });
                    }
                });

            } else {

                const bills = await ImportBill.find();

                bills.forEach(bill => {

                    const d = new Date(bill.bill_date);

                    if (
                        d.getFullYear() == year &&
                        (d.getMonth() + 1) == month
                    ) {

                        bill.items.forEach(item => {

                            reportData.push({
                                bill_id: bill._id,
                                bill_date: bill.bill_date,
                                product_name: item.product_name,
                                quantity: item.quantity,
                                rate: 0,
                                net_item_value: 0,
                                imported_from: bill.imported_from
                            });
                        });
                    }
                });
            }

            reportType = `${date} Itemized ${billType} Bills`;
        }

        // ==================================================
        // MONTHLY SUMMARY
        // ==================================================

        else if (levelToUse === "month") {

            const bills =
                billType === "sale"
                    ? await SalesBill.find()
                    : await ImportBill.find();

            const grouped = {};

            bills.forEach(bill => {

                const d = new Date(bill.bill_date);

                const key =
                    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

                if (!grouped[key]) {

                    grouped[key] = {
                        report_date: key,
                        total_transactions: 0,
                        total_value: 0
                    };
                }

                grouped[key].total_transactions++;

                if (billType === "sale") {

                    grouped[key].total_value +=
                        Number(
                            bill.final_total_after_discount || 0
                        );
                }
            });

            reportData =
                Object.values(grouped)
                    .sort((a, b) =>
                        b.report_date.localeCompare(
                            a.report_date
                        )
                    );

            reportType = `Monthly ${billType} Bills`;
        }

        // ==================================================
        // YEARLY SUMMARY
        // ==================================================

        else if (levelToUse === "year") {

            const bills =
                billType === "sale"
                    ? await SalesBill.find()
                    : await ImportBill.find();

            const grouped = {};

            bills.forEach(bill => {

                const key =
                    String(
                        new Date(
                            bill.bill_date
                        ).getFullYear()
                    );

                if (!grouped[key]) {

                    grouped[key] = {
                        report_date: key,
                        total_transactions: 0,
                        total_value: 0
                    };
                }

                grouped[key].total_transactions++;

                if (billType === "sale") {

                    grouped[key].total_value +=
                        Number(
                            bill.final_total_after_discount || 0
                        );
                }
            });

            reportData =
                Object.values(grouped)
                    .sort((a, b) =>
                        b.report_date.localeCompare(
                            a.report_date
                        )
                    );

            reportType = `Yearly ${billType} Bills`;
        }

        return res.render("bills-report-view", {
            reportType,
            data: reportData,
            level: levelToUse,
            isDetailed,
            isItemized,
            billType,
            admin
        });

    } catch (err) {

        console.error(err);

        return res.render("message", {
            message: `❌ Report generation failed. Error: ${err.message}`,
            backLink: "/dashboard",
            admin
        });
    }
});
// This handler clears the session and redirects the user to the login page.
app.get("/logout", (req, res) => {
    // 1. Clear session data (if using sessions)
    // Example using express-session:
    if (req.session) {
        req.session.destroy(err => {
            if (err) {
                console.error("Error destroying session:", err);
                return res.redirect('/dashboard'); // Fallback if session clear fails
            }
            // 2. Redirect to the login page
            res.redirect('/login');
        });
    } else {
        // If not using express-session, clear any authentication cookies or tokens here.
        // For simplicity, just redirecting to login.
        res.redirect('/login');
    }
});
//============== SERVER LISTENER ===================
app.listen(PORT, () => {
    console.log(`🚀 Server is running on http://localhost:${PORT}`);
});
