export const ok = (res, data, status = 200, meta) =>
  res.status(status).json({ success: true, data, ...(meta ? { meta } : {}) });
