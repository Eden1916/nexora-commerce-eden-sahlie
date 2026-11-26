const router = require("express").Router();
const authenticate = require("../middleware/auth.middleware");
const requireRole = require("../middleware/role.middleware");
const {
  createProduct,
  getProducts,
  getProductById,
  updateProduct,
  deleteProduct,
} = require("../controllers/product.controller");

// Public routes — no auth required
router.get("/", getProducts);
router.get("/:id", getProductById);

// Seller-only routes
router.post("/", authenticate, requireRole("SELLER"), createProduct);
router.patch("/:id", authenticate, requireRole("SELLER"), updateProduct);
router.delete("/:id", authenticate, requireRole("SELLER"), deleteProduct);

module.exports = router;
