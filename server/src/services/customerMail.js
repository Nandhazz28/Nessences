import { User } from "../models/User.js";
import { sendEmail } from "./emailService.js";
import { logger } from "../config/logger.js";

export async function mailCustomer(
  userId,
  template,
  data = {},
  { optionalNotice = false } = {},
) {
  try {
    const u = await User.findById(userId)
      .select("email name preferences")
      .lean();
    if (!u) return { accepted: false, reason: "NO_RECIPIENT" };
    if (optionalNotice && u.preferences?.orderUpdates === false)
      return { accepted: false, reason: "OPTED_OUT" };
    return await sendEmail({
      to: u.email,
      template,
      data: { name: u.name, ...data },
    });
  } catch (err) {
    logger.error(
      { template, err: err?.message },
      "customer email could not be built or sent",
    );
    return { accepted: false, reason: "ERROR" };
  }
}
