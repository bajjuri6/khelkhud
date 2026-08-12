import crypto from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(crypto.scrypt) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: crypto.ScryptOptions,
) => Promise<Buffer>;

/**
 * Password hashing on Node's built-in scrypt.
 *
 * Why not argon2 or bcrypt: both are native modules. This API is built for linux/arm64
 * inside a slim Debian image with no compiler, so every native dependency is either a
 * prebuilt-binary gamble or a toolchain in the build stage. scrypt is memory-hard, in
 * the standard library, and specified in RFC 7914 — it is the right trade here. If the
 * threat model ever justifies argon2id, the stored format below is versioned so both can
 * coexist during a rehash-on-login migration.
 *
 * Parameters: N=2^15 (32768), r=8, p=1 — roughly 32 MB and ~100ms per hash on the target
 * B2pls_v2. maxmem has to be raised explicitly because Node's 32 MB default is exactly at
 * the limit this N needs and the call throws without it.
 */
const N = 32768;
const R = 8;
const P = 1;
const KEYLEN = 64;
const SALT_BYTES = 16;
const MAXMEM = 64 * 1024 * 1024;

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(SALT_BYTES);
  const key = await scrypt(password.normalize("NFKC"), salt, KEYLEN, {
    N,
    r: R,
    p: P,
    maxmem: MAXMEM,
  });
  return [
    "scrypt",
    N,
    R,
    P,
    salt.toString("base64"),
    key.toString("base64"),
  ].join("$");
}

/**
 * Verify a password against a stored hash.
 *
 * Reads the cost parameters back out of the stored string rather than assuming the
 * current constants, so raising N later does not lock out every existing account.
 * Returns false on a malformed hash instead of throwing — a corrupt row should fail the
 * login, not 500 the endpoint.
 */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  try {
    const parts = stored.split("$");
    if (parts.length !== 6 || parts[0] !== "scrypt") return false;
    const [, nStr, rStr, pStr, saltB64, keyB64] = parts;
    const n = Number(nStr);
    const r = Number(rStr);
    const p = Number(pStr);
    if (!Number.isInteger(n) || !Number.isInteger(r) || !Number.isInteger(p)) return false;

    const salt = Buffer.from(saltB64!, "base64");
    const expected = Buffer.from(keyB64!, "base64");
    const actual = await scrypt(password.normalize("NFKC"), salt, expected.length, {
      N: n,
      r,
      p,
      maxmem: MAXMEM,
    });
    // Constant-time: a length-dependent early return would leak the key length, and a
    // plain === would leak a prefix match through timing.
    return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

/**
 * A hash to compare against when the account does not exist or is Google-only.
 *
 * Without this, a missing user returns instantly while a real one costs ~100ms of scrypt,
 * and that difference is a reliable account-enumeration oracle. Callers burn the same
 * work on the miss path.
 */
export const DUMMY_HASH: string =
  "scrypt$32768$8$1$AAAAAAAAAAAAAAAAAAAAAA==$" +
  "d29yayBmYWN0b3IgYnVybmVyIC0gbmV2ZXIgbWF0Y2hlcyBhbnkgcmVhbCBwYXNzd29yZCBoYXNo";
