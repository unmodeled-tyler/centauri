import { Request, Response, NextFunction } from "express";
import { randomUUID } from "crypto";

export function errorHandler(
  err: Error & { status?: number; requestId?: string },
  req: Request,
  res: Response,
  _next: NextFunction,
) {
  const requestId = (req.headers["x-request-id"] as string) ?? randomUUID();
  const status = err.status ?? 500;
  const message = status === 500 ? "Internal server error" : err.message;
  const errorEntry = {
    level: "error" as const,
    message: err.message,
    timestamp: new Date().toISOString(),
    requestId,
    method: req.method,
    path: req.path,
    status,
    stack: status === 500 ? undefined : err.stack,
  };
  if (status === 500) {
    console.error(JSON.stringify(errorEntry));
  } else {
    console.warn(JSON.stringify(errorEntry));
  }
  if (res.headersSent) {
    return;
  }
  res.status(status).json({ error: message, requestId });
}
