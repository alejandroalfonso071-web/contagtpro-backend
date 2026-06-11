const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { pool } = require("../services/dbService");

const JWT_SECRET = process.env.JWT_SECRET || "contagtpro-secret-2025";

// Middleware verificar admin
function verifyAdmin(req, res, next) {
  const token = req.headers["authorization"]?.split(" ")[1];
  if (!token) return res.status(401).json({ error: "Token requerido" });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded.rol !== "admin") return res.status(403).json({ error: "Acceso solo para administradores" });
    req.user = decoded;
    next();
  } catch {
    res.status(401).json({ error: "Token inválido" });
  }
}

// GET todos los contadores
router.get("/contadores", verifyAdmin, async (req, res) => {
  try {
    const result = await pool.query("SELECT id, nombre, email, plan, estado, rol, colegiado, telefono, clientes_count, declaraciones_mes, fecha_registro FROM contadores ORDER BY fecha_registro DESC");
    res.json({ ok: true, contadores: result.rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST crear contador
router.post("/contadores", verifyAdmin, async (req, res) => {
  const { nombre, email, password, colegiado, telefono, plan } = req.body;
  if (!nombre || !email || !password) return res.status(400).json({ error: "Nombre, email y contraseña requeridos" });
  try {
    const existe = await pool.query("SELECT id FROM contadores WHERE email = $1", [email.toLowerCase()]);
    if (existe.rows.length > 0) return res.status(400).json({ error: "Este correo ya está registrado" });
    const hash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      "INSERT INTO contadores (nombre, email, password, colegiado, telefono, plan, estado, rol) VALUES ($1, $2, $3, $4, $5, $6, 'activo', 'contador') RETURNING *",
      [nombre, email.toLowerCase(), hash, colegiado || "", telefono || "", plan || "basico"]
    );
    res.json({ ok: true, contador: result.rows[0] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PUT actualizar plan o estado
router.put("/contadores/:id", verifyAdmin, async (req, res) => {
  const { id } = req.params;
  const { plan, estado } = req.body;
  try {
    const fields = [];
    const values = [];
    let i = 1;
    if (plan) { fields.push(`plan = $${i++}`); values.push(plan); }
    if (estado) { fields.push(`estado = $${i++}`); values.push(estado); }
    if (!fields.length) return res.status(400).json({ error: "Nada que actualizar" });
    values.push(id);
    await pool.query(`UPDATE contadores SET ${fields.join(", ")} WHERE id = $${i}`, values);
    res.json({ ok: true, mensaje: "Contador actualizado" });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE eliminar contador
router.delete("/contadores/:id", verifyAdmin, async (req, res) => {
  try {
    await pool.query("DELETE FROM contadores WHERE id = $1", [req.params.id]);
    res.json({ ok: true, mensaje: "Contador eliminado" });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;