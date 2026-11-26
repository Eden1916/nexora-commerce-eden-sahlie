const { PrismaClient } = require("../../generated/prisma");
const { PrismaPg } = require("@prisma/adapter-pg");

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

// POST /api/products — approved seller only
exports.createProduct = async (req, res) => {
  try {
    const { name, description, price, stock, imageUrl, categoryId } = req.body;

    if (!name || !price || !categoryId) {
      return res.status(400).json({
        status: "error",
        message: "name, price and categoryId are required",
      });
    }

    // Check seller exists and is approved
    const sellerProfile = await prisma.sellerProfile.findUnique({
      where: { userId: req.user.id },
    });

    if (!sellerProfile) {
      return res.status(404).json({
        status: "error",
        message: "Seller profile not found",
      });
    }

    if (sellerProfile.approvalStatus !== "APPROVED") {
      return res.status(403).json({
        status: "error",
        message: "Seller account is not approved yet",
      });
    }

    // Check category exists
    const category = await prisma.category.findUnique({
      where: { id: categoryId },
    });

    if (!category) {
      return res.status(404).json({
        status: "error",
        message: "Category not found",
      });
    }

    const product = await prisma.product.create({
      data: {
        name,
        description: description || null,
        price: parseFloat(price),
        stock: stock ? parseInt(stock) : 0,
        imageUrl: imageUrl || null,
        categoryId,
        sellerId: sellerProfile.id,
      },
      include: {
        category: true,
        sellerProfile: { select: { storeName: true } },
      },
    });

    res.status(201).json({ status: "success", product });
  } catch (err) {
    console.error("Create product error:", err);
    res.status(500).json({ status: "error", message: "Internal server error" });
  }
};

// GET /api/products — public, supports ?search= and ?categoryId=
exports.getProducts = async (req, res) => {
  try {
    const { search, categoryId } = req.query;

    const where = { status: "ACTIVE" };

    if (search) {
      where.name = { contains: search, mode: "insensitive" };
    }

    if (categoryId) {
      where.categoryId = categoryId;
    }

    const products = await prisma.product.findMany({
      where,
      include: {
        category: { select: { id: true, name: true } },
        sellerProfile: { select: { storeName: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    res.json({ status: "success", products });
  } catch (err) {
    console.error("Get products error:", err);
    res.status(500).json({ status: "error", message: "Internal server error" });
  }
};

// GET /api/products/:id — public
exports.getProductById = async (req, res) => {
  try {
    const product = await prisma.product.findUnique({
      where: { id: req.params.id },
      include: {
        category: { select: { id: true, name: true } },
        sellerProfile: { select: { storeName: true } },
      },
    });

    if (!product) {
      return res.status(404).json({ status: "error", message: "Product not found" });
    }

    res.json({ status: "success", product });
  } catch (err) {
    console.error("Get product error:", err);
    res.status(500).json({ status: "error", message: "Internal server error" });
  }
};

// PATCH /api/products/:id — authenticated seller, own products only
exports.updateProduct = async (req, res) => {
  try {
    const sellerProfile = await prisma.sellerProfile.findUnique({
      where: { userId: req.user.id },
    });

    if (!sellerProfile) {
      return res.status(404).json({ status: "error", message: "Seller profile not found" });
    }

    // Verify product belongs to this seller
    const existing = await prisma.product.findUnique({
      where: { id: req.params.id },
    });

    if (!existing) {
      return res.status(404).json({ status: "error", message: "Product not found" });
    }

    if (existing.sellerId !== sellerProfile.id) {
      return res.status(403).json({ status: "error", message: "You can only update your own products" });
    }

    const { name, description, price, stock, imageUrl, categoryId, status } = req.body;

    const updated = await prisma.product.update({
      where: { id: req.params.id },
      data: {
        ...(name && { name }),
        ...(description !== undefined && { description }),
        ...(price !== undefined && { price: parseFloat(price) }),
        ...(stock !== undefined && { stock: parseInt(stock) }),
        ...(imageUrl !== undefined && { imageUrl }),
        ...(categoryId && { categoryId }),
        ...(status && { status }),
      },
      include: {
        category: { select: { id: true, name: true } },
        sellerProfile: { select: { storeName: true } },
      },
    });

    res.json({ status: "success", product: updated });
  } catch (err) {
    console.error("Update product error:", err);
    res.status(500).json({ status: "error", message: "Internal server error" });
  }
};

// DELETE /api/products/:id — authenticated seller, own products only
exports.deleteProduct = async (req, res) => {
  try {
    const sellerProfile = await prisma.sellerProfile.findUnique({
      where: { userId: req.user.id },
    });

    if (!sellerProfile) {
      return res.status(404).json({ status: "error", message: "Seller profile not found" });
    }

    const existing = await prisma.product.findUnique({
      where: { id: req.params.id },
    });

    if (!existing) {
      return res.status(404).json({ status: "error", message: "Product not found" });
    }

    if (existing.sellerId !== sellerProfile.id) {
      return res.status(403).json({ status: "error", message: "You can only delete your own products" });
    }

    await prisma.product.delete({ where: { id: req.params.id } });

    res.json({ status: "success", message: "Product deleted" });
  } catch (err) {
    console.error("Delete product error:", err);
    res.status(500).json({ status: "error", message: "Internal server error" });
  }
};
