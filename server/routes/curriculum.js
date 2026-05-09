// server/routes/curriculum.js
import express from "express";
import fs from "fs/promises";

const router = express.Router();
const SAVE_FILE = "./data/save.json";  // stores all user entries (flashcards, drag-and-drop, etc.)
const META_FILE = "./data/curricula.json"; // stores curriculum names and themes, separate from entries

async function readSave() { // reads all saved entries, returns [] on error so the app doesn't crash on a missing file
  try {
    const d = await fs.readFile(SAVE_FILE, "utf8");
    return JSON.parse(d);
  } catch { return []; }
}

async function readMeta() { // reads curriculum metadata (names + themes), returns [] if the file doesn't exist yet
  try {
    const d = await fs.readFile(META_FILE, "utf8");
    return JSON.parse(d);
  } catch { return []; }
}

async function writeMeta(data) { // serializes and writes curriculum metadata back to curricula.json
  await fs.writeFile(META_FILE, JSON.stringify(data, null, 2), "utf8");
}

// GET /curriculum — returns a list of all curricula belonging to the logged-in user, with their names and themes
router.get("/", async (req, res) => {
  if (!req.session.user)
    return res.status(401).json({ status: "error", message: "Unauthorized" });

  const username = req.session.user.username;
  try {
    const [save, meta] = await Promise.all([readSave(), readMeta()]); // fetch entries and metadata in parallel
    const ids = [...new Set(
      save.filter(e => e.username === username).map(e => e.curriculumID) // collect unique curriculum IDs for this user
    )];

    const curriculums = ids.map(id => {
      const m = meta.find(m => m.username === username && m.curriculumID === id);
      return {
        id,
        name:       m?.name       || `Curriculum ${id}`,
        theme:      m?.theme      || "#ffffff",
        openCount:  m?.openCount  || 0,
        lastOpened: m?.lastOpened || null,
      };
    });

    res.json({ username, curriculums });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /curriculum/meta?curriculum=ID — returns the name and theme for a single curriculum
router.get("/meta", async (req, res) => {
  if (!req.session.user)
    return res.status(401).json({ status: "error", message: "Unauthorized" });

  const username = req.session.user.username;
  const id = parseInt(req.query.curriculum, 10); // parse the curriculum query param as a number to match how IDs are stored
  if (isNaN(id)) return res.status(400).json({ error: "Invalid curriculum" });

  try {
    const meta = await readMeta();
    const entry = meta.find(m => m.username === username && m.curriculumID === id);
    res.json(entry || { username, curriculumID: id, name: `Curriculum ${id}`, theme: "#ffffff" }); // send defaults if this curriculum has no saved metadata yet
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /curriculum/meta — creates or updates a curriculum's name and theme (upsert)
router.post("/meta", async (req, res) => {
  if (!req.session.user)
    return res.status(401).json({ status: "error", message: "Unauthorized" });

  const username = req.session.user.username;
  const { curriculumID, name, theme } = req.body;
  if (!curriculumID) return res.status(400).json({ error: "Missing curriculumID" });

  try {
    const meta = await readMeta();
    const idx = meta.findIndex(m => m.username === username && m.curriculumID === curriculumID);
    const entry = {
      username,
      curriculumID,
      name:  name  || `Curriculum ${curriculumID}`, // fall back to a generated name if none was provided
      theme: theme || "#ffffff"                      // fall back to white if no theme was provided
    };

    if (idx >= 0) meta[idx] = entry; // overwrite existing metadata
    else meta.push(entry);           // no metadata for this curriculum yet, create a new record

    await writeMeta(meta);
    res.json({ status: "success", entry });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /curriculum/open — increments openCount and records lastOpened timestamp for a curriculum
router.post("/open", async (req, res) => {
  if (!req.session.user)
    return res.status(401).json({ status: "error", message: "Unauthorized" });

  const username = req.session.user.username;
  const { curriculumID } = req.body;
  if (!curriculumID) return res.status(400).json({ error: "Missing curriculumID" });

  try {
    const meta = await readMeta();
    const idx = meta.findIndex(m => m.username === username && m.curriculumID === curriculumID);

    if (idx === -1) {
      meta.push({ username, curriculumID, name: `Curriculum ${curriculumID}`, theme: "#ffffff", openCount: 1, lastOpened: new Date().toISOString() });
    } else {
      meta[idx].openCount  = (meta[idx].openCount || 0) + 1;
      meta[idx].lastOpened = new Date().toISOString();
    }

    await writeMeta(meta);
    res.json({ status: "success" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
