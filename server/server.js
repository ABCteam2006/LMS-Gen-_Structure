import express from "express";
import path from "path";
import { fileURLToPath } from "url";

import fs from "fs/promises";
import router from "./routes/login.js";
import routerC from "./routes/curriculum.js";
import sessionMiddleware from "./cookieHandler.js";

const __filename = fileURLToPath(import.meta.url); // ES modules don't have __filename by default, so we derive it from import.meta.url
const __dirname = path.dirname(__filename);         // then derive __dirname from that so path.join works normally
const app = express();
app.use(sessionMiddleware);
app.use(express.json({ limit: "100mb" }));                          // raise the body limit to handle base64-encoded image/video payloads

// protect the main editor page — redirect to login or curriculum picker as appropriate
app.get(["/", "/index.html"], (req, res, next) => {
  if (!req.session.user) return res.redirect("/login.html");
  if (!req.query.curriculum) return res.redirect("/curriculum.html");
  next();
});

app.use(express.static(path.join(__dirname, "../client")));         // serve all client-side files (HTML, JS, CSS) from the client folder

app.use("/login", router);         // all /login routes handled by routes/login.js
app.use("/curriculum", routerC);   // all /curriculum routes handled by routes/curriculum.js

const DATA_FILE = "data/save.json";

// ==================================================
// HELPERS
// ==================================================

async function ensureDataDir() { // creates the data folder and an empty save.json if they don't already exist; if both already exist, does nothing and returns
  try {
    await fs.mkdir("data", { recursive: true }); // recursive: true means no error if the folder already exists
    try {
      await fs.access(DATA_FILE); // check if save.json exists
    } catch {
      await fs.writeFile(DATA_FILE, "[]", "utf8"); // if not, create it as an empty array
    }
  } catch (err) {
    console.error("Error creating data directory:", err);
  }
}

async function readData() { // reads save.json and returns the parsed array, or [] if the file is missing or corrupt
  try {
    const data   = await fs.readFile(DATA_FILE, "utf8");
    const parsed = JSON.parse(data);
    return Array.isArray(parsed) ? parsed : []; // guard against the file containing a non-array value
  } catch {
    return [];
  }
}

async function writeData(data) { // converts the in-memory JS array to a JSON string (files can only store text, not live JS objects) and writes it to save.json
  await fs.writeFile(DATA_FILE, JSON.stringify(data, null, 2), "utf8");
}

// ==================================================
// AUTH MIDDLEWARE
// ==================================================

function requireAuth(req, res, next) { // blocks any request that doesn't have an active session; next is a function Express passes in automatically — calling it tells Express "this middleware is done, move on to the actual route handler"
  if (!req.session.user) {
    return res.status(401).json({ status: "error", message: "Unauthorized" }); // don't call next() here — returning early stops the request dead so the route handler never runs
  }
  next(); // session exists, hand the request off to the route handler (e.g. /save, /sync, /delete)
}

// ==================================================
// LOGOUT
// ==================================================

app.post("/logout", (req, res) => {
  req.session.destroy(err => {         // wipes the session from the server
    if (err) return res.status(500).json({ status: "error" });
    res.clearCookie("sess");           // tells the browser to delete the cookie; once gone, future requests have no session so requireAuth blocks them
    res.json({ status: "success" });
  });
});

// ==================================================
// SAVE / UPDATE SINGLE ENTRY
// ==================================================

app.post("/save", requireAuth, async (req, res) => {
  try {
    const { id, html, type, order, curriculumID } = req.body;
    if (!id || !html) return res.status(400).json({ status: "error", message: "Missing id or html" });

    const data          = await readData();
    const existingIndex = data.findIndex(e => e.id === id);

    if (existingIndex >= 0) {
      data[existingIndex] = { id, html, type, order, curriculumID, timestamp: new Date() }; // overwrite the existing entry
    } else {
      data.push({ id, html, type, order, curriculumID, timestamp: new Date() }); // new entry, append it
    }

    await writeData(data);
    res.json({ status: "success", entry: { id, html, type, order, curriculumID } });
  } catch (err) {
    console.error("Save error:", err);
    res.status(500).json({ status: "error", message: err.message });
  }
});

// GET /me — returns the username from the active session so the client can identify the logged-in user
app.get("/me", async (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ error: "Not logged in" });
  }
  return res.json({ username: req.session.user.username });
});

// ==================================================
// SYNC ALL ELEMENTS (MERGE)
// ==================================================

app.post("/sync", requireAuth, async (req, res) => {
  try {
    const { entries } = req.body;
    if (!Array.isArray(entries)) return res.status(400).json({ status: "error", message: "Entries must be an array" });

    const data   = await readData();
    const merged = [...data]; // start with what's already saved, then layer client updates on top

    for (const e of entries) {
      const idx = merged.findIndex(m => m.id === e.id);
      const hasReviewedAttr = typeof e.html === "string" && e.html.includes("data-reviewed"); // only preserve reviewed state for flashcard entries

      if (idx >= 0) {
        const wasReviewed = merged[idx].reviewed === true;
        merged[idx] = {
          ...e,
          ...(hasReviewedAttr && { reviewed: wasReviewed || e.reviewed || false }) // never un-review a card that was already marked reviewed
        };
      } else {
        merged.push({
          ...e,
          ...(hasReviewedAttr && { reviewed: e.reviewed || false }) // new flashcard entry defaults to not reviewed
        });
      }
    }

    await writeData(merged);
    res.json({ status: "success", count: entries.length });
  } catch (err) {
    console.error("Sync error:", err);
    res.status(500).json({ status: "error", message: err.message });
  }
});

// ==================================================
// MARK FLASHCARD SET AS REVIEWED
// Called by the client when every card in a set has been flipped at least once.
// Only updates reviewed and reviewedAt — avoids replacing the whole entry in case the client data is out of sync.
// ==================================================

app.post("/mark-reviewed", requireAuth, async (req, res) => {
  try {
    const { id } = req.body;
    if (!id) return res.status(400).json({ status: "error", message: "Missing id" });

    const data  = await readData();
    const index = data.findIndex(e => e.id === id);

    if (index === -1) return res.status(404).json({ status: "error", message: "Entry not found" });

    data[index].reviewed    = true;
    data[index].reviewedAt  = new Date();

    await writeData(data);
    res.json({ status: "success", id, reviewed: true });
  } catch (err) {
    console.error("Mark reviewed error:", err);
    res.status(500).json({ status: "error", message: err.message });
  }
});

// ==================================================
// DELETE SINGLE ENTRY
// ==================================================

app.post("/delete", requireAuth, async (req, res) => {
  try {
    const { id } = req.body;
    if (!id) return res.status(400).json({ status: "error", message: "Missing id" });

    const data     = await readData();
    const filtered = data.filter(e => e.id !== id); // remove the deleted entry

    // Re-normalize order within each curriculum to close the gap left by the deleted entry
    const byCurriculum = {};
    for (const e of filtered) {
      const cid = e.curriculumID ?? "default";
      if (!byCurriculum[cid]) byCurriculum[cid] = [];
      byCurriculum[cid].push(e);
    }

    const renumbered = [];
    for (const group of Object.values(byCurriculum)) {
      group.sort((a, b) => a.order - b.order);
      group.forEach((e, i) => renumbered.push({ ...e, order: i + 1 })); // re-assign order starting from 1
    }

    await writeData(renumbered);
    res.json({ status: "success", deletedId: id });
  } catch (err) {
    console.error("Delete error:", err);
    res.status(500).json({ status: "error", message: err.message });
  }
});

// ==================================================
// GET ALL ENTRIES
// ==================================================

app.get("/entries", requireAuth, async (_req, res) => {
  try {
    const data = await readData();
    res.json({ status: "success", entries: data }); // returns every entry in save.json unfiltered; the client narrows it down by curriculumID and username (see index.js line 40)
  } catch (err) {
    console.error("Read entries error:", err);
    res.status(500).json({ status: "error", message: err.message });
  }
});

// ==================================================
// START SERVER
// ==================================================

await ensureDataDir();
app.listen(3000, () => console.log("Server running on port 3000"));
