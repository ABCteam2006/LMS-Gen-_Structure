import session from "express-session";

const sessionMiddleware = session({
  secret: process.env.SECRET || "dev-secret-change-this", // signs the session cookie to prevent tampering; "dev-secret-change-this" is just a hardcoded fallback for local development — in production, process.env.SECRET should be set to a long random string so attackers can't forge valid session cookies
  resave: false,            // don't re-save the session on every request if nothing changed
  saveUninitialized: false, // don't create a session cookie until the user actually logs in
  name: "sess",             // the name of the cookie sent to the browser
  cookie: {
    httpOnly: true,                                    // blocks JS from reading the cookie, protecting against XSS
    secure: process.env.NODE_ENV === "production",     // only send cookie over HTTPS in production
    sameSite: "strict",                                // blocks the cookie from being sent on cross-site requests, preventing CSRF
    maxAge: 24 * 60 * 60 * 1000                       // cookie expires after 24 hours (in milliseconds)
  }
});

export default sessionMiddleware;
