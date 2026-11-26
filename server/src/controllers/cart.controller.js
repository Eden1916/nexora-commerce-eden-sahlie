const { PrismaClient } = require("../../generated/prisma");
const { PrismaPg } = require("@prisma/adapter-pg");

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

// Helper: fetch the full cart with items and product details
async function getCartWithItems(customerId) {
  return prisma.cart.findUnique({
    where: { customerId },
    include: {
      items: {
        include: {
          product: {
            select: {
              id: true,
              name: true,
              price: true,
              imageUrl: true,
              stock: true,
              sellerProfile: { select: { storeName: true } },
            },
          },
        },
      },
    },
  });
}

// GET /api/cart
exports.getCart = async (req, res) => {
  try {
    const cart = await getCartWithItems(req.user.id);

    if (!cart) {
      return res.json({ status: "success", cart: { items: [] } });
    }

    res.json({ status: "success", cart });
  } catch (err) {
    console.error("Get cart error:", err);
    res.status(500).json({ status: "error", message: "Internal server error" });
  }
};

// POST /api/cart/items
exports.addItem = async (req, res) => {
  try {
    const { productId, quantity } = req.body;

    if (!productId || !quantity || quantity < 1) {
      return res.status(400).json({
        status: "error",
        message: "productId and a quantity of at least 1 are required",
      });
    }

    // Check product exists and has enough stock
    const product = await prisma.product.findUnique({
      where: { id: productId },
    });

    if (!product || product.status === "HIDDEN") {
      return res.status(404).json({ status: "error", message: "Product not found" });
    }

    if (quantity > product.stock) {
      return res.status(400).json({
        status: "error",
        message: `Only ${product.stock} units available`,
      });
    }

    // Get or create the cart
    let cart = await prisma.cart.findUnique({
      where: { customerId: req.user.id },
    });

    if (!cart) {
      cart = await prisma.cart.create({
        data: { customerId: req.user.id },
      });
    }

    // Check if item already exists in cart
    const existingItem = await prisma.cartItem.findUnique({
      where: { cartId_productId: { cartId: cart.id, productId } },
    });

    if (existingItem) {
      const newQuantity = existingItem.quantity + quantity;

      if (newQuantity > product.stock) {
        return res.status(400).json({
          status: "error",
          message: `Only ${product.stock} units available (you already have ${existingItem.quantity} in cart)`,
        });
      }

      await prisma.cartItem.update({
        where: { id: existingItem.id },
        data: { quantity: newQuantity },
      });
    } else {
      await prisma.cartItem.create({
        data: { cartId: cart.id, productId, quantity },
      });
    }

    const updatedCart = await getCartWithItems(req.user.id);
    res.status(201).json({ status: "success", cart: updatedCart });
  } catch (err) {
    console.error("Add item error:", err);
    res.status(500).json({ status: "error", message: "Internal server error" });
  }
};

// PATCH /api/cart/items/:itemId
exports.updateItem = async (req, res) => {
  try {
    const { quantity } = req.body;

    if (quantity === undefined || quantity < 0) {
      return res.status(400).json({
        status: "error",
        message: "quantity is required and must be 0 or more",
      });
    }

    // Verify item belongs to this customer's cart
    const cart = await prisma.cart.findUnique({
      where: { customerId: req.user.id },
    });

    if (!cart) {
      return res.status(404).json({ status: "error", message: "Cart not found" });
    }

    const item = await prisma.cartItem.findUnique({
      where: { id: req.params.itemId },
    });

    if (!item || item.cartId !== cart.id) {
      return res.status(404).json({ status: "error", message: "Cart item not found" });
    }

    // quantity 0 means remove the item
    if (quantity === 0) {
      await prisma.cartItem.delete({ where: { id: item.id } });
    } else {
      // Validate against stock
      const product = await prisma.product.findUnique({
        where: { id: item.productId },
      });

      if (quantity > product.stock) {
        return res.status(400).json({
          status: "error",
          message: `Only ${product.stock} units available`,
        });
      }

      await prisma.cartItem.update({
        where: { id: item.id },
        data: { quantity },
      });
    }

    const updatedCart = await getCartWithItems(req.user.id);
    res.json({ status: "success", cart: updatedCart });
  } catch (err) {
    console.error("Update item error:", err);
    res.status(500).json({ status: "error", message: "Internal server error" });
  }
};

// DELETE /api/cart/items/:itemId
exports.removeItem = async (req, res) => {
  try {
    const cart = await prisma.cart.findUnique({
      where: { customerId: req.user.id },
    });

    if (!cart) {
      return res.status(404).json({ status: "error", message: "Cart not found" });
    }

    const item = await prisma.cartItem.findUnique({
      where: { id: req.params.itemId },
    });

    if (!item || item.cartId !== cart.id) {
      return res.status(404).json({ status: "error", message: "Cart item not found" });
    }

    await prisma.cartItem.delete({ where: { id: item.id } });

    const updatedCart = await getCartWithItems(req.user.id);
    res.json({ status: "success", cart: updatedCart });
  } catch (err) {
    console.error("Remove item error:", err);
    res.status(500).json({ status: "error", message: "Internal server error" });
  }
};
