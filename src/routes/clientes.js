const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");
const { pool } = require("../services/dbService");

const JWT_SECRET = process.env.JWT_SECRET || "contagtpro-secret-2025";

function verifyToken(req, res, next) {
  const token = req.headers["authorization"]?.split(" ")[1];
  if (!token) return res.status(401).json({ error: "Token requerido" });
  try { req.user = jwt.verify(token, JWT_SECRET); next(); }
  catch { res.status(401).json({ error: "Token inválido" }); }
}

// GET clientes del contador
router.get("/", verifyToken, async (req, res) => {
  try {
    const r = await pool.query(
      "SELECT * FROM clientes WHERE contador_id = $1 ORDER BY fecha_creacion DESC",
      [req.user.id]
    );
    res.json({ ok: true, clientes: r.rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST crear cliente
router.post("/", verifyToken, async (req, res) => {
  const { nombre, nit, regimen, sector, direccion, telefono, email, actividad } = req.body;
  if (!nombre || !nit) return res.status(400).json({ error: "Nombre y NIT son requeridos" });
  try {
    const r = await pool.query(
      `INSERT INTO clientes (contador_id, nombre, nit, regimen, sector, direccion, telefono, email, actividad)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [req.user.id, nombre, nit, regimen||"general", sector||"", direccion||"", telefono||"", email||"", actividad||""]
    );
    res.json({ ok: true, cliente: r.rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE eliminar cliente
router.delete("/:id", verifyToken, async (req, res) => {
  try {
    await pool.query("DELETE FROM clientes WHERE id = $1 AND contador_id = $2", [req.params.id, req.user.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET declaraciones de un cliente
router.get("/:clienteId/declaraciones", verifyToken, async (req, res) => {
  try {
    const r = await pool.query(
      "SELECT * FROM declaraciones WHERE cliente_id = $1 AND contador_id = $2 ORDER BY anio DESC, mes DESC NULLS LAST",
      [req.params.clienteId, req.user.id]
    );
    res.json({ ok: true, declaraciones: r.rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST guardar declaración certificada
router.post("/:clienteId/declaraciones", verifyToken, async (req, res) => {
  const d = req.body;
  try {
    const r = await pool.query(
      `INSERT INTO declaraciones (cliente_id, contador_id, tipo, mes, anio, trimestre,
        base_ventas, iva_ventas, base_compras, iva_compras, remanente_anterior, remanente_cf,
        retenciones_iva, retenciones_isr, iva_pagar, isr_determinado, isr_pagado, isr_neto,
        iso_determinado, iso_pagado, iso_neto, utilidad, estado, certificado_por, numero_declaracion)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25)
       RETURNING *`,
      [req.params.clienteId, req.user.id, d.tipo, d.mes, d.anio, d.trimestre||null,
       d.base_ventas||0, d.iva_ventas||0, d.base_compras||0, d.iva_compras||0,
       d.remanente_anterior||0, d.remanente_cf||0, d.retenciones_iva||0, d.retenciones_isr||0,
       d.iva_pagar||0, d.isr_determinado||0, d.isr_pagado||0, d.isr_neto||0,
       d.iso_determinado||0, d.iso_pagado||0, d.iso_neto||0, d.utilidad||0,
       "certificada", d.certificado_por||"", d.numero_declaracion||""]
    );
    // Actualizar última declaración del cliente
    await pool.query(
      "UPDATE clientes SET ultima_declaracion = $1 WHERE id = $2",
      [`${["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"][d.mes||0]} ${d.anio}`, req.params.clienteId]
    );
    res.json({ ok: true, declaracion: r.rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;