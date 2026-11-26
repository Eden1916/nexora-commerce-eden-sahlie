const router = require("express").Router();
const { PrismaClient } = require("../../generated/prisma");
const { PrismaPg } = require("@prisma/adapter-pg");

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

// GET /api/categories — public, used to populate category dropdowns
router.get("/", async (req, res) => {
  try {
    const categories = await prisma.category.findMany({
      orderBy: { name: "asc" },
    });
    res.json({ status: "success", categories });
  } catch (err) {
    console.error("Get categories error:", err);
    res.status(500).json({ status: "error", message: "Internal server error" });
  }
});

module.exports = router;
