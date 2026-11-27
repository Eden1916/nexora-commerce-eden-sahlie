
const express = require("express");
const cors = require("cors");
require("dotenv").config();

const pool = require("./config/db");

const app = express();


// Middleware
app.use(cors());
app.use(express.json());

const authRoutes = require('./routes/auth.routes');
const sellerRoutes = require('./routes/seller.routes');
const productRoutes = require('./routes/product.routes');
const categoryRoutes = require('./routes/category.routes');

const cartRoutes = require('./routes/cart.routes');
const checkoutRoutes = require('./routes/checkout.routes');
const orderRoutes = require('./routes/order.routes');

app.use('/api/auth', authRoutes);
app.use('/api/seller', sellerRoutes);
app.use('/api/products', productRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/checkout', checkoutRoutes);
app.use('/api/orders', orderRoutes);

// Welcome route
app.get("/", (req, res) => {
  res.json({
    message: "Welcome to Nexora Commerce API!",
    status: "success",
  });
});

// Database health check
app.get("/api/health", async (req, res) => {
  try {
    const result = await pool.query("SELECT NOW()");

    res.status(200).json({
      message: "Database connected successfully!",
      status: "success",
      databaseTime: result.rows[0].now,
    });
  } catch (error) {
    console.error("Database health check failed:", error.message);

    res.status(500).json({
      message: "Database connection failed",
      status: "error",
    });
  }
});

// Start server
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
