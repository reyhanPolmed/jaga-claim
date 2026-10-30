import crypto from "crypto";

export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  if (!/^scrypt:32768:8:1:[0-9a-f]{32}:[0-9a-f]{128}$/.test(encoded)) return false;
  const [, , , , salt, digest] = encoded.split(":");
  const actual = await new Promise<Buffer>((resolve, reject) => {
    crypto.scrypt(password, salt, 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }, (err, key) => err ? reject(err) : resolve(key));
  });
  return crypto.timingSafeEqual(actual, Buffer.from(digest, "hex"));
}
