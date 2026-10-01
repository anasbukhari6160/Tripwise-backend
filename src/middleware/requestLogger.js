import crypto from "node:crypto";

export function requestLogger(req, res, next) {
  const startedAt = Date.now();
  req.requestId = crypto.randomUUID();
  res.setHeader("X-Request-Id", req.requestId);
  res.on("finish", () => {
    console.info("[REQUEST]", {
      requestId: req.requestId,
      method: req.method,
      status: res.statusCode,
      durationMs: Date.now() - startedAt,
    });
  });
  res.on("close", () => {
    if (!res.writableEnded) {
      console.warn("[REQUEST ABORTED]", { requestId: req.requestId });
    }
  });
  next();
}
