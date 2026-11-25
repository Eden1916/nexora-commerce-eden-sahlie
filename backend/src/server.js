
const express = require("express");
const cors = require("cors");
require("dotenv").config();

const pool = require("./config/db");

const app = express();

const authRoutes = require('./routes/auth.routes');
app.use('/api/auth', authRoutes);


// Middleware
app.use(cors());
app.use(express.json());

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
