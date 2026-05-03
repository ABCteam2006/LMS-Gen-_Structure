// if a user is already logged in, skip the login page entirely
if (sessionStorage.getItem("user")) {
  window.location.replace("/curriculum.html"); // send them straight to the curriculum picker
}

const usernameInput = document.getElementById("username");   // the username text field
const passwordInput = document.getElementById("password");   // the password text field
const loginButton   = document.getElementById("loginButton"); // the Login button
const loginMessage  = document.getElementById("loginMessage"); // the div that shows error/status text

loginButton.addEventListener("click", async () => { // listen for a click on the login button
  const username = usernameInput.value.trim(); // read the username and strip surrounding whitespace
  const password = passwordInput.value.trim(); // read the password and strip surrounding whitespace

  if (!username || !password) { // if either field is empty, don't attempt a login
    loginMessage.textContent = "Please enter both username and password."; // show a validation message
    return; // stop here
  }

  try {
    const response = await fetch("/login", { // send a POST request to the /login endpoint
      method: "POST",
      credentials: "include",                          // include cookies so the server can set a session cookie
      headers: { "Content-Type": "application/json" }, // tell the server we're sending JSON
      body: JSON.stringify({ username, password })     // serialize the credentials as the request body
    });

    const data = await response.json(); // parse the server's JSON response

    if (data.success) { // server confirmed the credentials are correct
      sessionStorage.setItem("user", username); // store the username so other pages know someone is logged in
      window.location.assign("/curriculum.html"); // navigate to the curriculum picker
    } else { // credentials were wrong or another server-side error occurred
      loginMessage.textContent = data.message || "Invalid username or password."; // show the server's message or a fallback
    }

  } catch (err) { // something went wrong with the network request itself
    loginMessage.textContent = "Login failed: " + err.message; // show the error on screen
    console.error("Login error:", err); // also log the full error object to the console
  }
});
