import { canonical, sha256 } from "../canonical.ts";
import { invariant } from "../errors.ts";
import type { A6GPRuntime } from "../runtime.ts";
import { authorize, authorizeEffect, resourceScope, revision, type TaskAccess } from "./access.ts";
import { MODALITIES, type Modality } from "./resources.ts";

export interface DataCapture {
  payloadBase64: string;
  modality: Modality;
  retentionUntil: string;
}
export interface DataRecord {
  scope: string;
  tenant: string;
  contractId: string;
  owner: string;
  modality: Modality;
  revision: number;
  state: "CAPTURED" | "PROCESSED" | "STORED" | "SHARED" | "DELETED";
  retentionUntil: string;
  contentHash: string;
  lineage: string[];
  readers: string[];
  bytes: number;
}

/** Bounded in-memory data-plane prototype; large objects belong in an external object store. */
export class DataService {
  private readonly runtime: A6GPRuntime;
  private readonly records = new Map<string, DataRecord>();
  private readonly content = new Map<string, Buffer>();
  private totalBytes = 0;
  readonly maxObjectBytes = 1_048_576;
  readonly maxTotalBytes = 16_777_216;

  constructor(runtime: A6GPRuntime) { this.runtime = runtime; }

  private expire(now: Date): void {
    for (const record of this.records.values()) if (record.state !== "DELETED" && Date.parse(record.retentionUntil) <= now.getTime()) {
      this.totalBytes -= this.content.get(record.scope)?.length ?? 0;
      this.content.delete(record.scope);
      record.state = "DELETED"; record.bytes = 0; record.readers = []; record.revision += 1;
    }
  }

  capture(access: TaskAccess, scope: string, input: DataCapture, now: Date): DataRecord {
    authorizeEffect(this.runtime, access, scope, "acn.data.capture", input, now);
    resourceScope(access.tenant, scope, "data");
    this.expire(now);
    invariant(!this.records.has(scope), "INVALID_INPUT", "data identity already used");
    invariant(MODALITIES.includes(input.modality), "INVALID_INPUT", "unsupported modality");
    invariant(Date.parse(input.retentionUntil) > now.getTime(), "AUTH_EXPIRED", "data retention already expired");
    invariant(typeof input.payloadBase64 === "string" && input.payloadBase64.length <= 4 * Math.ceil(this.maxObjectBytes / 3), "INVALID_INPUT", "oversized data object");
    const bytes = Buffer.from(input.payloadBase64, "base64");
    invariant(bytes.toString("base64") === input.payloadBase64 && bytes.length <= this.maxObjectBytes, "INVALID_INPUT", "noncanonical base64 or oversized data");
    invariant(this.totalBytes + bytes.length <= this.maxTotalBytes, "PRECONDITION_FAILED", "data store capacity exhausted");
    const record: DataRecord = { scope, tenant: access.tenant, contractId: access.contractId, owner: access.agentId,
      modality: input.modality, revision: 1, state: "CAPTURED", retentionUntil: input.retentionUntil,
      contentHash: sha256(input.payloadBase64), lineage: [], readers: [], bytes: bytes.length };
    this.records.set(scope, record); this.content.set(scope, bytes); this.totalBytes += bytes.length;
    return structuredClone(record);
  }

  mutate(access: TaskAccess, scope: string, operation: string, input: Record<string, unknown>, now: Date): DataRecord {
    authorizeEffect(this.runtime, access, scope, operation, input, now);
    this.expire(now);
    const record = this.records.get(scope);
    invariant(record && record.contractId === access.contractId && record.state !== "DELETED", "SCOPE_VIOLATION", "data unavailable to task");
    revision(record.revision, input.expectedRevision);
    const next = structuredClone(record);
    let bytes = this.content.get(scope)!;
    if (operation === "acn.data.process") {
      invariant(record.state === "CAPTURED", "INVALID_STATE", "processing requires CAPTURED data");
      invariant(input.transform === "json-redact" && Array.isArray(input.removeFields)
        && input.removeFields.every(x => typeof x === "string"), "INVALID_INPUT", "unknown data transform");
      const parsed = JSON.parse(bytes.toString("utf8"));
      invariant(parsed && typeof parsed === "object" && !Array.isArray(parsed), "INVALID_INPUT", "redaction requires a JSON object");
      for (const key of input.removeFields as string[]) delete parsed[key];
      bytes = Buffer.from(canonical(parsed));
      invariant(bytes.length <= this.maxObjectBytes && this.totalBytes - record.bytes + bytes.length <= this.maxTotalBytes, "PRECONDITION_FAILED", "transformed data exceeds capacity");
      next.lineage.push(record.contentHash); next.contentHash = sha256(bytes.toString("base64")); next.state = "PROCESSED";
    } else if (operation === "acn.data.store") {
      invariant(record.state === "CAPTURED" || record.state === "PROCESSED", "INVALID_STATE", "storage requires captured or processed data");
      next.state = "STORED";
    } else if (operation === "acn.data.share") {
      invariant(record.state === "STORED" || record.state === "SHARED", "INVALID_STATE", "sharing requires stored data");
      invariant(Array.isArray(input.readerIds) && input.readerIds.every(id => typeof id === "string"), "INVALID_INPUT", "invalid readers");
      for (const id of input.readerIds as string[]) {
        const reader = this.runtime.authority.principal(id);
        invariant(reader?.status === "ACTIVE" && reader.tenant === access.tenant, "TENANT_MISMATCH", "reader identity unavailable in tenant");
      }
      next.readers = [...new Set(input.readerIds as string[])].sort(); next.state = "SHARED";
    } else {
      invariant(operation === "acn.data.delete", "ACTION_NOT_ALLOWED", "unknown lifecycle operation");
      next.state = "DELETED"; next.readers = []; bytes = Buffer.alloc(0);
    }
    next.revision += 1; next.bytes = bytes.length;
    this.totalBytes += next.bytes - record.bytes;
    this.records.set(scope, next);
    if (next.state === "DELETED") this.content.delete(scope); else this.content.set(scope, bytes);
    return structuredClone(next);
  }

  read(access: TaskAccess, scope: string, now = new Date()): { record: DataRecord; payloadBase64: string } {
    authorize(this.runtime, access, scope, "acn.data.read", "R0", now);
    this.expire(now);
    const record = this.records.get(scope);
    invariant(record && record.state !== "DELETED", "AUTH_EXPIRED", "data missing, deleted, or expired");
    invariant(record.owner === access.agentId || (record.state === "SHARED" && record.readers.includes(access.agentId)), "SCOPE_VIOLATION", "reader is outside data ACL");
    return { record: structuredClone(record), payloadBase64: this.content.get(scope)!.toString("base64") };
  }
}
