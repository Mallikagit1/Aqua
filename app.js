
const express = require('express');
const mysql = require("mysql2/promise");
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

// =================== DATABASE CONNECTION ===================
let db;
(async () => {
    try {
        db = await mysql.createPool({
            host: process.env.DB_HOST || 'localhost',
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || 'Mysql@123',
            database: process.env.DB_NAME || 'sri',
            waitForConnections: true,
            connectionLimit: 10,
            queueLimit: 0
        });
        app.set('db', db);
        console.log('✅ MySQL pool created and connected.');
    } catch (error) {
        console.error('❌ Database connection failed:', error);
        process.exit(1);
    }
})();

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
        await db.query("INSERT INTO admin (email, password_hash) VALUES (?, ?)", [email, hash]);
        res.render('message', { message: '✅ Registration successful!', backLink: '/login' });
    } catch (err) {
        console.error("Registration error:", err);
        res.render('message', { message: '❌ Registration failed. The email might already be in use.', backLink: '/admin/register' });
    }
});

app.post("/admin/login", async (req, res) => {
    const db = req.app.get('db');
    const { email, password } = req.body;
    if (!email || !password) {
        return res.render("login", { title: "Login", error: "Please enter both email and password." });
    }
    try {
        const [rows] = await db.query("SELECT * FROM admin WHERE email = ?", [email]);
        const admin = rows[0];
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
    const { name, picture_url, product_count, product_rate } = req.body;
    try {
        await db.query(
            "INSERT INTO products (name, picture_url, product_count, product_rate) VALUES (?, ?, ?, ?)",
            [name, picture_url, product_count || 0, product_rate || 0]
        );
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
        await db.query("UPDATE products SET product_rate = ? WHERE pid = ?", [
            product_rate,
            pid,
        ]);
        res.render('message', { message: '✅ Rate updated successfully!', backLink: '/products' });
    } catch (err) {
        console.error(err);
        res.render('message', { message: '❌ Update failed.', backLink: '/products' });
    }
});
app.get("/products", verifyToken, async (req, res) => {
    const db = req.app.get('db');
    try {
        const [rows] = await db.query("SELECT * FROM products");
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
app.get("/bills/import", verifyToken, async (req, res) => {
    const db = req.app.get('db'); // Get database connection
    try {
        // Fetch the list of all products from the database
        const [dbProducts] = await db.query("SELECT pid, name, product_count FROM products");

        const admin = {
          id: req.session.adminId,
          email: req.session.adminEmail
        };
app.get("/products", verifyToken, async (req, res) => {
    const db = req.app.get('db');
    
    // req.admin is guaranteed to be set by the verifyToken middleware 
    // if the user is authenticated.
    const admin = req.admin; 

    try {
        // Fetch all products
        const [rows] = await db.query("SELECT * FROM products");

        // Render the products view, passing products and admin data
        res.render("products", { 
            products: rows, 
            title: "Product List",
            admin: admin // <-- Essential for the navigation bar in layout.ejs
        });

    } catch (err) {
        console.error(err);
        // If there's a database error, show a message, ensuring 'admin' is still passed
        res.render('message', { 
            message: '❌ Failed to fetch products.', 
            backLink: '/dashboard',
            admin: admin 
        });
    }
});
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
    const db = req.app.get('db');
    try {
        const [dbProducts] = await db.query("SELECT pid, name, product_count FROM products ORDER BY name ASC");
        res.render("import-bill", {
            products: dbProducts,
            admin: req.admin // req.admin is guaranteed to exist here
        });
    } catch (err) {
        console.error(err);
        // FIX 4: Ensure admin is passed to error view
        res.render('message', { message: '❌ Failed to load import page.', backLink: '/dashboard', admin: req.admin });
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
    const db = req.app.get('db');
    // 1. FIX: Destructure the new 'importedFrom' field from req.body
    const { items, importedFrom } = req.body; 
    
    const adminId = req.admin.id; 

    if (!items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ message: 'Cannot create an empty bill.' });
    }

    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();

        // 2. FIX: Include 'imported_from' in the INSERT query
        const [billResult] = await conn.query(
            "INSERT INTO import_bills (created_by, imported_from) VALUES (?, ?)",
            [adminId, importedFrom || null] // Pass importedFrom value
        );
        const newBillId = billResult.insertId;

        for (const item of items) {
            const numProductId = parseInt(item.product_id);
            const numQuantity = parseInt(item.quantity);

            if (numQuantity <= 0) {
                throw new Error(`Invalid quantity for product ID ${numProductId}.`);
            }

            await conn.query(
                "INSERT INTO import_bill_items (bill_id, product_id, quantity) VALUES (?, ?, ?)",
                [newBillId, numProductId, numQuantity]
            );

            await conn.query(
                "UPDATE products SET product_count = product_count + ? WHERE pid = ?",
                [numQuantity, numProductId]
            );
        }

        await conn.commit();
        res.status(200).json({ message: 'Import Bill created successfully!' });

    } catch (err) {
        await conn.rollback();
        console.error("Import Bill Transaction failed:", err);
        res.status(500).json({ message: `Failed to create import bill. Error: ${err.message}` });
    } finally {
        conn.release();
    }
});
// --- Sold Bill Routes ---

// --- GET ROUTE ---
app.get("/sold-bill", verifyToken, async (req, res) => {
    const db = req.app.get('db');
    try {
        // Fetch products, aliasing product_rate as rate for client-side use
        const [products] = await db.query(
            "SELECT pid, name, product_count, product_rate AS rate FROM products ORDER BY name ASC"
        );
        res.render("sold-bill", {
            products: products,
            admin: req.admin // req.admin is guaranteed by verifyToken
        });

    } catch (err) {
        console.error(err);
        // Ensure admin is passed for layout rendering on error
        res.render('message', { message: '❌ Failed to load the sold billing page.', backLink: '/dashboard', admin: req.admin });
    }
});

// --- POST ROUTE ---
app.post("/sold-bill", verifyToken, async (req, res) => {
    const db = req.app.get('db');
    // FIX 1: Destructure new customer fields from req.body
    const { billItems, subtotal, finalTotal, totalDiscount, customerName, customerPhone } = req.body;
    const adminId = req.admin.id;

    if (!billItems || !Array.isArray(billItems) || billItems.length === 0) {
        return res.status(400).json({ message: 'Cannot create an empty bill.' });
    }

    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();

        // FIX 2: Include new columns in the INSERT query
        const [billResult] = await conn.query(
            "INSERT INTO sold_bills (created_by, customer_name, customer_phone, subtotal_before_discount, final_total_after_discount, total_discount) VALUES (?, ?, ?, ?, ?, ?)",
            [adminId, customerName || null, customerPhone || null, subtotal, finalTotal, totalDiscount]
        );
        const newBillId = billResult.insertId;

        // ... (rest of the item insertion and product count update logic remains unchanged) ...
        for (const item of billItems) {
            const numProductId = parseInt(item.product_id);
            const numQuantity = parseInt(item.quantity);
            const numRate = parseFloat(item.rate);
            const numDiscountPercent = parseFloat(item.discount_percent);
            const numPreDisc = parseFloat(item.subtotal_pre_disc);
            const numPostDisc = parseFloat(item.subtotal_post_disc);

            if (numQuantity <= 0) {
                throw new Error(`Invalid quantity for product ID ${numProductId}.`);
            }

            const [stockRows] = await conn.query("SELECT product_count FROM products WHERE pid = ?", [numProductId]);
            if (!stockRows.length || stockRows[0].product_count < numQuantity) {
                throw new Error(`Insufficient stock for product ID ${numProductId}. Available: ${stockRows[0].product_count}, Requested: ${numQuantity}`);
            }

            await conn.query(
                "INSERT INTO sold_bill_items (bill_id, product_id, quantity, rate, discount_percent, subtotal_pre_disc, subtotal_post_disc) VALUES (?, ?, ?, ?, ?, ?, ?)",
                [newBillId, numProductId, numQuantity, numRate, numDiscountPercent, numPreDisc, numPostDisc]
            );

            await conn.query(
                "UPDATE products SET product_count = product_count - ? WHERE pid = ?",
                [numQuantity, numProductId]
            );
        }

        await conn.commit();
        res.status(200).json({ message: 'Sold Bill created successfully!' });

    } catch (err) {
        await conn.rollback();
        console.error("Sold Bill Transaction failed:", err);
        res.status(500).json({ message: `Failed to create sold bill. Error: ${err.message}` });
    } finally {
        conn.release();
    }
});

// --- Reports Route ---

app.get("/reports", verifyToken, async (req, res) => {
    const db = req.app.get('db');
    // Ensure all variables are extracted safely
    const { type, level, billId, date } = req.query; 

    // --- Table Definitions (Standardized to snake_case for MySQL reliability) ---
    const SOLD_TABLE = 'sold_bills';
    const SOLD_ITEMS_TABLE = 'sold_bill_items';
    const IMPORT_TABLE = 'import_bills';
    const IMPORT_ITEMS_TABLE = 'import_bill_items';
    const ADMIN_TABLE = 'admin'; 
    const PRODUCTS_TABLE = 'products'; 

    let billType = type;
    let levelToUse = level;
    const admin = req.admin;

    // Default values needed for EJS rendering if no report type is selected
    let reportType = 'Select Bill Report Type';
    let reportData = [];
    let isDetailed = false;
    let isItemized = false;


    // =================================================================
    // 1. HANDLE INITIAL LOAD or BILL DETAILS REQUEST
    // =================================================================
    
    // --- Initial Load Check (No type selected) ---
    if (!billType || !['sale', 'import'].includes(billType)) {
        return res.render("bills-report-view", {
            reportType: "Select Bill Report Type",
            data: [],
            level: undefined,
            isDetailed: false,
            isItemized: false,
            billType: undefined, 
            admin: admin
        });
    }

    // --- Individual Bill Details (Using billId) ---
    if (billId) {
        const bills_table = (billType === 'sale') ? SOLD_TABLE : IMPORT_TABLE;
        const items_table = (billType === 'sale') ? SOLD_ITEMS_TABLE : IMPORT_ITEMS_TABLE;
        const pk_column_name = 'bill_id'; 
        
        try {
            const additionalColumns = billType === 'sale'
                ? 'b.customer_name, b.customer_phone, b.subtotal_before_discount, b.total_discount, b.final_total_after_discount'
                : 'b.imported_from';

            const mainBillSql = `
                SELECT 
                    b.bill_id, 
                    b.bill_date,
                    ${additionalColumns},
                    a.email AS created_by
                FROM ${bills_table} b
                JOIN ${ADMIN_TABLE} a ON b.created_by = a.id
                WHERE b.${pk_column_name} = ?
            `;
            const [[mainBill]] = await db.query(mainBillSql, [billId]);

            if (!mainBill) {
                throw new Error(`Bill ID ${billId} not found.`);
            }

            const itemsSql = `
                SELECT
                    p.name AS product_name, 
                    bi.quantity AS qty
                    ${billType === 'sale' ? ', bi.rate, bi.discount_percent, bi.subtotal_pre_disc, bi.subtotal_post_disc' : ''}
                FROM ${items_table} bi
                JOIN ${PRODUCTS_TABLE} p ON bi.product_id = p.pid 
                WHERE bi.bill_id = ?
                ORDER BY p.name ASC
            `;
            const [billItems] = await db.query(itemsSql, [billId]);

            // --- Inside app.js, in the 'if (billId)' block ---

// ... (code to fetch mainBill and billItems runs here) ...

// Renders the individual details view, passing only the variables it needs.
return res.render("bill-details-view", {
    bill: mainBill,
    items: billItems,
    billType: billType,
    admin: admin
});

// The variable 'reportType' is NOT passed here.

        } catch (err) {
            console.error("Bill detail fetching failed:", err);
            return res.render('message', {
                message: `❌ Failed to fetch bill details. Error: ${err.message}`, 
                backLink: '/reports', 
                admin: admin
            });
        }
    }

    // =================================================================
    // 2. HANDLE AGGREGATED & DETAILED LIST VIEWS
    // =================================================================
    
    if (!levelToUse || !['day', 'month', 'year', 'monthly_detail'].includes(levelToUse)) {
        levelToUse = 'day';
    }

    const bills_table = (billType === 'sale') ? SOLD_TABLE : IMPORT_TABLE;
    const items_table = (billType === 'sale') ? SOLD_ITEMS_TABLE : IMPORT_ITEMS_TABLE;
    const item_rate_column = (billType === 'sale') ? 'bi.rate' : '0.00'; 
    const total_value_column = (billType === 'sale') ? 'final_total_after_discount' : '0'; 
    const pk_column_name = 'bill_id'; 
    
    let dateFormat;
    if (levelToUse === 'year') {
        dateFormat = '%Y';
    } else if (levelToUse === 'month') {
        dateFormat = '%Y-%m';
    } else { 
        dateFormat = '%Y-%m-%d';
    }

    try {
        
        // --- C. MONTHLY ITEMIZED VIEW ---
        if (levelToUse === 'monthly_detail' && date) {
            isItemized = true;
            
            const [year, month] = date.split('-');

            const detailItemSql = `
                SELECT
                    b.bill_id,
                    b.bill_date,
                    a.email AS created_by,
                    p.name AS product_name, 
                    bi.quantity,
                    ${item_rate_column} AS rate,
                    ${billType === 'sale' ? 'bi.subtotal_post_disc' : '0.00'} AS net_item_value,
                    ${billType === 'sale' ? 'bi.discount_percent' : '0.00'} AS discount_percent
                    ${billType === 'sale' ? ', b.customer_name' : ', b.imported_from'}
                FROM ${items_table} bi
                JOIN ${PRODUCTS_TABLE} p ON bi.product_id = p.pid 
                JOIN ${bills_table} b ON bi.bill_id = b.bill_id
                JOIN ${ADMIN_TABLE} a ON b.created_by = a.id
                WHERE YEAR(b.bill_date) = ? AND MONTH(b.bill_date) = ?
                ORDER BY b.bill_date DESC, p.name ASC
            `;
            [reportData] = await db.query(detailItemSql, [year, month]);
            
            reportType = `${date} Itemized ${billType} Bills`;

        // --- B. DAILY DETAILED BILLS (Normal List) ---
        } else if (levelToUse === 'day') {
            isDetailed = true;
            
            const detailColumns = billType === 'sale'
                ? ', b.customer_name, b.customer_phone'
                : ', b.imported_from';

            const detailSql = `
                SELECT
                    b.${pk_column_name} AS id,
                    ${total_value_column} AS total_value,
                    b.bill_date AS created_at,
                    a.email AS created_by
                    ${detailColumns}
                FROM ${bills_table} b
                JOIN ${ADMIN_TABLE} a ON b.created_by = a.id
                ORDER BY b.bill_date DESC
                LIMIT 100
            `;
            [reportData] = await db.query(detailSql);

        // --- C. AGGREGATED SUMMARY ---
        } else { // levelToUse is 'month' or 'year' (Summary View)
            const summarySql = `
                SELECT
                    DATE_FORMAT(b.bill_date, ?) AS report_date,
                    COUNT(b.${pk_column_name}) AS total_transactions,
                    SUM(${total_value_column}) AS total_value
                FROM ${bills_table} b
                GROUP BY report_date
                ORDER BY report_date DESC
            `;
            [reportData] = await db.query(summarySql, [dateFormat]);
            reportType = `${levelToUse}ly ${billType} Bills`;
        }

        // 3. Render the standard report view
        return res.render("bills-report-view", {
            reportType: reportType,
            data: reportData,
            level: levelToUse,
            isDetailed: isDetailed,
            isItemized: isItemized, // Flag controls which table to render
            billType: billType,
            admin: admin
        });

    } catch (err) {
        console.error("Report generation failed:", err);
        return res.render('message', {
            message: `❌ Report generation failed. Error: ${err.message}`,
            backLink: '/dashboard',
            admin: admin
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
