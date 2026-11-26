const { PrismaClient } = require("../../generated/prisma");
const { PrismaPg } = require("@prisma/adapter-pg");

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });


exports.apply = async (req, res) => {
  try {
    const { storeName, description } = req.body;

    if (!storeName) {
      return res.status(400).json({ status: "error", message: "storeName is required" });
    }

    const existing = await prisma.sellerProfile.findUnique({
      where: { userId: req.user.id },
    });
    if (existing) {
      return res.status(409).json({ status: "error", message: "Seller profile already exists" });
    }

    const profile = await prisma.sellerProfile.create({
      data: {
        userId: req.user.id,
        storeName,
        description: description || null,
      },
    });

    // Update role to SELLER (still needs admin approval)
    await prisma.user.update({
      where: { id: req.user.id },
      data: { role: "SELLER" },
    });

    res.status(201).json({ status: "success", sellerProfile: profile });
  } catch (err) {
    console.error("Seller apply error:", err);
    res.status(500).json({ status: "error", message: "Internal server error" });
  }
};

exports.getMyProfile = async (req, res) => {
  try {
    const profile = await prisma.sellerProfile.findUnique({
      where: { userId: req.user.id },
    });

    if (!profile) {
      return res.status(404).json({ status: "error", message: "No seller profile found" });
    }

    res.json({ status: "success", sellerProfile: profile });
  } catch (err) {
    console.error("Get profile error:", err);
    res.status(500).json({ status: "error", message: "Internal server error" });
  }
};

exports.review = async (req, res) => {
  try {
    const { decision } = req.body; // "APPROVED" or "REJECTED"
    const sellerId = req.params.id;

    if (!["APPROVED", "REJECTED"].includes(decision)) {
      return res.status(400).json({ status: "error", message: "decision must be APPROVED or REJECTED" });
    }

    const profile = await prisma.sellerProfile.update({
      where: { id: sellerId },
      data: {
        approvalStatus: decision,
        approvedAt: decision === "APPROVED" ? new Date() : null,
      },
    });

    res.json({ status: "success", sellerProfile: profile });
  } catch (err) {
    console.error("Review seller error:", err);
    res.status(500).json({ status: "error", message: "Internal server error" });
  }
};

exports.listPending = async (req, res) => {
  try {
    const pending = await prisma.sellerProfile.findMany({
      where: { approvalStatus: "PENDING" },
      include: { user: { select: { id: true, name: true, email: true } } },
    });

    res.json({ status: "success", pendingSellers: pending });
  } catch (err) {
    console.error("List pending sellers error:", err);
    res.status(500).json({ status: "error", message: "Internal server error" });
  }
};
