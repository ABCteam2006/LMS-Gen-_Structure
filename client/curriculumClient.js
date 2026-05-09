// curriculumClient.js

// if no user is stored in sessionStorage the person isn't logged in
if (!sessionStorage.getItem("user")) {
  window.location.replace("/login.html"); // redirect to login
}

const select           = document.getElementById("select");          // the <select> dropdown listing all curricula
const pickBtn          = document.getElementById("pickCurriculum");  // "Open" button that loads the selected curriculum
const toggleRename     = document.getElementById("toggleRename");    // button that shows/hides the rename form
const renameForm       = document.getElementById("renameForm");      // the rename/recolor form container div
const renameNameInput  = document.getElementById("renameName");      // text input for a new curriculum name
const renameThemeInput = document.getElementById("renameTheme");     // color picker for the curriculum theme
const saveRenameBtn    = document.getElementById("saveRename");      // "Save" button inside the rename form
const newNameInput     = document.getElementById("newName");         // text input for naming a brand-new curriculum
const newThemeInput    = document.getElementById("newTheme");        // color picker for a new curriculum's theme
const genBtn           = document.getElementById("genCurriculum");   // "Create" button that generates a new curriculum

let curriculumList      = []; // holds all curricula fetched from the server as [{ id, name, theme }]
let currentCurriculumID = null; // tracks which curriculum is currently selected in the dropdown
let highestCurriculumID = null; // tracks the largest existing ID so new curricula get the next one up

async function loadCurriculum() { // fetches the user's curricula from the server and populates the dropdown
  try {
    const res = await fetch("/curriculum", { credentials: "include" }); // GET /curriculum, sending the session cookie
    if (!res.ok) { // if the server returned an error status
      if (res.status === 401) { sessionStorage.removeItem("user"); window.location.assign("/login.html"); } // 401 = not logged in; clear session and redirect
      return; // stop processing on any other error too
    }

    const data = await res.json(); // parse the JSON response body
    curriculumList = data.curriculums; // store the array of curriculum objects locally

    if (curriculumList.length === 0) { // if the user has no curricula yet
      window.location.assign("http://localhost:3000/?curriculum=1"); // send them to the editor with a default curriculum
      return; // stop further processing
    }

    select.innerHTML = ""; // clear any existing options before repopulating
    curriculumList.forEach(c => { // build one <option> per curriculum
      const option = document.createElement("option");
      option.value = c.id;           // the option's value is the curriculum's ID
      option.textContent = c.name;   // the visible label is the curriculum's name
      select.appendChild(option);    // add it to the dropdown
    });

    currentCurriculumID = curriculumList[0].id; // default selection is the first curriculum
    highestCurriculumID = Math.max(...curriculumList.map(c => c.id)); // find the largest ID for generating the next one
    syncRenameForm(); // pre-fill the rename form with the selected curriculum's current data
    renderQuickAccess(); // populate the most-recent and most-opened quick-access buttons
  } catch (e) {
    console.error("ERROR loading curriculum:", e); // log any unexpected network or parse errors
  }
}

function syncRenameForm() { // updates the rename form inputs to reflect whichever curriculum is selected
  const c = curriculumList.find(c => c.id == currentCurriculumID); // find the matching curriculum object
  if (!c) return; // bail if it somehow isn't found
  renameNameInput.value  = c.name;  // pre-fill the name input with the current name
  renameThemeInput.value = c.theme; // pre-fill the color picker with the current theme color
}

select.addEventListener("change", () => { // fires whenever the user picks a different curriculum from the dropdown
  currentCurriculumID = parseInt(select.value, 10); // update the tracked ID to the new selection
  syncRenameForm(); // update the rename form to match
});

function openCurriculum(id) { // records the open event then navigates to the editor
  fetch("/curriculum/open", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ curriculumID: id })
  }).catch(() => {}); // fire-and-forget; don't block navigation on failure
  window.location.assign(`http://localhost:3000/?curriculum=${id}`);
}

function renderQuickAccess() { // shows most-recent and most-opened quick-access buttons based on tracking data
  const withOpens  = curriculumList.filter(c => c.openCount > 0);
  const withRecent = curriculumList.filter(c => c.lastOpened);

  const mostOpened = withOpens.reduce((a, b) => (b.openCount > a.openCount ? b : a), withOpens[0] || null);
  const mostRecent = withRecent.reduce((a, b) => (b.lastOpened > a.lastOpened ? b : a), withRecent[0] || null);

  const quickAccess    = document.getElementById("quickAccess");
  const mostRecentRow  = document.getElementById("mostRecentRow");
  const mostOpenedRow  = document.getElementById("mostOpenedRow");
  const mostRecentBtn  = document.getElementById("mostRecentBtn");
  const mostOpenedBtn  = document.getElementById("mostOpenedBtn");

  if (mostRecent) {
    mostRecentBtn.textContent = mostRecent.name;
    mostRecentBtn.onclick = () => openCurriculum(mostRecent.id);
    mostRecentRow.style.display = "flex";
  }

  if (mostOpened) {
    mostOpenedBtn.textContent = `${mostOpened.name} (${mostOpened.openCount}×)`;
    mostOpenedBtn.onclick = () => openCurriculum(mostOpened.id);
    mostOpenedRow.style.display = "flex";
  }

  if (mostRecent || mostOpened) quickAccess.style.display = "block";
}

pickBtn.addEventListener("click", () => { // fires when the user clicks "Open"
  if (!currentCurriculumID) return alert("Please select a curriculum first."); // guard: nothing selected yet
  openCurriculum(currentCurriculumID);
});

toggleRename.addEventListener("click", () => { // fires when the user clicks "Rename / Recolor"
  renameForm.style.display = renameForm.style.display === "none" ? "block" : "none"; // toggle the form's visibility
});

saveRenameBtn.addEventListener("click", async () => { // fires when the user clicks "Save" inside the rename form
  const name  = renameNameInput.value.trim(); // read and trim the new name
  const theme = renameThemeInput.value;       // read the chosen theme color
  if (!name) return alert("Please enter a name."); // require a non-empty name

  await fetch("/curriculum/meta", { // POST the updated name and theme to the server
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ curriculumID: currentCurriculumID, name, theme }) // include the ID plus the new values
  });

  const c = curriculumList.find(c => c.id == currentCurriculumID); // find the matching entry in the local list
  if (c) { c.name = name; c.theme = theme; } // update it in memory so the UI stays in sync without a refetch

  const option = [...select.options].find(o => parseInt(o.value, 10) === currentCurriculumID); // find the matching <option> in the dropdown
  if (option) option.textContent = name; // update the visible label to show the new name

  renameForm.style.display = "none"; // hide the rename form after saving
});

genBtn.addEventListener("click", async () => { // fires when the user clicks "Create"
  const name  = newNameInput.value.trim(); // read and trim the new curriculum name
  const theme = newThemeInput.value;       // read the chosen theme color
  if (!name) return alert("Please enter a name for the new curriculum."); // require a name before creating

  const nextID = highestCurriculumID ? highestCurriculumID + 1 : 1; // assign an ID one above the current max, or 1 if none exist

  await fetch("/curriculum/meta", { // POST the new curriculum to the server
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ curriculumID: nextID, name, theme }) // send the generated ID, name, and theme
  });

  openCurriculum(nextID); // navigate directly to the new curriculum's editor
});

window.addEventListener("DOMContentLoaded", loadCurriculum); // wait for the HTML to fully load before fetching curricula
