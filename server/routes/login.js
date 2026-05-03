import express from "express";
import fs from "fs/promises";

const router = express.Router();
const DATA_FILE = "./data/users.json";

const LOCKOUT_LIMIT       = 5;                  // number of failed attempts before an IP gets locked out
const LOCKOUT_DURATION_MS = 15 * 60 * 1000;    // lockout lasts 15 minutes

const failedAttempts = new Map(); // tracks failed login attempts per IP: { ip -> { count, lockedUntil } }

function getRateLimitEntry(ip) { // returns the rate-limit record for an IP, or null if the IP is clean or the lockout has expired
  const entry = failedAttempts.get(ip);
  if (!entry) return null;
  if (entry.lockedUntil && Date.now() > entry.lockedUntil) {
    failedAttempts.delete(ip); // lockout period has passed, clear the record so the user can try again
    return null;
  }
  return entry;
}

// POST /login — validates credentials and starts a session
router.post("/", async (req, res) => {
  const ip    = req.ip;
  const entry = getRateLimitEntry(ip);

  if (entry && entry.lockedUntil) { // IP is currently locked out, tell the user how many minutes remain
    const remaining = Math.ceil((entry.lockedUntil - Date.now()) / 1000 / 60);
    return res.status(429).json({ success: false, message: `Too many failed attempts. Try again in ${remaining} minute(s).` });
  }

  const { username, password } = req.body;

  if (
    typeof username !== "string" || typeof password !== "string" || // guards against manually crafted requests that send a non-string type (e.g. a raw number) instead of a string — the browser always sends strings, but anyone can send raw JSON via curl or a script
    username.length === 0 || username.length > 64 ||               // reject empty or suspiciously long usernames
    password.length === 0 || password.length > 128                 // reject empty or suspiciously long passwords
  ) {
    return res.status(400).json({ success: false }); // reject malformed input before touching the database
  }

  try {
    const users = await readData();
    const user  = users.find(u => u.username === username);

    if (user && user.password === password) {
      failedAttempts.delete(ip); // successful login, clear any previous failed attempts for this IP

      // Regenerate the session ID to prevent session fixation attacks
      await new Promise((resolve, reject) =>
        req.session.regenerate(err => (err ? reject(err) : resolve()))
      );
      req.session.user     = { username };
      req.session.loggedIn = true;

      return res.json({ success: true, username });
    }

    // Wrong password — increment the failed attempt counter for this IP
    const current = failedAttempts.get(ip) || { count: 0, lockedUntil: null };
    current.count++;
    if (current.count >= LOCKOUT_LIMIT) {
      current.lockedUntil = Date.now() + LOCKOUT_DURATION_MS; // hit the limit, lock the IP out for 15 minutes
    }
    failedAttempts.set(ip, current);

    return res.json({ success: false }); // don't reveal whether the username or password was wrong
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ success: false });
  }
});

async function readData() { // reads users.json and returns the parsed array, or [] if the file is missing or unreadable
  try {
    const data   = await fs.readFile(DATA_FILE, "utf8");
    const parsed = JSON.parse(data);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export default router;
