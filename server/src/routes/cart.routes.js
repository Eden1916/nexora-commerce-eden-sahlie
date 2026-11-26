const router = require("express").Router();
const authenticate = require("../middleware/auth.middleware");
const { getCart, addItem, updateItem, removeItem } = require("../controllers/cart.controller");

// All cart routes require authentication
router.get("/", authenticate, getCart);
router.post("/items", authenticate, addItem);
router.patch("/items/:itemId", authenticate, updateItem);
router.delete("/items/:itemId", authenticate, removeItem);

module.exports = router;
