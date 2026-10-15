import {
    createHash,
    randomBytes,
    createCipheriv,
    createDecipheriv,
    createHmac,
    timingSafeEqual,
} from 'node:crypto';
export const digest = (value) =>
    createHash('sha256').update(value).digest('hex');
export const secretToken = () => randomBytes(32).toString('hex');
export function encryptionReady() {
    return /^[a-f0-9]{64}$/i.test(process.env.APP_ENCRYPTION_KEY || '');
}
function key() {
    if (!encryptionReady())
        throw Object.assign(
            new Error('Security encryption is not configured.'),
            { status: 503 },
        );
    return Buffer.from(process.env.APP_ENCRYPTION_KEY, 'hex');
}
export function seal(value) {
    const iv = randomBytes(12),
        cipher = createCipheriv('aes-256-gcm', key(), iv);
    const encrypted = Buffer.concat([
        cipher.update(value, 'utf8'),
        cipher.final(),
    ]);
    return [iv, cipher.getAuthTag(), encrypted]
        .map((b) => b.toString('base64url'))
        .join('.');
}
export function unseal(value) {
    const [iv, tag, ciphertext] = value
        .split('.')
        .map((s) => Buffer.from(s, 'base64url'));
    const cipher = createDecipheriv('aes-256-gcm', key(), iv);
    cipher.setAuthTag(tag);
    return Buffer.concat([cipher.update(ciphertext), cipher.final()]).toString(
        'utf8',
    );
}
const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export function base32(buffer) {
    let bits = 0,
        value = 0,
        result = '';
    for (const byte of buffer) {
        value = (value << 8) | byte;
        bits += 8;
        while (bits >= 5) {
            bits -= 5;
            result += alphabet[(value >>> bits) & 31];
        }
    }
    if (bits) result += alphabet[(value << (5 - bits)) & 31];
    return result;
}
function decode32(value) {
    let bits = 0,
        acc = 0;
    const output = [];
    for (const char of value) {
        const n = alphabet.indexOf(char);
        if (n < 0) throw new Error('Invalid secret.');
        acc = (acc << 5) | n;
        bits += 5;
        if (bits >= 8) {
            bits -= 8;
            output.push((acc >>> bits) & 255);
        }
    }
    return Buffer.from(output);
}
export const newTotpSecret = () => base32(randomBytes(20));
export function totp(secret, step, digits = 6) {
    const buffer = Buffer.alloc(8);
    buffer.writeBigUInt64BE(BigInt(step));
    const mac = createHmac('sha1', decode32(secret)).update(buffer).digest();
    const offset = mac[19] & 15;
    return String(
        (mac.readUInt32BE(offset) & 0x7fffffff) % 10 ** digits,
    ).padStart(digits, '0');
}
export function totpStep(secret, code, last = -1, now = Date.now()) {
    if (typeof code !== 'string' || !/^\d{6}$/.test(code)) return null;
    const step = Math.floor(now / 30000);
    for (const current of [step, step - 1, step + 1]) {
        if (
            current > Number(last) &&
            timingSafeEqual(
                Buffer.from(totp(secret, current)),
                Buffer.from(code),
            )
        )
            return current;
    }
    return null;
}
export async function useMfa(client, userId, code) {
    const row = (
        await client.query(
            'SELECT mfa_secret,mfa_last_step,mfa_recovery_hashes FROM users WHERE id=$1 FOR UPDATE',
            [userId],
        )
    ).rows[0];
    if (!row?.mfa_secret) return true;
    const step = totpStep(unseal(row.mfa_secret), code, row.mfa_last_step);
    if (step !== null) {
        await client.query('UPDATE users SET mfa_last_step=$1 WHERE id=$2', [
            step,
            userId,
        ]);
        return true;
    }
    const hash = digest(
        String(code || '')
            .trim()
            .toLowerCase(),
    );
    const codes = row.mfa_recovery_hashes;
    if (!codes.includes(hash)) return false;
    await client.query('UPDATE users SET mfa_recovery_hashes=$1 WHERE id=$2', [
        JSON.stringify(codes.filter((c) => c !== hash)),
        userId,
    ]);
    return true;
}
export function canonicalOrigin() {
    const url = new URL(process.env.PUBLIC_SITE_URL || '');
    if (
        url.protocol !== 'https:' ||
        url.username ||
        url.password ||
        url.pathname !== '/' ||
        url.search ||
        url.hash
    )
        throw Object.assign(
            new Error('PUBLIC_SITE_URL must be an HTTPS origin.'),
            { status: 503 },
        );
    return url.origin;
}
