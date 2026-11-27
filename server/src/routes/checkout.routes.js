const router = require("express").Router();
const authenticate = require("../middleware/auth.middleware");
const requireRole = require("../middleware/role.middleware");
const { checkout } = require("../controllers/checkout.controller");

// POST /api/checkout — customer only
router.post("/", authenticate, requireRole("CUSTOMER"), checkout);

module.exports = router;
