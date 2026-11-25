const jwt = require("jsonwebtoken");

module.exports = function authenticate(req, res, next) {
  const header = req.headers.authorization;

  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({ status: "error", message: "No token provided" });
  }

  const token = header.split(" ")[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded; // { id, role, email }
    next();
  } catch (err) {
    return res.status(401).json({ status: "error", message: "Invalid or expired token" });
  }
};
