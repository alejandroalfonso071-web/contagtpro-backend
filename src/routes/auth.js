const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { pool } = require("../services/dbService");

const JWT_SECRET = process.env.JWT_SECRET || "contagtpro-secret-2025";

// LOGIN
router.post("/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: "Email y contraseña requeridos" });
  try {
    const result = await pool.query("SELECT * FROM contadores WHERE email = $1", [email.toLowerCase()]);
    const user = result.rows[0];
    if (!user) return res.status(401).json({ error: "Credenciales incorrectas" });
    if (user.estado === "suspendido") return res.status(403).json({ error: "Cuenta suspendida. Contacta al administrador." });
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ error: "Credenciales incorrectas" });
    const token = jwt.sign({ id: user.id, email: user.email, rol: user.rol }, JWT_SECRET, { expiresIn: "7d" });
    res.json({ ok: true, token, usuario: { id: user.id, nombre: user.nombre, email: user.email, plan: user.plan, rol: user.rol, colegiado: user.colegiado, estado: user.estado } });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// REGISTRO
router.post("/registro", async (req, res) => {
  const { nombre, email, password, colegiado, telefono, plan } = req.body;
  if (!nombre || !email || !password) return res.status(400).json({ error: "Nombre, email y contraseña son requeridos" });
  try {
    const existe = await pool.query("SELECT id FROM contadores WHERE email = $1", [email.toLowerCase()]);
    if (existe.rows.length > 0) return res.status(400).json({ error: "Este correo ya está registrado" });
    const hash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      "INSERT INTO contadores (nombre, email, password, colegiado, telefono, plan, estado, rol) VALUES ($1, $2, $3, $4, $5, $6, 'trial', 'contador') RETURNING *",
      [nombre, email.toLowerCase(), hash, colegiado || "", telefono || "", plan || "basico"]
    );
    const user = result.rows[0];
    const token = jwt.sign({ id: user.id, email: user.email, rol: user.rol }, JWT_SECRET, { expiresIn: "7d" });
    res.json({ ok: true, token, usuario: { id: user.id, nombre: user.nombre, email: user.email, plan: user.plan, rol: user.rol, colegiado: user.colegiado } });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;