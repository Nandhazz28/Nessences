import { NewsletterSubscriber } from "../../models/NewsletterSubscriber.js";
import { ApiError } from "../../utils/ApiError.js";
import { env } from "../../config/env.js";
import { randomToken, sha256 } from "../../utils/tokens.js";
import { sendEmail } from "../emailService.js";

export async function subscribe(email, source = "footer") {
  const normalizedEmail = String(email ?? "")
    .trim()
    .toLowerCase();

  if (!normalizedEmail) {
    throw ApiError.badRequest("INVALID_EMAIL", "Email is required");
  }

  let sub = await NewsletterSubscriber.findOne({
    email: normalizedEmail,
  }).select("+unsubscribeToken");

  if (sub?.status === "subscribed") {
    return;
  }

  if (!sub) {
    sub = new NewsletterSubscriber({
      email: normalizedEmail,
      source,
    });
  }

  const token = randomToken(32);

  sub.status = "pending";
  sub.confirmTokenHash = sha256(token);
  sub.unsubscribeToken ??= randomToken(24);

  await sub.save();

  await sendEmail({
    to: normalizedEmail,
    template: "newsletterConfirm",
    data: {
      link: `${env.CLIENT_URL}/newsletter/confirm?token=${encodeURIComponent(token)}`,
    },
  });
}

export async function confirm(token) {
  if (!token) {
    throw ApiError.badRequest(
      "INVALID_TOKEN",
      "A confirmation token is required",
    );
  }

  const sub = await NewsletterSubscriber.findOneAndUpdate(
    {
      confirmTokenHash: sha256(token),
      status: "pending",
    },
    {
      $set: {
        status: "subscribed",
        subscribedAt: new Date(),
      },
      $unset: {
        confirmTokenHash: 1,
      },
    },
    { new: true },
  ).select("+unsubscribeToken");

  if (!sub) {
    throw ApiError.badRequest(
      "INVALID_TOKEN",
      "This confirmation link is invalid or has already been used",
    );
  }

  await sendEmail({
    to: sub.email,
    template: "newsletterWelcome",
    data: {
      link: `${env.CLIENT_URL}/newsletter/unsubscribe?token=${encodeURIComponent(sub.unsubscribeToken)}`,
    },
  });
}

export async function unsubscribe(token) {
  if (!token) {
    throw ApiError.badRequest(
      "INVALID_TOKEN",
      "An unsubscribe token is required",
    );
  }

  const sub = await NewsletterSubscriber.findOneAndUpdate(
    { unsubscribeToken: token },
    {
      $set: {
        status: "unsubscribed",
        unsubscribedAt: new Date(),
      },
    },
    { new: true },
  );

  if (!sub) {
    throw ApiError.badRequest(
      "INVALID_TOKEN",
      "This unsubscribe link is not valid",
    );
  }
}

const csvCell = (value) => {
  let s = String(value ?? "");

  // Prevent spreadsheet formula injection.
  if (/^[=+\-@\t\r]/.test(s)) {
    s = `'${s}`;
  }

  return `"${s.replace(/"/g, '""')}"`;
};

export const toCsv = (rows) =>
  [
    "email,status,source,subscribed_at",
    ...rows.map((row) =>
      [row.email, row.status, row.source, row.subscribedAt?.toISOString() ?? ""]
        .map(csvCell)
        .join(","),
    ),
  ].join("\n");

export async function adminList({ status, page, limit }) {
  const filter = status ? { status } : {};

  const [rows, total, counts] = await Promise.all([
    NewsletterSubscriber.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),

    NewsletterSubscriber.countDocuments(filter),

    NewsletterSubscriber.aggregate([
      {
        $group: {
          _id: "$status",
          n: { $sum: 1 },
        },
      },
    ]),
  ]);

  return {
    items: rows.map((row) => ({
      id: row._id,
      email: row.email,
      status: row.status,
      source: row.source,
      subscribedAt: row.subscribedAt,
    })),

    pagination: {
      page,
      limit,
      total,
      pages: Math.max(1, Math.ceil(total / limit)),
    },

    counts: Object.fromEntries(counts.map((item) => [item._id, item.n])),
  };
}

export const exportSubscribed = () =>
  NewsletterSubscriber.find({ status: "subscribed" })
    .sort({ subscribedAt: -1 })
    .limit(100000)
    .lean();
