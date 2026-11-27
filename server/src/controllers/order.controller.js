const { PrismaClient } = require("../../generated/prisma");
const { PrismaPg } = require("@prisma/adapter-pg");

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

// ─── CUSTOMER ────────────────────────────────────────────────────────────────

// GET /api/orders — customer views their own orders
exports.getMyOrders = async (req, res) => {
  try {
    const orders = await prisma.order.findMany({
      where: { customerId: req.user.id },
      orderBy: { createdAt: "desc" },
      include: {
        payment: {
          select: {
            transactionRef: true,
            amount: true,
            status: true,
            paidAt: true,
          },
        },
        sellerOrders: {
          include: {
            sellerProfile: { select: { storeName: true } },
            orderItems: {
              include: {
                product: {
                  select: { id: true, name: true, imageUrl: true },
                },
              },
            },
          },
        },
      },
    });

    res.json({ status: "success", orders });
  } catch (err) {
    console.error("Get orders error:", err);
    res.status(500).json({ status: "error", message: "Internal server error" });
  }
};

// GET /api/orders/:orderId — customer views a single order
exports.getOrderById = async (req, res) => {
  try {
    const order = await prisma.order.findUnique({
      where: { id: req.params.orderId },
      include: {
        payment: true,
        sellerOrders: {
          include: {
            sellerProfile: { select: { storeName: true } },
            orderItems: {
              include: {
                product: {
                  select: { id: true, name: true, imageUrl: true, price: true },
                },
              },
            },
          },
        },
      },
    });

    if (!order) {
      return res.status(404).json({ status: "error", message: "Order not found" });
    }

    // Customers can only see their own orders
    if (order.customerId !== req.user.id) {
      return res.status(403).json({ status: "error", message: "Forbidden" });
    }

    res.json({ status: "success", order });
  } catch (err) {
    console.error("Get order error:", err);
    res.status(500).json({ status: "error", message: "Internal server error" });
  }
};

// POST /api/orders/seller-orders/:sellerOrderId/confirm — customer confirms receipt
// Transitions fund status from HELD → RELEASED for the seller order
exports.confirmReceipt = async (req, res) => {
  try {
    const { sellerOrderId } = req.params;

    const sellerOrder = await prisma.sellerOrder.findUnique({
      where: { id: sellerOrderId },
      include: { order: true },
    });

    if (!sellerOrder) {
      return res.status(404).json({ status: "error", message: "Seller order not found" });
    }

    // Must belong to this customer
    if (sellerOrder.order.customerId !== req.user.id) {
      return res.status(403).json({ status: "error", message: "Forbidden" });
    }

    // Can only confirm if SHIPPED or DELIVERED
    if (!["SHIPPED", "DELIVERED"].includes(sellerOrder.deliveryStatus)) {
      return res.status(400).json({
        status: "error",
        message: "Can only confirm receipt when the order has been shipped or delivered",
      });
    }

    // Funds must still be HELD (not already released or refunded)
    if (sellerOrder.fundStatus !== "HELD") {
      return res.status(400).json({
        status: "error",
        message: `Funds are already ${sellerOrder.fundStatus.toLowerCase()}`,
      });
    }

    // Cannot confirm if an issue has been reported
    if (sellerOrder.issueReportedAt !== null) {
      return res.status(400).json({
        status: "error",
        message: "Cannot confirm receipt — an issue has been reported on this order",
      });
    }

    // Get the payment for this order
    const payment = await prisma.payment.findUnique({
      where: { orderId: sellerOrder.orderId },
    });

    // Run release inside a transaction
    const result = await prisma.$transaction(async (tx) => {
      const updatedSellerOrder = await tx.sellerOrder.update({
        where: { id: sellerOrderId },
        data: {
          fundStatus: "RELEASED",
          releasedAmount: sellerOrder.subtotal,
          deliveredAt: sellerOrder.deliveredAt ?? new Date(),
        },
      });

      const fundTransaction = await tx.fundTransaction.create({
        data: {
          sellerOrderId,
          paymentId: payment.id,
          orderItemId: null,
          amount: sellerOrder.subtotal,
          transactionType: "RELEASE",
          createdBy: req.user.id,
          reason: "Customer confirmed receipt",
        },
      });

      return { updatedSellerOrder, fundTransaction };
    });

    res.json({
      status: "success",
      message: "Receipt confirmed — funds released to seller",
      sellerOrder: result.updatedSellerOrder,
      fundTransaction: result.fundTransaction,
    });
  } catch (err) {
    console.error("Confirm receipt error:", err);
    res.status(500).json({ status: "error", message: "Internal server error" });
  }
};

// ─── SELLER ──────────────────────────────────────────────────────────────────

// GET /api/orders/seller — seller views their own seller orders
exports.getMySellerOrders = async (req, res) => {
  try {
    const sellerProfile = await prisma.sellerProfile.findUnique({
      where: { userId: req.user.id },
    });

    if (!sellerProfile) {
      return res.status(404).json({ status: "error", message: "Seller profile not found" });
    }

    const sellerOrders = await prisma.sellerOrder.findMany({
      where: { sellerId: sellerProfile.id },
      orderBy: { order: { createdAt: "desc" } },
      include: {
        order: {
          select: {
            id: true,
            shippingAddress: true,
            createdAt: true,
            customer: { select: { name: true, email: true } },
          },
        },
        orderItems: {
          include: {
            product: { select: { id: true, name: true, imageUrl: true } },
          },
        },
      },
    });

    res.json({ status: "success", sellerOrders });
  } catch (err) {
    console.error("Get seller orders error:", err);
    res.status(500).json({ status: "error", message: "Internal server error" });
  }
};

// PATCH /api/orders/seller-orders/:sellerOrderId/status — seller updates delivery status
exports.updateDeliveryStatus = async (req, res) => {
  try {
    const { sellerOrderId } = req.params;
    const { deliveryStatus } = req.body;

    const allowedStatuses = ["SHIPPED", "DELIVERED"];
    if (!allowedStatuses.includes(deliveryStatus)) {
      return res.status(400).json({
        status: "error",
        message: "deliveryStatus must be SHIPPED or DELIVERED",
      });
    }

    const sellerProfile = await prisma.sellerProfile.findUnique({
      where: { userId: req.user.id },
    });

    if (!sellerProfile) {
      return res.status(404).json({ status: "error", message: "Seller profile not found" });
    }

    const sellerOrder = await prisma.sellerOrder.findUnique({
      where: { id: sellerOrderId },
    });

    if (!sellerOrder) {
      return res.status(404).json({ status: "error", message: "Seller order not found" });
    }

    // Must be this seller's order
    if (sellerOrder.sellerId !== sellerProfile.id) {
      return res.status(403).json({ status: "error", message: "Forbidden" });
    }

    // Enforce progression: PROCESSING → SHIPPED → DELIVERED
    const statusRank = { PROCESSING: 0, SHIPPED: 1, DELIVERED: 2, CANCELLED: -1 };
    if (statusRank[deliveryStatus] <= statusRank[sellerOrder.deliveryStatus]) {
      return res.status(400).json({
        status: "error",
        message: `Cannot move from ${sellerOrder.deliveryStatus} to ${deliveryStatus}`,
      });
    }

    const updated = await prisma.sellerOrder.update({
      where: { id: sellerOrderId },
      data: {
        deliveryStatus,
        ...(deliveryStatus === "SHIPPED" && { shippedAt: new Date() }),
        ...(deliveryStatus === "DELIVERED" && { deliveredAt: new Date() }),
      },
    });

    res.json({ status: "success", sellerOrder: updated });
  } catch (err) {
    console.error("Update delivery status error:", err);
    res.status(500).json({ status: "error", message: "Internal server error" });
  }
};
