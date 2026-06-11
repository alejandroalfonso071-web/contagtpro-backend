const express = require("express");
const router = express.Router();
const { generarFlatIVA, generarFlatISR, generarFlatISO } = require("../services/flatService");

// Helper para enviar el archivo como descarga o como JSON
function responderFlat(res, resultado, comoDescarga) {
  if (comoDescarga) {
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${resultado.nombreArchivo}"`);
    res.setHeader("X-Periodo", resultado.periodo);
    res.setHeader("X-Archivo", resultado.nombreArchivo);
    return res.send(resultado.contenido);
  }
  res.json({
    ok: true,
    timestamp: new Date().toISOString(),
    nombreArchivo: resultado.nombreArchivo,
    periodo: resultado.periodo,
    resumen: resultado.resumen,
    contenido: resultado.contenido, // base64 para el frontend
    contenidoBase64: Buffer.from(resultado.contenido).toString("base64"),
  });
}

/**
 * POST /api/flat/iva
 * Genera archivo FLAT para Declaraguate — Formulario SAT-1311 (IVA Mensual)
 * 
 * Body:
 * {
 *   nit: "1234567-8",
 *   nombre: "EMPRESA S.A.",
 *   mes: 0,              // 0=Enero, 11=Diciembre
 *   anio: 2025,
 *   baseVentas: 100000,
 *   ivaVentas: 12000,
 *   ventasExentas: 0,
 *   exportaciones: 0,
 *   baseCompras: 80000,
 *   ivaCompras: 9600,
 *   importaciones: 0,
 *   ivaImportaciones: 0,
 *   remanenteMesPrevio: 0,
 *   multas: 0,
 *   intereses: 0,
 *   descarga: true       // si true: devuelve .txt; si false: devuelve JSON con base64
 * }
 */
router.post("/iva", (req, res) => {
  try {
    const resultado = generarFlatIVA(req.body);
    responderFlat(res, resultado, req.body.descarga === true);
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

/**
 * POST /api/flat/isr
 * Genera archivo FLAT para Declaraguate — Formulario SAT-1361 (ISR Trimestral)
 * 
 * Body:
 * {
 *   nit, nombre, anio, trimestre: 1|2|3|4,
 *   totalIngresos, ingresosExentos,
 *   totalCostos, gastosDedudibles, depreciaciones,
 *   isrRetenido, isrPagadoTrimestres,
 *   regimen: "utilidades" | "opcional",
 *   multas, intereses,
 *   descarga: true|false
 * }
 */
router.post("/isr", (req, res) => {
  try {
    const resultado = generarFlatISR(req.body);
    responderFlat(res, resultado, req.body.descarga === true);
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

/**
 * POST /api/flat/iso
 * Genera archivo FLAT para Declaraguate — Formulario SAT-2800 (ISO Trimestral)
 * 
 * Body:
 * {
 *   nit, nombre, anio, trimestre: 1|2|3|4,
 *   ingresosBrutos, activoNeto,
 *   isoAcreditadoISR,
 *   multas, intereses,
 *   descarga: true|false
 * }
 */
router.post("/iso", (req, res) => {
  try {
    const resultado = generarFlatISO(req.body);
    responderFlat(res, resultado, req.body.descarga === true);
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

/**
 * POST /api/flat/paquete
 * Genera los tres archivos (IVA + ISR + ISO) en una sola llamada
 * Útil para el cierre mensual completo del contador
 * 
 * Body: { datosIVA: {...}, datosISR: {...}, datosISO: {...} }
 */
router.post("/paquete", (req, res) => {
  const { datosIVA, datosISR, datosISO } = req.body;
  const errores = [];
  const archivos = {};

  if (datosIVA) {
    try { archivos.iva = generarFlatIVA(datosIVA); }
    catch (e) { errores.push({ formulario: "IVA", error: e.message }); }
  }
  if (datosISR) {
    try { archivos.isr = generarFlatISR(datosISR); }
    catch (e) { errores.push({ formulario: "ISR", error: e.message }); }
  }
  if (datosISO) {
    try { archivos.iso = generarFlatISO(datosISO); }
    catch (e) { errores.push({ formulario: "ISO", error: e.message }); }
  }

  res.json({
    ok: errores.length === 0,
    timestamp: new Date().toISOString(),
    errores: errores.length > 0 ? errores : undefined,
    archivos: {
      iva: archivos.iva ? {
        nombreArchivo: archivos.iva.nombreArchivo,
        resumen: archivos.iva.resumen,
        contenidoBase64: Buffer.from(archivos.iva.contenido).toString("base64"),
      } : null,
      isr: archivos.isr ? {
        nombreArchivo: archivos.isr.nombreArchivo,
        resumen: archivos.isr.resumen,
        contenidoBase64: Buffer.from(archivos.isr.contenido).toString("base64"),
      } : null,
      iso: archivos.iso ? {
        nombreArchivo: archivos.iso.nombreArchivo,
        resumen: archivos.iso.resumen,
        contenidoBase64: Buffer.from(archivos.iso.contenido).toString("base64"),
      } : null,
    },
  });
});

module.exports = router;
