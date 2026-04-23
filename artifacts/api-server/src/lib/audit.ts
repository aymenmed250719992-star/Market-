import type { Request } from "express";
import { CollectionCache } from "./cache";
import { usersCache } from "./cache";
import { nextId } from "./firebase";

export const auditCache = new CollectionCache("audit_logs");

export type AuditEntry = {
  action: string;
  entity: string;
  entityId?: string | number | null;
  details?: Record<string, any> | null;
  userId?: number | null;
  userName?: string | null;
  userRole?: string | null;
  ip?: string | null;
  createdAt: Date;
};

export async function getRequestUser(req: Request): Promise<{ id: number; data: any } | null> {
  const token = (req as any).cookies?.session ?? req.headers.authorization?.replace("Bearer ", "");
  if (!token) return null;
  try {
    const payload = JSON.parse(Buffer.from(token, "base64").toString());
    const id = Number(payload.id);
    const data = await usersCache.get(id);
    if (!data) return null;
    return { id, data };
  } catch {
    return null;
  }
}

export async function logAudit(
  req: Request | null,
  action: string,
  entity: string,
  entityId?: string | number | null,
  details?: Record<string, any> | null,
): Promise<void> {
  try {
    const user = req ? await getRequestUser(req) : null;
    const id = await nextId("audit_logs");
    const entry: AuditEntry = {
      action,
      entity,
      entityId: entityId ?? null,
      details: details ?? null,
      userId: user?.id ?? null,
      userName: user?.data?.name ?? null,
      userRole: user?.data?.role ?? null,
      ip: req?.ip ?? null,
      createdAt: new Date(),
    };
    await auditCache.set(id, entry);
  } catch (e: any) {
    console.error("[audit] failed:", e?.message ?? e);
  }
}
