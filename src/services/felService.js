const axios = require("axios");
const cheerio = require("cheerio");
const NodeCache = require("node-cache");

// Cache de 1 hora para FEL (las facturas pueden anularse)
const cache = new NodeCache({ stdTTL: 3600, checkperiod: 600 });

/**
 * URLs de consulta FEL de la SAT Guatemala.
 * 
 * La SAT tiene múltiples URLs de consulta pública de DTE:
 * - Portal principal: https://fel.sat.gob.gt/
 * - Consulta directa: https://fel.sat.gob.gt/fel/gt/doc/verify/
 * - API certificadores: Cada certificador (INFILE, Megaprint, etc.) tiene su propio endpoint
 */
const FEL_BASE_URL = "https://fel.sat.gob.gt";
const FEL_VERIFY_URL = `${FEL_BASE_URL}/fel/gt/doc/verify/`;
const TIMEOUT_MS = 10000;

/**
 * Limpia y valida el formato de un UUID FEL.
 * Formato: XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX (8-4-4-4-12)
 */
function validarFormatoUUID(uuid) {
  const clean = (uuid || "").trim().toUpperCase().replace(/\s/g, "");
  const uuidRegex = /^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/;
  if (!uuidRegex.test(clean)) {
    // Intentar reconstruir si viene sin guiones
    const sinGuiones = clean.replace(/-/g, "");
    if (sinGuiones.length === 32 && /^[0-9A-F]+$/.test(sinGuiones)) {
      return `${sinGuiones.slice(0,8)}-${sinGuiones.slice(8,12)}-${sinGuiones.slice(12,16)}-${sinGuiones.slice(16,20)}-${sinGuiones.slice(20)}`;
    }
    throw new Error("UUID inválido. Formato esperado: XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX");
  }
  return clean;
}

/**
 * Consulta el estado de una factura FEL en el portal SAT.
 * 
 * NOTA: La SAT Guatemala tiene el portal FEL en https://fel.sat.gob.gt
 * La consulta pública permite verificar cualquier DTE con su UUID.
 * En caso de que el portal no responda, hay endpoints alternativos
 * por certificador (INFILE: api.infile.com.gt, Megaprint: megaprint.com.gt, etc.)
 */
async function validarFELEnSAT(uuidRaw) {
  const uuid = validarFormatoUUID(uuidRaw);

  // Verificar caché
  const cached = cache.get(uuid);
  if (cached) {
    console.log(`[FEL] Cache hit: ${uuid}`);
    return { ...cached, fuente: "cache" };
  }

  console.log(`[FEL] Consultando SAT FEL: ${uuid}`);

  try {
    // Consulta al portal FEL de la SAT
    const response = await axios.get(`${FEL_VERIFY_URL}${uuid}`, {
      timeout: TIMEOUT_MS,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept": "application/json, text/html, */*",
        "Accept-Language": "es-GT,es;q=0.9",
        "Referer": `${FEL_BASE_URL}/`,
      },
    });

    let resultado;

    // El portal puede responder con JSON o HTML
    const contentType = response.headers["content-type"] || "";
    if (contentType.includes("application/json")) {
      resultado = parsearRespuestaJSON(response.data, uuid);
    } else {
      resultado = parsearRespuestaHTML(response.data, uuid);
    }

    // Cache solo si está certificada (las anuladas pueden reactivarse)
    if (resultado.estado === "CERTIFICADA") {
      cache.set(uuid, resultado);
    }

    return { ...resultado, fuente: "sat-fel" };

  } catch (err) {
    if (err.response?.status === 404) {
      return {
        uuid,
        estado: "NO ENCONTRADA",
        existe: false,
        mensaje: "El UUID no existe en el sistema FEL de la SAT",
        fuente: "sat-fel",
      };
    }

    if (err.code === "ECONNREFUSED" || err.code === "ETIMEDOUT") {
      throw new Error("El portal FEL de la SAT no está disponible. Intenta más tarde.");
    }

    throw new Error(`Error al validar FEL: ${err.message}`);
  }
}

/**
 * Parsea respuesta JSON del portal FEL
 * La SAT devuelve campos en español con nombres específicos
 */
function parsearRespuestaJSON(data, uuid) {
  const estado = (data.estado || data.status || data.Estado || "").toUpperCase();

  return {
    uuid,
    existe: true,
    estado: mapearEstado(estado),
    tipo: data.tipo_dte || data.tipoDTE || data.Tipo || "FACTURA",
    serie: data.serie || data.Serie || "",
    numero: data.numero || data.Numero || "",
    nitEmisor: data.nit_emisor || data.nitEmisor || data.NIT_Emisor || "",
    nombreEmisor: data.nombre_emisor || data.nombreEmisor || "",
    nitReceptor: data.nit_receptor || data.nitReceptor || "CF",
    nombreReceptor: data.nombre_receptor || data.nombreReceptor || "CONSUMIDOR FINAL",
    fechaEmision: data.fecha_emision || data.fechaEmision || "",
    fechaCertificacion: data.fecha_certificacion || data.fechaCertificacion || "",
    moneda: data.moneda || data.Moneda || "GTQ",
    totalSinImpuestos: parseFloat(data.total_sin_impuestos || data.totalSinImpuestos || 0),
    totalImpuestos: parseFloat(data.total_impuestos || data.totalImpuestos || 0),
    totalConImpuestos: parseFloat(data.total_con_impuestos || data.totalConImpuestos || data.total || 0),
    certificador: data.certificador || data.Certificador || "No disponible",
  };
}

/**
 * Parsea respuesta HTML del portal FEL
 */
function parsearRespuestaHTML(html, uuid) {
  const $ = cheerio.load(html);
  const texto = $.root().text().toLowerCase();

  // Detectar si la factura no existe
  if (texto.includes("no encontrado") || texto.includes("no existe") || texto.includes("invalid")) {
    return { uuid, existe: false, estado: "NO ENCONTRADA", mensaje: "UUID no registrado en SAT" };
  }

  const filas = {};
  $("table tr").each((_, tr) => {
    const celdas = $(tr).find("td, th");
    if (celdas.length >= 2) {
      const key = $(celdas[0]).text().trim().toLowerCase().replace(/[:\s]+$/, "");
      const val = $(celdas[1]).text().trim();
      if (key && val) filas[key] = val;
    }
  });

  const estadoTexto = filas["estado"] || filas["situación"] || filas["estatus"] || "";

  return {
    uuid,
    existe: true,
    estado: mapearEstado(estadoTexto.toUpperCase()),
    tipo: filas["tipo"] || filas["tipo dte"] || filas["tipo de documento"] || "FACTURA",
    serie: filas["serie"] || "",
    numero: filas["número"] || filas["numero"] || "",
    nitEmisor: filas["nit emisor"] || filas["nit del emisor"] || "",
    nombreEmisor: filas["nombre emisor"] || filas["razón social emisor"] || "",
    nitReceptor: filas["nit receptor"] || "CF",
    nombreReceptor: filas["nombre receptor"] || "CONSUMIDOR FINAL",
    fechaEmision: filas["fecha emisión"] || filas["fecha emision"] || "",
    fechaCertificacion: filas["fecha certificación"] || filas["fecha certificacion"] || "",
    moneda: filas["moneda"] || "GTQ",
    totalSinImpuestos: parseFloat((filas["total sin impuestos"] || "0").replace(/[^0-9.]/g, "")),
    totalImpuestos: parseFloat((filas["total impuestos"] || filas["iva"] || "0").replace(/[^0-9.]/g, "")),
    totalConImpuestos: parseFloat((filas["total"] || filas["gran total"] || "0").replace(/[^0-9.]/g, "")),
    certificador: filas["certificador"] || "No disponible",
  };
}

function mapearEstado(estado) {
  if (estado.includes("CERTIF") || estado.includes("VALID") || estado.includes("ACTIV") || estado === "1" || estado === "OK") return "CERTIFICADA";
  if (estado.includes("ANUL") || estado.includes("CANCEL") || estado === "0") return "ANULADA";
  if (estado.includes("PEND")) return "PENDIENTE";
  return estado || "DESCONOCIDO";
}

/**
 * Valida múltiples UUIDs en paralelo (máximo 20 para no sobrecargar SAT)
 */
async function validarLoteFEL(uuids) {
  if (!Array.isArray(uuids) || uuids.length === 0) throw new Error("Se requiere al menos un UUID");
  if (uuids.length > 20) throw new Error("Máximo 20 UUIDs por lote");

  // Procesar en grupos de 5 para no saturar el portal SAT
  const resultados = [];
  const grupos = [];
  for (let i = 0; i < uuids.length; i += 5) grupos.push(uuids.slice(i, i + 5));

  for (const grupo of grupos) {
    const promesas = grupo.map(async (uuid) => {
      try {
        return await validarFELEnSAT(uuid);
      } catch (err) {
        return { uuid, estado: "ERROR", error: err.message, existe: false };
      }
    });
    const grupoResultados = await Promise.all(promesas);
    resultados.push(...grupoResultados);

    // Pequeña pausa entre grupos para no sobrecargar SAT
    if (grupos.indexOf(grupo) < grupos.length - 1) {
      await new Promise(r => setTimeout(r, 500));
    }
  }

  return resultados;
}

module.exports = { validarFELEnSAT, validarLoteFEL, validarFormatoUUID };
