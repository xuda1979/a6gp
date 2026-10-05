import { sign as cryptoSign, verify as cryptoVerify, type KeyObject } from "node:crypto";
import { canonical, sha256 } from "./canonical.ts";
import { A6GPError, invariant } from "./errors.ts";
import type { A6GPEnvelope, NegotiatedContext, ProtocolAdvertisement } from "./types.ts";

export const A6GP_PROTOCOL_VERSION = "0.4";

function versionTuple(value: string): [number, number] {
  const match = /^(\d+)\.(\d+)$/.exec(value);
  invariant(match, "INVALID_INPUT", `invalid protocol version ${value}`);
  return [Number(match[1]), Number(match[2])];
}

function compareVersions(a: string, b: string): number {
  const [amaj, amin] = versionTuple(a);
  const [bmaj, bmin] = versionTuple(b);
  return amaj - bmaj || amin - bmin;
}

export function negotiate(
  local: ProtocolAdvertisement,
  remote: ProtocolAdvertisement,
  requiredProfiles: string[] = ["A6GP-Core"],
): NegotiatedContext {
  const commonVersions = local.protocolVersions.filter((v) => remote.protocolVersions.includes(v)).sort(compareVersions).reverse();
  invariant(commonVersions.length > 0, "INVALID_INPUT", "no common A6GP protocol version");
  const profiles = [...new Set(local.profiles.filter((p) => remote.profiles.includes(p)))].sort();
  for (const profile of requiredProfiles) {
    invariant(profiles.includes(profile), "INVALID_INPUT", `required profile ${profile} is not mutually supported`);
  }
  const extensions = [...new Set(local.extensions.filter((e) => remote.extensions.includes(e)))].sort();
  const binding = local.bindings.find((b) => remote.bindings.includes(b));
  invariant(binding, "INVALID_INPUT", "no common protocol binding");
  return { protocolVersion: commonVersions[0], profiles, extensions, binding };
}

export function envelopeBodyHash(body: unknown): string {
  return sha256(body);
}

export function signedEnvelopeView<T>(envelope: A6GPEnvelope<T>): Record<string, unknown> {
  const { signature: _signature, ...signed } = envelope;
  return signed;
}

export function signEnvelope<T>(envelope: Omit<A6GPEnvelope<T>, "signature">, privateKey: KeyObject): A6GPEnvelope<T> {
  invariant(envelope.hashAlg === "sha-256", "INVALID_INPUT", "unsupported hash algorithm");
  invariant(envelope.signatureAlg === "Ed25519", "INVALID_INPUT", "unsupported signature algorithm");
  invariant(envelope.bodyHash === envelopeBodyHash(envelope.body), "AUTH_HASH_MISMATCH", "bodyHash does not match canonical body");
  const unsigned = { ...envelope, signature: "" } as A6GPEnvelope<T>;
  const data = Buffer.from(canonical(signedEnvelopeView(unsigned)));
  const signature = cryptoSign(null, data, privateKey).toString("base64url");
  return { ...envelope, signature };
}

export function verifyEnvelope<T>(
  envelope: A6GPEnvelope<T>,
  publicKey: KeyObject,
  supported: ProtocolAdvertisement,
  replayGuard?: EnvelopeReplayGuard,
  now = Date.now(),
): void {
  invariant(envelope.expiresAt > now, "AUTH_EXPIRED", "message expired");
  invariant(envelope.sentAt <= envelope.expiresAt, "INVALID_INPUT", "message timestamp is after expiry");
  invariant(supported.protocolVersions.includes(envelope.protocolVersion), "INVALID_INPUT", "unsupported protocol version");
  for (const ext of envelope.criticalExtensions) {
    if (!supported.extensions.includes(ext)) {
      throw new A6GPError("UNSUPPORTED_CRITICAL_EXTENSION", `unsupported critical extension ${ext}`);
    }
  }
  invariant(envelope.negotiated.protocolVersion === envelope.protocolVersion, "AUTH_CONTEXT_STALE", "negotiated version differs from envelope version");
  invariant(envelope.negotiated.profiles.every((p) => supported.profiles.includes(p)), "AUTH_CONTEXT_STALE", "envelope asserts unsupported profile");
  invariant(supported.bindings.includes(envelope.negotiated.binding), "AUTH_CONTEXT_STALE", "envelope asserts unsupported binding");
  invariant(envelope.bodyHash === envelopeBodyHash(envelope.body), "AUTH_HASH_MISMATCH", "bodyHash mismatch");
  const data = Buffer.from(canonical(signedEnvelopeView(envelope)));
  invariant(cryptoVerify(null, data, publicKey, Buffer.from(envelope.signature, "base64url")), "AUTH_HASH_MISMATCH", "invalid envelope signature");
  replayGuard?.accept(envelope.messageId, envelope.expiresAt, now);
}

export class EnvelopeReplayGuard {
  private readonly seen = new Map<string, number>();

  accept(messageId: string, expiresAt: number, now = Date.now()): void {
    for (const [id, expiry] of this.seen) if (expiry <= now) this.seen.delete(id);
    invariant(!this.seen.has(messageId), "AUTH_CONTEXT_STALE", `replayed messageId ${messageId}`);
    this.seen.set(messageId, expiresAt);
  }
}
