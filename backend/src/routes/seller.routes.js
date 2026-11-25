const router = require("express").Router();
const authenticate = require("../middleware/auth.middleware");
const requireRole = require("../middleware/role.middleware");
const {
  apply,
  getMyProfile,
  review,
  listPending,
} = require("../controllers/seller.controller");

// Any authenticated user can apply or view their own profile
router.post("/apply", authenticate, apply);
router.get("/profile", authenticate, getMyProfile);

// Admin only
router.get("/pending", authenticate, requireRole("ADMIN"), listPending);
router.patch("/pending/:id", authenticate, requireRole("ADMIN"), review);

module.exports = router;
