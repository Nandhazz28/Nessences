import { Order } from "../../models/Order.js";
import { User } from "../../models/User.js";
import { Payment } from "../../models/Payment.js";
import { Refund } from "../../models/Refund.js";
import { PAID } from "../admin/dashboard.js";

const TZ = "Asia/Kolkata";
const FMT = { day: "%Y-%m-%d", week: "%G-W%V", month: "%Y-%m" };

export async function analytics({ from, to, unit }) {
  const fmt = FMT[unit];
  const range = { $gte: from, $lte: to };
  const paid = { status: { $in: PAID }, paidAt: range };
  const [
    sales,
    regs,
    categories,
    products,
    payments,
    coupons,
    refunds,
    totals,
  ] = await Promise.all([
    Order.aggregate([
      { $match: paid },
      {
        $group: {
          _id: {
            $dateToString: { format: fmt, date: "$paidAt", timezone: TZ },
          },
          revenue: { $sum: "$totals.total" },
          orders: { $sum: 1 },
          units: { $sum: { $sum: "$items.qty" } },
        },
      },
      { $sort: { _id: 1 } },
    ]),
    User.aggregate([
      { $match: { createdAt: range, status: { $ne: "deleted" } } },
      {
        $group: {
          _id: {
            $dateToString: { format: fmt, date: "$createdAt", timezone: TZ },
          },
          customers: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]),
    Order.aggregate([
      { $match: paid },
      { $unwind: "$items" },
      {
        $lookup: {
          from: "products",
          localField: "items.product",
          foreignField: "_id",
          as: "p",
        },
      },
      { $unwind: "$p" },
      {
        $lookup: {
          from: "categories",
          localField: "p.category",
          foreignField: "_id",
          as: "c",
        },
      },
      { $unwind: "$c" },
      {
        $group: {
          _id: "$c.name",
          revenue: { $sum: "$items.lineTotal" },
          units: { $sum: "$items.qty" },
        },
      },
      { $sort: { revenue: -1 } },
    ]),
    Order.aggregate([
      { $match: paid },
      { $unwind: "$items" },
      {
        $group: {
          _id: "$items.product",
          name: { $first: "$items.name" },
          units: { $sum: "$items.qty" },
          revenue: { $sum: "$items.lineTotal" },
        },
      },
      { $sort: { units: -1 } },
      { $limit: 10 },
    ]),
    Payment.aggregate([
      {
        $match: { status: { $in: ["captured", "refunded"] }, updatedAt: range },
      },
      {
        $group: {
          _id: { $ifNull: ["$method", "unknown"] },
          count: { $sum: 1 },
          amount: { $sum: "$amount" },
        },
      },
      { $sort: { amount: -1 } },
    ]),
    Order.aggregate([
      { $match: { ...paid, "coupon.code": { $exists: true } } },
      {
        $group: {
          _id: "$coupon.code",
          uses: { $sum: 1 },
          discount: { $sum: "$coupon.discount" },
        },
      },
      { $sort: { uses: -1 } },
    ]),
    Refund.aggregate([
      { $match: { status: "processed", processedAt: range } },
      {
        $group: { _id: null, amount: { $sum: "$amount" }, count: { $sum: 1 } },
      },
    ]),
    Order.aggregate([
      { $match: paid },
      {
        $group: {
          _id: null,
          revenue: { $sum: "$totals.total" },
          orders: { $sum: 1 },
          discount: { $sum: "$totals.discount" },
        },
      },
    ]),
  ]);
  const t = totals[0] ?? { revenue: 0, orders: 0, discount: 0 };
  return {
    range: { from, to, unit },
    summary: {
      revenue: t.revenue,
      orders: t.orders,
      averageOrderValue: t.orders ? Math.round(t.revenue / t.orders) : 0,
      discountsGiven: t.discount,
      refunded: refunds[0]?.amount ?? 0,
      refundCount: refunds[0]?.count ?? 0,
    },
    sales: sales.map((s) => ({
      period: s._id,
      revenue: s.revenue,
      orders: s.orders,
      units: s.units,
    })),
    customerAcquisition: regs.map((r) => ({
      period: r._id,
      customers: r.customers,
    })),
    categories: categories.map((c) => ({
      category: c._id,
      revenue: c.revenue,
      units: c.units,
    })),
    topProducts: products.map((p) => ({
      productId: p._id,
      name: p.name,
      units: p.units,
      revenue: p.revenue,
    })),
    paymentMethods: payments.map((p) => ({
      method: p._id,
      count: p.count,
      amount: p.amount,
    })),
    coupons: coupons.map((c) => ({
      code: c._id,
      uses: c.uses,
      discount: c.discount,
    })),
    traffic: {
      configured: false,
      message:
        "No web analytics integration is connected, so visitor and traffic-source data is unavailable.",
    },
  };
}
