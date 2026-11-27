const router = require("express").Router();
const authenticate = require("../middleware/auth.middleware");
const requireRole = require("../middleware/role.middleware");
const {
  getMyOrders,
  getOrderById,
  confirmReceipt,
  getMySellerOrders,
  updateDeliveryStatus,
} = require("../controllers/order.controller");

// ─── Customer routes ───
router.get("/my", authenticate, requireRole("CUSTOMER"), getMyOrders);
router.get("/my/:orderId", authenticate, requireRole("CUSTOMER"), getOrderById);
router.post(
  "/seller-orders/:sellerOrderId/confirm",
  authenticate,
  requireRole("CUSTOMER"),
  confirmReceipt
);

// ─── Seller routes ───
router.get("/seller", authenticate, requireRole("SELLER"), getMySellerOrders);
router.patch(
  "/seller-orders/:sellerOrderId/status",
  authenticate,
  requireRole("SELLER"),
  updateDeliveryStatus
);

module.exports = router;
