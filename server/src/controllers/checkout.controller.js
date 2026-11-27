const { PrismaClient } = require("../../generated/prisma");
const { PrismaPg } = require("@prisma/adapter-pg");

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

// POST /api/checkout — authenticated customer
exports.checkout = async (req, res) => {
  const { shippingAddress } = req.body;
  const customerId = req.user.id;

  if (!shippingAddress) {
    return res.status(400).json({
      status: "error",
      message: "shippingAddress is required",
    });
  }

  let cart;
  try {
    // 1. Load cart with items and products, inside the transaction
    const result = await prisma.$transaction(async (tx) => {
      cart = await tx.cart.findUnique({
        where: { customerId },
        include: {
          items: {
            include: {
              product: {
                include: {
                  category: { select: { id: true, name: true } },
                  sellerProfile: { select: { id: true, storeName: true } },
                },
              },
            },
          },
        },
      });

      if (!cart || cart.items.length === 0) {
        throw new CheckoutError("Cart is empty", 400);
      }

      // 2. Validate stock with conditional updates (atomic)
      for (const item of cart.items) {
        const product = item.product;

        if (product.status === "HIDDEN") {
          throw new CheckoutError(`Product "${product.name}" is no longer available`, 400);
        }

        if (item.quantity > product.stock) {
          throw new CheckoutError(
            `Only ${product.stock} units of "${product.name}" available (you requested ${item.quantity})`,
            400
          );
        }

        // Atomic stock decrement — fails if another order took the stock first
        const updated = await tx.product.updateMany({
          where: {
            id: product.id,
            stock: { gte: item.quantity },
          },
          data: {
            stock: { decrement: item.quantity },
          },
        });

        if (updated.count === 0) {
          throw new CheckoutError(
            `Stock for "${product.name}" changed during checkout. Please retry.`,
            409
          );
        }
      }

      // 3. Group items by seller
      const sellerGroups = {};
      for (const item of cart.items) {
        const sellerId = item.product.sellerProfile.id;
        if (!sellerGroups[sellerId]) {
          sellerGroups[sellerId] = [];
        }
        sellerGroups[sellerId].push(item);
      }

      // 4. Compute totals
      let totalAmount = 0;
      const sellerSubtotals = {};
      for (const [sellerId, items] of Object.entries(sellerGroups)) {
        let subtotal = 0;
        for (const item of items) {
          subtotal += item.product.price * item.quantity;
        }
        sellerSubtotals[sellerId] = subtotal;
        totalAmount += subtotal;
      }

      // 5. Create Order
      const order = await tx.order.create({
        data: {
          customerId,
          shippingAddress,
          totalAmount,
        },
      });

      // 6. Create one SellerOrder per seller, with order items
      const sellerOrdersData = [];
      for (const [sellerId, items] of Object.entries(sellerGroups)) {
        const sellerOrder = await tx.sellerOrder.create({
          data: {
            orderId: order.id,
            sellerId,
            subtotal: sellerSubtotals[sellerId],
            deliveryStatus: "PROCESSING",
            fundStatus: "HELD",
          },
        });

        // Create OrderItems for this seller
        const orderItemsData = [];
        for (const item of items) {
          const orderItem = await tx.orderItem.create({
            data: {
              sellerOrderId: sellerOrder.id,
              productId: item.productId,
              quantity: item.quantity,
              unitPrice: item.product.price,
            },
          });
          orderItemsData.push(orderItem);
        }

        sellerOrdersData.push({
          sellerOrder,
          orderItems: orderItemsData,
        });
      }

      // 7. Simulated payment
      const payment = await tx.payment.create({
        data: {
          orderId: order.id,
          method: "SIMULATED",
          transactionRef: `SIM-${Date.now()}-${Math.random().toString(36).substring(2, 10).toUpperCase()}`,
          amount: totalAmount,
          status: "PAID",
        },
      });

      // 8. Create HOLD fund transactions (one per seller order)
      const fundTransactionsData = [];
      for (const { sellerOrder, orderItems } of sellerOrdersData) {
        // HOLD at the seller-order level (covers all items for that seller)
        const holdTransaction = await tx.fundTransaction.create({
          data: {
            sellerOrderId: sellerOrder.id,
            paymentId: payment.id,
            orderItemId: null,
            amount: sellerOrder.subtotal,
            transactionType: "HOLD",
            createdBy: customerId,
            reason: "Funds held on checkout",
          },
        });
        fundTransactionsData.push(holdTransaction);
      }

      // 9. Clear the cart
      await tx.cartItem.deleteMany({
        where: { cartId: cart.id },
      });

      return {
        order,
        sellerOrders: sellerOrdersData.map((s) => ({
          ...s.sellerOrder,
          orderItems: s.orderItems,
        })),
        payment,
        fundTransactions: fundTransactionsData,
      };
    });

    res.status(201).json({
      status: "success",
      message: "Checkout completed successfully",
      order: result.order,
      sellerOrders: result.sellerOrders,
      payment: {
        id: result.payment.id,
        transactionRef: result.payment.transactionRef,
        amount: result.payment.amount,
        status: result.payment.status,
      },
    });
  } catch (err) {
    if (err instanceof CheckoutError) {
      return res.status(err.statusCode).json({
        status: "error",
        message: err.message,
      });
    }
    console.error("Checkout error:", err);
    return res.status(500).json({
      status: "error",
      message: "Internal server error",
    });
  }
};

class CheckoutError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}
