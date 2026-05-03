// if no user is stored in sessionStorage the person isn't logged in
if (!sessionStorage.getItem("user")) {
  window.location.replace("/login.html"); // redirect to login page
}

// ==================================================
// CURRICULUM STATE
// ==================================================

let currentCurriculumID = null;  // ID of the currently open curriculum
let correctMCFlag    = false;    // tracks whether the correct answer was found while building a multiple-choice element
let currentIndex     = 0;        // reserved position index (used by flashcard navigation closures)
let flashSetNum      = 0;        // counter that gives each flashcard set a unique ID
let currentUsername;             // username of the logged-in user, filled by getUsername()

async function initCurriculum() { // fetches and renders all saved entries for the current curriculum on page load
  try {
    const params  = new URLSearchParams(window.location.search); // parse the ?session=... query string from the URL
    const session = params.get("session"); // extract the curriculum ID from the URL

    const [entriesRes, metaRes] = await Promise.all([ // fetch entries + curriculum metadata in parallel; destructure results in order
      fetch("http://localhost:3000/entries", { credentials: "include" }),        // fetch all saved entries for this user
      fetch(`/curriculum/meta?session=${session}`, { credentials: "include" }), // fetch this curriculum's name and theme
      getUsername() // also fetch the current username (third promise; result is stored in currentUsername directly)
    ]);

    const data = await entriesRes.json();           // parse the entries response
    currentCurriculumID = parseInt(session, 10);    // store the curriculum ID as a number globally
    console.log("curriculumID:", currentCurriculumID, "username:", currentUsername);

    if (metaRes.ok) { // only apply theme/name if the meta request succeeded
      const meta   = await metaRes.json();               // parse the curriculum metadata
      const nameEl = document.getElementById("curriculumName");
      if (nameEl) nameEl.textContent = meta.name;        // set the page heading to the curriculum's name
      document.body.style.backgroundColor = meta.theme; // set the page background to the curriculum's theme color
    }

    const entries = Array.isArray(data.entries) ? data.entries : []; // use the entries array, defaulting to empty if missing
    const filtered = entries
      .filter(e => e.curriculumID === currentCurriculumID && e.username === currentUsername) // keep only entries belonging to this curriculum and user
      .sort((a, b) => a.order - b.order); // sort them by their saved order value

    filtered.forEach(entry => injectEntry(entry)); // render each saved entry onto the page

  } catch (err) {
    console.error("Failed to initialize curriculum:", err); // log any errors
    currentCurriculumID = -1; // fall back to curriculum ID 1 if something went wrong
  }
}

function injectEntry(entry) { // takes a saved entry object and rebuilds its DOM elements on the page
  const wrapper = document.createElement("div");  // create the outer wrapper div for this entry
  wrapper.classList.add("element-wrapper");        // apply the wrapper class for styling
  wrapper.appendChild(createToolbar());            // prepend a cloned toolbar above the entry

  const temp = document.createElement("div"); // temporary div used to parse the saved HTML string
  temp.innerHTML = entry.html;                 // set the saved HTML as the temp div's content
  const el = temp.firstElementChild;           // grab the first actual HTML tag (skips whitespace/text nodes)

  wrapper.appendChild(el); // add the reconstructed element into the wrapper

  if (entry.type === "dragAndDrop") { // drag-and-drop entries need their term/def lists rebuilt separately from the saved data
    const termsOl = document.createElement("ol"); // ordered list for terms
    termsOl.id = "termsOl";
    const defsOl = document.createElement("ol");  // ordered list for definitions
    defsOl.id = "defsOl";

    (entry.terms || []).forEach(({ index, text }) => { // loop over each saved term object
      const li = document.createElement("li");
      li.draggable = true;                     // make the item draggable
      li.id = `terms${index}`;                 // unique ID based on its original index
      li.dataset.originOl    = "termsOl";      // records which list it belongs to so it can be returned on a wrong drop
      li.dataset.originIndex = index;          // records its original position for match-checking
      li.textContent = text;                   // set the visible term text
      termsOl.appendChild(li);
    });

    (entry.defs || []).forEach(({ index, text }) => { // same process for definitions
      const li = document.createElement("li");
      li.draggable = true;
      li.id = `defs${index}`;
      li.dataset.originOl    = "defsOl";
      li.dataset.originIndex = index;
      li.textContent = text;
      defsOl.appendChild(li);
    });

    const termsH = document.createElement("h6"); // column heading for terms
    termsH.id = "terms";
    termsH.textContent = "Terms";
    termsH.appendChild(termsOl); // nest the terms list inside its heading

    const defsH = document.createElement("h6"); // column heading for definitions
    defsH.id = "defs";
    defsH.textContent = "Definitions";
    defsH.appendChild(defsOl); // nest the defs list inside its heading

    const matchHeaders = document.createElement("div"); // container that holds both columns side by side
    matchHeaders.id = "matchHeaders";
    matchHeaders.appendChild(termsH);
    matchHeaders.appendChild(defsH);

    wrapper.appendChild(matchHeaders); // add the two-column matching UI to the wrapper
  }

  wrapper.appendChild(editOrDelete());         // add the edit/delete toolbar at the bottom
  elementContainer.appendChild(wrapper);       // add the finished wrapper to the page

  baseToolbar.style.display = "none"; // hide the main toolbar since at least one element now exists
  editToolbar.style.display = "none"; // hide the standalone edit/delete toolbar
}

async function getUsername() { // fetches the logged-in user's username from the server
  try {
    const res = await fetch("http://localhost:3000/me", { // GET /me — returns the session user's info
      credentials: "include" // send the session cookie
    });
    const data = await res.json();      // parse the response
    currentUsername = data.username;    // store the username globally so other functions can use it
    console.log(currentUsername);
  } catch (e) {
    console.log(e); // log any fetch or parse errors
  }
}

initCurriculum(); // kick off the curriculum load as soon as the script runs

// ==================================================
// DOM REFERENCES
// ==================================================

const elementContainer = document.getElementById("elementContainer"); // the container where all content elements are rendered
const baseToolbar      = document.getElementById("toolContainer");    // the main toolbar with buttons to add new elements
const editToolbar      = document.getElementById("editOrDelete");     // the standalone edit/delete toolbar shown before any elements exist

// ==================================================
// COUNTERS & MUTABLE STATE
// ==================================================

let toolbarCount        = 0;    // increments each time a toolbar is cloned, ensuring each clone gets a unique ID
let dragDropHeaderCount = 0;    // increments each time drag-and-drop headings are created, keeping old sets distinguishable
let dragTermCount       = 0;    // counts terms added during drag-and-drop creation, used later as totalPairs
let dragDefCount        = 0;    // counts definitions added during drag-and-drop creation
let mutableCount        = 0;    // increments each time an edit/delete toolbar is cloned, giving each a unique ID
let editTarget          = null; // holds a reference to the element currently being edited, or null when not editing
let pendingUploadContext      = null; // saves toolbar/input context while waiting for an image file to be chosen
let pendingVideoUploadContext = null; // saves toolbar/input context while waiting for a video file to be chosen

const allowedTags = ["h1","h2","h3","h4","h5","h6","p","div","select"]; // whitelist of HTML tags usable for generic text elements

// ==================================================
// TOOLBAR FACTORY
// ==================================================

function createToolbar() { // clones the main toolbar and returns a fresh copy to attach above a new element
  toolbarCount++; // increment so this clone gets a unique ID
  const nav = baseToolbar.cloneNode(true); // deep-clone the base toolbar including all its children
  nav.id = `toolContainer${toolbarCount}`; // assign a unique ID to this clone
  nav.style.display = "block";             // make it visible (the original may be hidden)

  const input = nav.querySelector("input"); // find the text input inside the clone
  if (input) {
    input.value = "";              // clear any leftover value from the original
    input.removeAttribute("id");  // remove the ID to avoid duplicate IDs on the page
    input.style.display = "inline-block"; // ensure the input is visible
  }

  return nav; // return the ready-to-use toolbar clone
}

// ==================================================
// EDIT/DELETE TOOLBAR FACTORY
// ==================================================

function editOrDelete() { // clones the edit/delete toolbar and returns a fresh copy for a new element wrapper
  mutableCount++; // increment for a unique ID
  const nav = editToolbar.cloneNode(true);  // deep-clone the edit/delete nav
  nav.id = `editOrDelete${mutableCount}`;  // assign a unique ID
  nav.style.display = "block";             // make it visible
  return nav; // return the clone
}

// ==================================================
// DRAG-AND-DROP HEADINGS
// ==================================================

function createDragDropHeadings() { // prompts the user for terms and definitions, builds the two-column matching UI, and returns it
  dragDropHeaderCount++; // increment to distinguish this set's headings from any previous ones

  const termsHeading = document.getElementById("terms"); // find any existing terms heading already in the DOM
  const defsHeading  = document.getElementById("defs");  // find any existing defs heading already in the DOM
  if (termsHeading && defsHeading) {
    termsHeading.id = `terms${dragDropHeaderCount}`; // rename old headings so they don't conflict with the new ones
    defsHeading.id  = `defs${dragDropHeaderCount}`;
    termsHeading.style.display = "none"; // hide the old headings
    defsHeading.style.display  = "none";
  }

  const terms = prompt("What terms do you want (in order)?");        // ask the user for comma-separated terms
  const defs  = prompt("What definitions do you want (in order)?"); // ask the user for comma-separated definitions

  const termsH = document.createElement("h6"); // column heading for terms
  const defsH  = document.createElement("h6"); // column heading for definitions
  termsH.id = "terms";
  defsH.id  = "defs";
  termsH.textContent = "Terms";
  defsH.textContent  = "Definitions";

  const termsOl = document.createElement("ol"); // ordered list that will hold all term items
  termsOl.id = "termsOl";
  const defsOl = document.createElement("ol"); // ordered list that will hold all definition items
  defsOl.id = "defsOl";

  dragTermCount = 0; // reset before building so the count accurately reflects this set
  terms.split(",").map(v => v.trim()).filter(Boolean).forEach(text => { // split on commas, trim spaces, drop blanks
    const li = document.createElement("li");
    li.draggable = true;                    // allow this item to be dragged
    li.id = `terms${dragTermCount}`;        // unique ID for this term
    li.dataset.originOl    = "termsOl";    // remember which list it came from for returning on a wrong drop
    li.dataset.originIndex = dragTermCount; // remember its original position for match-checking
    li.textContent = text;
    dragTermCount++; // increment after each term is added
    termsOl.appendChild(li);
  });

  dragDefCount = 0; // reset before building the defs list
  defs.split(",").map(v => v.trim()).filter(Boolean).forEach(text => { // same split/trim/filter for definitions
    const li = document.createElement("li");
    li.draggable = true;
    li.id = `defs${dragDefCount}`;
    li.dataset.originOl    = "defsOl";
    li.dataset.originIndex = dragDefCount;
    li.textContent = text;
    dragDefCount++;
    defsOl.appendChild(li);
  });

  dragDefCount = 0; // reset def count after building (dragTermCount stays set — it's used as totalPairs)

  termsH.appendChild(termsOl); // nest the terms list inside its heading
  defsH.appendChild(defsOl);   // nest the defs list inside its heading

  const matchHeaders = document.createElement("div"); // wrapper that holds both columns side by side
  matchHeaders.id = "matchHeaders";
  matchHeaders.appendChild(termsH);
  matchHeaders.appendChild(defsH);

  return matchHeaders; // return the complete two-column matching UI
}

// ==================================================
// ELEMENT FACTORY
// ==================================================

function createElement({ tag, type, value }) { // builds and returns a DOM element based on the given type and value
  let el;

  if (type === "image") {
    el = document.createElement("img");
    el.src = value;            // set the image source to the URL or base64 data string
    el.alt = "User image";
    el.style.maxWidth = "100%"; // prevent the image from overflowing its container

  } else if (type === "video") {
    if (value.startsWith("data:video/")) { // the value is a base64-encoded local video file
      el = document.createElement("video");
      el.src      = value;   // set source to the base64 data URL
      el.controls = true;    // show native browser video controls
      el.style.maxWidth = "100%";
    } else {
      const embed = getYouTubeEmbedURL(value); // convert the YouTube watch URL to a privacy-enhanced embed URL
      if (!embed) return null; // bail if the URL isn't a recognizable YouTube URL
      el = document.createElement("iframe");
      el.src             = embed; // set the iframe src to the embed URL
      el.width           = 420;
      el.height          = 200;
      el.allow           = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"; // grant common video permissions
      el.allowFullscreen = true;
      el.dataset.watchUrl = value; // store the original watch URL so it can be restored when editing
    }

  } else if (type === "orderedList") {
    el = document.createElement("ol");
    value.split(",").map(v => v.trim()).filter(Boolean).forEach(text => { // split the input into individual items
      const li = document.createElement("li");
      li.textContent = text;
      el.appendChild(li);
    });

  } else if (type === "multipleChoice") {
    el = document.createElement("select");

    const blank = document.createElement("option"); // blank first option acts as a visible placeholder
    blank.textContent = "";
    blank.value = "";
    el.appendChild(blank);

    const options = [...new Set(value.split(",").map(v => v.trim()).filter(Boolean))]; // deduplicate and clean the options list
    options.forEach(text => {
      const option = document.createElement("option");
      option.textContent = text;
      el.appendChild(option);
    });

    const question = prompt("What's your question?");              // ask for the question text
    if (question === null || question.trim() === "") return null;  // cancel creation if no question was given
    const answer = prompt("What's the correct answer?");           // ask for the correct answer
    if (answer === null || answer.trim() === "") return null;      // cancel if no answer was given

    correctMCFlag = false; // reset the flag before scanning for the correct option
    for (let i = 0; i < el.children.length; i++) { // loop through every option in the select
      if (el.children[i].textContent === answer) { // check if this option matches the correct answer
        correctMCFlag = true;                          // mark that the correct answer was found in the options
        el.children[i].dataset.correct = "true";      // tag the correct option so the answer-checker can find it
        break; // stop as soon as the match is found
      }
    }
    if (!correctMCFlag) console.warn("Answer not found in options!"); // warn if the answer doesn't match any option

    el.dataset.question      = question; // store question text on the element for syncing to the server
    el.dataset.correctAnswer = answer;   // store the correct answer for syncing
    el.dataset.answered      = "false";  // track whether the student has selected the correct answer
    el.dataset.lastAnswer    = "";       // store the student's most recent selection

    const label = document.createElement("label"); // wrap the select in a label so the question text appears above it
    label.textContent = question + " ";
    label.classList.add("entry");
    label.dataset.id           = `entry-${Date.now()}-${Math.random().toString(36).slice(2)}`; // generate a unique ID
    label.dataset.curriculumID = currentCurriculumID;
    label.appendChild(el); // nest the select inside the label
    return label; // return early — the label is the top-level element, not el

  } else if (type === "dragAndDrop") {
    el = document.createElement("div");
    el.id = "dragObject"; // this ID is used by the drop handler to identify valid drop zones
    return el; // return early — terms/defs are added separately by injectElement

  } else if (type === "flashcards") {
    const terms = prompt("List terms in order (comma separated)");       // get term list from the user
    const defs  = prompt("List definitions in order (comma separated)"); // get definition list from the user

    const termArray = terms.split(",").map(v => v.trim()).filter(Boolean); // clean and split terms into an array
    const defArray  = defs.split(",").map(v => v.trim()).filter(Boolean);  // clean and split definitions into an array

    const flashcardsDiv = document.createElement("div"); // container that holds all individual flashcard elements
    flashcardsDiv.id = `flashcardsDiv${flashSetNum}`;    // unique ID for this flashcard set
    flashSetNum++;                                        // increment so the next set gets a different ID
    flashcardsDiv.style.cssText = "display:flex; flex-direction:column; align-items:center;"; // stack cards and center them

    let setIndex = 0;                   // tracks which card index is currently visible
    const reviewedCards = new Set();    // tracks which card indices the student has already flipped

    termArray.forEach((termText, i) => { // build one flashcard div per term
      const flashcard = document.createElement("div");
      flashcard.id = `flashcard${i}`;
      flashcard.style.cssText = "width:300px; height:100px; border:1px solid black;";
      if (i !== 0) flashcard.style.display = "none"; // only the first card is visible initially
      flashcard.dataset.cardIndex = i;          // store the card's index for reviewed-tracking logic
      flashcard.dataset.reviewed  = "false";    // mark this card as not yet reviewed

      const termEl = document.createElement("div");
      termEl.textContent = termText;            // display the term text on the front of the card
      termEl.style.textAlign = "center";

      const defEl = document.createElement("div");
      defEl.textContent   = defArray[i] || ""; // display the matching definition, or empty if the arrays are mismatched
      defEl.style.textAlign = "center";
      defEl.style.display   = "none";           // hide the definition until the card is flipped

      flashcard.appendChild(termEl);
      flashcard.appendChild(defEl);
      flashcardsDiv.appendChild(flashcard);
    });

    const totalCards = termArray.length; // save the count so we know when every card has been reviewed

    const backAndForward = document.createElement("div"); // container for the prev/next navigation buttons
    backAndForward.id = "backAndForward";

    const back    = document.createElement("button");
    back.textContent = "<="; // left-arrow label for the back button
    const forward = document.createElement("button");
    forward.textContent = "=>"; // right-arrow label for the forward button

    back.addEventListener("click", () => { // go to the previous card when back is clicked
      if (setIndex > 0) { // only navigate if we're not already at the first card
        flashcardsDiv.children[setIndex].style.display = "none"; // hide the current card
        setIndex--;                                               // move the index back one position
        flashcardsDiv.children[setIndex].style.display = "block"; // show the previous card
      }
    });

    forward.addEventListener("click", () => { // go to the next card when forward is clicked
      if (setIndex < totalCards - 1) { // only navigate if we're not already at the last card
        flashcardsDiv.children[setIndex].style.display = "none"; // hide the current card
        setIndex++;                                               // advance the index
        flashcardsDiv.children[setIndex].style.display = "block"; // show the next card
      }
    });

    backAndForward.appendChild(back);
    backAndForward.appendChild(forward);

    const flashcardWrapper = document.createElement("div");   // top-level wrapper for the whole flashcard set
    flashcardWrapper.classList.add("entry");                  // mark as an entry so syncAllElements picks it up
    flashcardWrapper.dataset.id           = `entry-${Date.now()}-${Math.random().toString(36).slice(2)}`; // unique ID
    flashcardWrapper.dataset.curriculumID = currentCurriculumID;
    flashcardWrapper.dataset.reviewed     = "false";          // the whole set starts as not reviewed
    flashcardWrapper.dataset.totalCards   = totalCards;        // store the total for completion-checking
    flashcardWrapper._reviewedCards       = reviewedCards;     // attach the Set as a property (not serialized to DOM attributes)
    flashcardWrapper.appendChild(flashcardsDiv);               // add the card elements
    flashcardWrapper.appendChild(backAndForward);              // add the nav buttons
    return flashcardWrapper; // return the complete flashcard set

  } else {
    if (!allowedTags.includes(tag)) tag = "div"; // fall back to <div> if the tag isn't on the whitelist
    el = document.createElement(tag || "div");    // create the element, defaulting to <div> if tag is falsy
    el.textContent = value;                       // set the text content to the user's input
  }

  el.dataset.id           = `entry-${Date.now()}-${Math.random().toString(36).slice(2)}`; // attach a unique ID
  el.dataset.curriculumID = currentCurriculumID; // tag the element with its curriculum so syncing scopes it correctly
  el.classList.add("entry");                     // mark as an entry
  return el;
}

// ==================================================
// YOUTUBE URL → EMBED URL
// ==================================================

function getYouTubeEmbedURL(url) { // converts a YouTube watch/share URL into a privacy-enhanced embed URL
  try {
    const u = new URL(url); // parse the URL so we can inspect its parts
    const origin = encodeURIComponent(window.location.origin); // encode the page's origin to pass as an embed parameter
    if (u.hostname === "youtu.be") { // short youtu.be share link — the video ID is in the pathname
      return `https://www.youtube-nocookie.com/embed/${u.pathname.slice(1)}?origin=${origin}`;
    }
    if (u.searchParams.has("list")) { // playlist link — use the videoseries embed format
      return `https://www.youtube-nocookie.com/embed/videoseries?list=${u.searchParams.get("list")}&origin=${origin}`;
    }
    if (u.searchParams.has("v")) { // standard youtube.com/watch?v= link
      return `https://www.youtube-nocookie.com/embed/${u.searchParams.get("v")}?origin=${origin}`;
    }
    return null; // URL didn't match any known YouTube pattern
  } catch {
    return null; // URL failed to parse at all
  }
}

// ==================================================
// DRAG ACTIVITY DATA HELPER
// ==================================================

function getDragActivityData(wrapper) { // extracts the current state of a drag-and-drop activity's term/def lists for syncing
  const termsOl = wrapper.querySelector("#termsOl"); // find the terms list inside this wrapper
  const defsOl  = wrapper.querySelector("#defsOl");  // find the definitions list inside this wrapper

  const mapItems = ol => ol // helper: maps a list's <li> elements to plain { index, text } objects
    ? Array.from(ol.querySelectorAll("li")).map(li => ({
        index: parseInt(li.dataset.originIndex, 10), // read the original position from the data attribute
        text:  li.textContent                        // read the visible text content
      }))
    : []; // return an empty array if the list doesn't exist

  return { terms: mapItems(termsOl), defs: mapItems(defsOl) }; // return both lists as arrays of objects
}

// ==================================================
// MARK FLASHCARD SET AS REVIEWED
// ==================================================

async function markEntryReviewed(entryId) { // tells the server that a flashcard set has been fully reviewed
  try {
    await fetch("http://localhost:3000/mark-reviewed", { // POST to the mark-reviewed endpoint
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ id: entryId }) // send the entry's unique ID
    });
    console.log(`Flashcard set ${entryId} marked as reviewed.`);
  } catch (err) {
    console.error("Error marking entry as reviewed:", err);
  }
}

// ==================================================
// SYNC ALL ELEMENTS TO BACKEND
// ==================================================

async function syncAllElements() { // serializes every entry on the page and sends the full list to the server
  if (!currentUsername) { // don't sync if no user is logged in
    console.warn("syncAllElements: skipped — user not logged in");
    return;
  }
  if (!currentCurriculumID) await initCurriculum(); // if the curriculum ID isn't set yet, initialize first

  const elements = Array.from(
    elementContainer.querySelectorAll(".entry, #dragObject") // find all entries and drag-and-drop zones
  ).map((el, i) => {
    const isDrag  = el.id === "dragObject"; // true if this element is the drop zone div
    const isLabel = el.tagName === "LABEL"; // true if this is a multiple-choice question label
    const wrapper = el.closest(".element-wrapper"); // find the parent wrapper for drag entries

    const entry = {
      id:           el.dataset.id || el.id, // use the dataset ID, falling back to element ID
      html:         el.outerHTML,           // serialize the element's full HTML for storage
      type:
        el.tagName === "IMG"    ? "image"         : // classify the element type by its tag
        el.tagName === "IFRAME" ? "video"          :
        el.tagName === "VIDEO"  ? "video"          :
        el.tagName === "OL"     ? "orderedList"    :
        isLabel                 ? "multipleChoice" :
        isDrag                  ? "dragAndDrop"    :
                                  "heading",        // default for h1–h6 and plain text elements
      order:        i + 1,                              // 1-based position in the container
      curriculumID: parseInt(el.dataset.curriculumID || currentCurriculumID, 10), // prefer element's own tag, fall back to global
      username:     currentUsername                     // attach the user so the server can scope the data correctly
    };

    if (isLabel) { // for multiple-choice, pull extra answer data from the nested <select>
      const select = el.querySelector("select");
      if (select) {
        entry.question      = select.dataset.question      || ""; // the question text
        entry.correctAnswer = select.dataset.correctAnswer || ""; // the correct answer
        entry.answered      = select.dataset.answered === "true"; // whether the student got it right
        entry.lastAnswer    = select.dataset.lastAnswer    || ""; // the student's most recent selection
      }
    }

    if (isDrag && wrapper) { // for drag-and-drop, capture the current positions of all terms and defs
      const { terms, defs } = getDragActivityData(wrapper);
      entry.matched    = parseInt(el.dataset.matched    || 0, 10); // how many pairs have been correctly matched
      entry.totalPairs = parseInt(el.dataset.totalPairs || 0, 10); // total number of pairs in this activity
      entry.terms      = terms; // current state of the terms list
      entry.defs       = defs;  // current state of the defs list
    }

    return entry;
  });

  try {
    await fetch("http://localhost:3000/sync", { // POST all serialized entries to the sync endpoint
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ entries: elements }) // send the full array
    });
  } catch (err) {
    console.error("Error syncing elements:", err);
  }
}

// ==================================================
// HANDLE CREATE ELEMENT
// ==================================================

function injectElement(newEl, toolbar, type, input) { // places a newly created element into the DOM — either replacing an edit target or inserting after its toolbar
  if (editTarget) { // we're replacing an existing element (edit mode)
    newEl.dataset.id           = editTarget.dataset.id; // preserve the original element's ID so the server update matches it
    newEl.dataset.curriculumID = currentCurriculumID;
    editTarget.replaceWith(newEl); // swap the old element with the updated one in place
    editTarget = null; // clear the edit target

  } else { // we're inserting a brand-new element
    newEl.dataset.curriculumID = currentCurriculumID;

    const wrapper = document.createElement("div");
    wrapper.classList.add("element-wrapper");
    wrapper.appendChild(createToolbar()); // add a fresh toolbar clone above the new element
    wrapper.appendChild(newEl);

    if (type === "dragAndDrop") { // drag-and-drop needs extra setup beyond just the element
      const matchHeaders = createDragDropHeadings(); // prompt for terms/defs and build the columns
      newEl.classList.add(`dragObject${dragDropHeaderCount}`); // scope the drop zone class to this specific activity
      newEl.dataset.id           = `entry-${Date.now()}-${Math.random().toString(36).slice(2)}`; // assign a unique ID
      newEl.dataset.curriculumID = currentCurriculumID;
      newEl.dataset.matched      = 0;             // start with zero correct matches
      newEl.dataset.totalPairs   = dragTermCount; // record how many pairs need to be matched
      wrapper.appendChild(matchHeaders);          // add the terms/defs columns to the wrapper
    }

    wrapper.appendChild(editOrDelete()); // add the edit/delete toolbar at the bottom of the wrapper

    const wrappers    = Array.from(elementContainer.querySelectorAll(".element-wrapper")); // get all existing wrappers
    const insertIndex = wrappers.findIndex(w => w.contains(toolbar)); // find which wrapper owns the clicked toolbar
    if (insertIndex === -1) { // the toolbar is the base toolbar, not inside any existing wrapper
      elementContainer.appendChild(wrapper); // append to the end of the container
    } else {
      wrappers[insertIndex].insertAdjacentElement("afterend", wrapper); // insert immediately after the wrapper that triggered the create
    }

    baseToolbar.style.display = "none"; // hide the main toolbar
    editToolbar.style.display = "none"; // hide the base edit/delete bar
  }

  if (input) input.value = ""; // clear the toolbar text input after creating the element
  syncAllElements(); // persist all elements to the server
}

function handleCreateElement(btn, toolbar) { // reads the button's type and input value, then delegates to createElement and injectElement
  const type  = btn.dataset.type; // element type declared on the button (heading, image, video, etc.)
  const tag   = btn.dataset.tag;  // HTML tag to use when building the element
  const input = toolbar.querySelector("input"); // the text input in the same toolbar as the clicked button
  const value = input ? input.value.trim() : ""; // read and trim the value, default to empty string if no input

  if (type === "image") {
    if (value) { // a URL was already typed into the input
      const newEl = createElement({ tag, type, value });
      if (newEl) injectElement(newEl, toolbar, type, input);
    } else { // no value — ask whether to use a URL or upload a file
      const useUrl = confirm("Click OK to enter a URL, or Cancel to upload an image from your device.");
      if (useUrl) {
        const url = prompt("Enter image URL:");
        if (!url) return; // user dismissed the prompt
        const newEl = createElement({ tag, type, value: url });
        if (newEl) injectElement(newEl, toolbar, type, input);
      } else {
        pendingUploadContext = { toolbar, input, tag }; // save context so the file-change handler knows where to inject
        document.getElementById("imageUpload").click(); // programmatically open the file picker
      }
    }
    return;
  }

  if (type === "video") {
    if (value) {
      const newEl = createElement({ tag, type, value });
      if (newEl) injectElement(newEl, toolbar, type, input);
    } else {
      const useUrl = confirm("Click OK to enter a YouTube URL, or Cancel to upload a video from your device.");
      if (useUrl) {
        const url = prompt("Enter YouTube URL:");
        if (!url) return;
        const newEl = createElement({ tag, type, value: url });
        if (newEl) injectElement(newEl, toolbar, type, input);
      } else {
        pendingVideoUploadContext = { toolbar, input, tag }; // save context for the video file-change handler
        document.getElementById("videoUpload").click(); // open the file picker for videos
      }
    }
    return;
  }

  const selfPrompted = type === "dragAndDrop" || type === "flashcards" || type === "multipleChoice"; // these types collect input via their own prompts
  if (!value && !selfPrompted) return; // skip if input is empty and the type isn't self-prompting

  const newEl = createElement({ tag, type, value });
  if (!newEl) return; // createElement returns null if the user cancelled a prompt
  injectElement(newEl, toolbar, type, input);
}

// ==================================================
// HANDLE EDIT / DELETE ACTIONS
// ==================================================

function handleAction(actionBtn) { // handles a click on an Edit or Delete button inside an element wrapper
  const action  = actionBtn.dataset.action; // "edit" or "delete"
  const wrapper = actionBtn.closest(".element-wrapper"); // find the wrapper this button belongs to
  if (!wrapper) return;

  const element = wrapper.querySelector(".entry") || wrapper.querySelector("#dragObject"); // find the main content element
  const toolbar = wrapper.querySelector(".toolbar"); // find the toolbar inside this wrapper
  if (!element) return;

  if (action === "delete") {
    const idToDelete = element.dataset.id; // capture the ID before removing the element from the DOM
    wrapper.remove(); // remove the entire wrapper from the page

    if (!elementContainer.querySelector(".element-wrapper")) { // if no wrappers remain
      baseToolbar.style.display = "block"; // show the main toolbar again so the user can add something
    }

    fetch("http://localhost:3000/delete", { // tell the server to delete this entry
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ id: idToDelete })
    }).catch(console.error);

    return;
  }

  if (action === "edit") {
    if (element.id === "dragObject") { // drag-and-drop has a special edit flow — it re-prompts for terms and defs
      const newTerms = prompt("Enter new terms (in order, comma separated):");
      const newDefs  = prompt("Enter new definitions (in order, comma separated):");
      if (!newTerms || !newDefs) return; // cancel if either prompt was dismissed

      element.dataset.matched = 0; // reset the match counter since we're replacing all pairs
      element.replaceChildren();   // clear the drop zone

      const oldMatchHeaders = wrapper.querySelector("#matchHeaders");
      if (oldMatchHeaders) oldMatchHeaders.remove(); // remove the old terms/defs columns

      const termsOl = document.createElement("ol");
      termsOl.id = "termsOl";
      const defsOl = document.createElement("ol");
      defsOl.id = "defsOl";

      let tCount = 0;
      newTerms.split(",").map(v => v.trim()).filter(Boolean).forEach(text => { // rebuild the terms list from new input
        const li = document.createElement("li");
        li.draggable = true;
        li.id = `terms${tCount}`;
        li.dataset.originOl    = "termsOl";
        li.dataset.originIndex = tCount;
        li.textContent = text;
        tCount++;
        termsOl.appendChild(li);
      });

      let dCount = 0;
      newDefs.split(",").map(v => v.trim()).filter(Boolean).forEach(text => { // rebuild the defs list from new input
        const li = document.createElement("li");
        li.draggable = true;
        li.id = `defs${dCount}`;
        li.dataset.originOl    = "defsOl";
        li.dataset.originIndex = dCount;
        li.textContent = text;
        dCount++;
        defsOl.appendChild(li);
      });

      element.dataset.totalPairs = tCount; // update the total pairs count to match the new term list

      const termsH = document.createElement("h6");
      termsH.id = "terms";
      termsH.textContent = "Terms";
      termsH.appendChild(termsOl);

      const defsH = document.createElement("h6");
      defsH.id = "defs";
      defsH.textContent = "Definitions";
      defsH.appendChild(defsOl);

      const newMatchHeaders = document.createElement("div");
      newMatchHeaders.id = "matchHeaders";
      newMatchHeaders.appendChild(termsH);
      newMatchHeaders.appendChild(defsH);

      const editOrDeleteNav = wrapper.querySelector("[id^='editOrDelete']"); // find the edit/delete bar to use as an insertion anchor
      wrapper.insertBefore(newMatchHeaders, editOrDeleteNav); // insert the new columns just before the edit/delete bar

      syncAllElements(); // persist the updated drag-and-drop to the server
      return;
    }

    if (!toolbar) return;
    const input = toolbar.querySelector("input");
    if (!input) return;

    if (element.tagName === "IMG" || element.tagName === "IFRAME" || element.tagName === "VIDEO") {
      input.value = element.tagName === "IFRAME"
        ? (element.dataset.watchUrl || element.src) // prefer the original watch URL over the embed URL for iframes
        : element.src; // for img/video just use the src directly
    } else if (element.tagName === "OL") {
      input.value = Array.from(element.children).map(c => c.textContent).join(", "); // rebuild the comma-separated string from the <li> items
    } else if (element.tagName === "LABEL") {
      const select = element.querySelector("select");
      if (select) {
        input.value = Array.from(select.children)
          .filter(c => c.textContent !== "")  // skip the blank placeholder option
          .map(c => c.textContent)
          .join(", "); // rebuild the comma-separated options string
      }
    } else {
      input.value = element.textContent; // for headings and plain text, just copy the text
    }

    editTarget = element; // mark this element as the edit target so injectElement knows to replace it
    input.focus(); // focus the input so the user can start typing immediately
  }
}

// ==================================================
// GLOBAL CLICK HANDLER
// ==================================================

document.addEventListener("click", e => { // single delegated listener that handles all interactive clicks on the page
  const flashcard = e.target.closest("[id^='flashcard']"); // check if the click landed on or inside a flashcard
  if (flashcard && /^flashcard\d+$/.test(flashcard.id)) { // confirm the ID is exactly flashcard<number> (not flashcardsDiv)
    const term = flashcard.children[0]; // first child is the term side
    const def  = flashcard.children[1]; // second child is the definition side
    if (!term || !def) return;

    const showingTerm = term.style.display !== "none"; // true if the term is currently visible
    term.style.display = showingTerm ? "none"  : "block"; // toggle term visibility
    def.style.display  = showingTerm ? "block" : "none";  // toggle definition visibility (opposite of term)

    if (flashcard.dataset.reviewed === "false") { // only process the first time a card is flipped
      flashcard.dataset.reviewed = "true"; // mark this card as seen

      const wrapper = flashcard.closest(".entry"); // find the flashcard set wrapper
      if (wrapper && wrapper._reviewedCards !== undefined) {
        const cardIndex  = parseInt(flashcard.dataset.cardIndex, 10); // get this card's index
        const totalCards = parseInt(wrapper.dataset.totalCards, 10);  // get the set's total card count
        wrapper._reviewedCards.add(cardIndex); // record that this card has been reviewed

        if (wrapper._reviewedCards.size >= totalCards && wrapper.dataset.reviewed === "false") { // all cards have been flipped
          wrapper.dataset.reviewed = "true"; // mark the whole set as reviewed
          markEntryReviewed(wrapper.dataset.id); // notify the server
        }
      }
    }

    return; // don't fall through to other handlers
  }

  const actionBtn = e.target.closest("[data-action]"); // check if the click was on an Edit or Delete button
  if (actionBtn) {
    handleAction(actionBtn); // delegate to the action handler
    return;
  }

  const createBtn = e.target.closest("[data-tag]"); // check if the click was on a toolbar create button
  if (createBtn) {
    const toolbar = createBtn.closest(".toolbar"); // find the toolbar this button belongs to
    if (toolbar) handleCreateElement(createBtn, toolbar); // delegate to the create handler
  }
});

// ==================================================
// IMAGE UPLOAD
// ==================================================

document.getElementById("imageUpload").addEventListener("change", e => { // fires when the user picks an image file
  const file = e.target.files[0]; // get the selected file
  if (!file || !pendingUploadContext) { pendingUploadContext = null; return; } // bail if no file or no context was saved

  const { toolbar, input, tag } = pendingUploadContext; // retrieve the saved toolbar context
  pendingUploadContext = null; // clear it so it's not accidentally reused
  e.target.value = "";         // reset the file input so the same file can be selected again later

  const reader = new FileReader(); // create a FileReader to convert the file to a base64 data URL
  reader.onload = ev => {          // fires when the file has been fully read
    const newEl = createElement({ tag, type: "image", value: ev.target.result }); // build the image element with the base64 data
    if (newEl) injectElement(newEl, toolbar, "image", input); // inject it into the page
  };
  reader.readAsDataURL(file); // start reading the file
});

document.getElementById("videoUpload").addEventListener("change", e => { // fires when the user picks a video file
  const file = e.target.files[0];
  if (!file || !pendingVideoUploadContext) { pendingVideoUploadContext = null; return; }

  const { toolbar, input, tag } = pendingVideoUploadContext; // retrieve the saved video upload context
  pendingVideoUploadContext = null;
  e.target.value = "";

  const reader = new FileReader();
  reader.onload = ev => {
    const newEl = createElement({ tag, type: "video", value: ev.target.result }); // build the video element with base64 data
    if (newEl) injectElement(newEl, toolbar, "video", input);
  };
  reader.readAsDataURL(file); // start reading the video file as a data URL
});

// ==================================================
// MULTIPLE CHOICE — answer checking
// ==================================================

document.addEventListener("change", e => { // fires whenever any <select> on the page changes value
  const select = e.target.closest("select"); // confirm the changed element is a select
  if (!select) return;

  const selected = select.options[select.selectedIndex]; // get the currently chosen option element
  if (!selected || selected.value === "" || selected.textContent === "") return; // ignore the blank placeholder

  const isCorrect = selected.dataset.correct === "true"; // check if the chosen option is tagged as the correct answer
  select.dataset.answered   = isCorrect ? "true" : "false"; // update the answered state on the element
  select.dataset.lastAnswer = selected.textContent;          // store the student's answer text for syncing

  console.log(isCorrect ? "Correct!" : "Incorrect!");
  syncAllElements(); // persist the updated answer state to the server
});

// ==================================================
// DRAG AND DROP
// ==================================================

let draggedEl = null; // holds a reference to the element currently being dragged

document.addEventListener("dragstart", e => { // fires when the user starts dragging an element
  if (!e.target.draggable) return; // ignore elements that aren't explicitly draggable
  draggedEl = e.target; // store the dragged element so the drop handler can access it
});

document.addEventListener("dragover", e => { // fires continuously while a dragged element hovers over the page
  e.preventDefault(); // must prevent default to allow the drop event to fire
});

document.addEventListener("drop", e => { // fires when the user releases a dragged element
  e.preventDefault(); // prevent the browser from navigating or opening the dragged content
  const target = e.target;

  if (target.classList && [...target.classList].some(c => c.startsWith("dragObject"))) { // check if the target is a valid drop zone
    target.appendChild(draggedEl); // move the dragged item into the drop zone
    evaluateDropZone(target); // check if the drop zone now holds a matching pair
  }
});

function returnToPool(item) { // returns a mismatched drag item to its original list in the correct sorted position
  const originOl = document.getElementById(item.dataset.originOl); // find the list this item came from
  if (!originOl) return;

  const targetIndex = parseInt(item.dataset.originIndex, 10); // the item's original position
  const after = [...originOl.children].find(
    s => parseInt(s.dataset.originIndex, 10) > targetIndex // find the first sibling that should come after this item
  );
  if (after) {
    originOl.insertBefore(item, after); // insert before that sibling to restore sorted order
  } else {
    originOl.appendChild(item); // no later sibling exists — append to the end
  }
}

function evaluateDropZone(zone) { // checks whether the drop zone contains one term and one definition, and whether they match
  const children = [...zone.children];
  if (children.length < 2) return; // wait until there are at least two items in the zone

  const extractNum = id => { // pulls the number from IDs like "terms3" or "defs0"
    const match = id.match(/\d+/);
    return match ? parseInt(match[0], 10) : null;
  };

  const terms = children.filter(c => c.id.startsWith("terms")); // items from the terms list
  const defs  = children.filter(c => c.id.startsWith("defs"));  // items from the defs list
  if (!terms.length || !defs.length) return; // need at least one of each to evaluate

  const term    = terms[0]; // take the first term in the zone
  const def     = defs[0];  // take the first definition in the zone
  const termNum = extractNum(term.id); // extract the numeric index from the term's ID
  const defNum  = extractNum(def.id);  // extract the numeric index from the definition's ID

  if (termNum === defNum) { // matching indices mean this is a correct pair
    console.log("Match!");
    zone.dataset.matched = parseInt(zone.dataset.matched || 0, 10) + 1; // increment the matched pair count
    zone.replaceChildren(); // clear the drop zone so the next pair can be dragged in
  } else { // indices don't match — incorrect pairing
    console.log("Incorrect — returning items to pool.");
    returnToPool(term); // send the term back to the terms list
    returnToPool(def);  // send the definition back to the defs list
  }

  syncAllElements(); // persist the updated match state to the server
}
