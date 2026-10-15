import bcrypt from 'bcryptjs';
import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';

// Run locally. Password is hidden and is never sent to GitHub or printed.
let hidden = false;
const output = new Writable({ write(chunk, encoding, callback) { if (!hidden) process.stdout.write(chunk); callback(); } });
const prompt = createInterface({ input: process.stdin, output, terminal: true });
try {
    const email = (await prompt.question('Administrator email: ')).trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) throw new Error('Enter a valid email.');
    process.stdout.write('Password (hidden; 14+ characters): ');
    hidden = true;
    const password = await prompt.question('');
    hidden = false;
    process.stdout.write('\n');
    if (password.length < 14 || Buffer.byteLength(password) > 72) throw new Error('Use 14+ characters and at most 72 UTF-8 bytes.');
    const passwordHash = await bcrypt.hash(password, 12);
    const quote = value => "'" + value.replaceAll("'", "''") + "'";
    console.log('\nPaste this SQL into the same Neon database. It adds an admin only if no administrator exists:\n');
    console.log(`BEGIN;\nLOCK TABLE users IN EXCLUSIVE MODE;\nINSERT INTO users (email,password_hash,role)\nSELECT ${quote(email)},${quote(passwordHash)},'admin'\nWHERE NOT EXISTS (SELECT 1 FROM users WHERE role='admin')\nON CONFLICT (email) DO NOTHING;\nCOMMIT;`);
} catch (error) {
    console.error(error.message);
    process.exitCode = 1;
} finally { prompt.close(); }
