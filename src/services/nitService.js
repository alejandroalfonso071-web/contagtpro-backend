const axios = require("axios");
const cheerio = require("cheerio");
const NodeCache = require("node-cache");

// Cache de 24 horas para resultados NIT (los datos del RTU no cambian frecuentemente)
const cache = new NodeCache({ stdTTL: 86400, checkperiod: 3600 });

const SAT_RTU_URL = "https://portal.sat.gob.gt/portal/consulta-cui-nit/";
const TIMEOUT_MS = 12000;

/**
 * Limpia y normaliza un NIT guatemalteco
 * Acepta: "1234567-8", "12345678", "1234567K", etc.
 */
function normalizarNIT(nit) {
  const clean = (nit || "").toString().trim().toUpperCase().replace(/\s/g, "");
  // Separar dígito verificador
  const match = clean.match(/^(\d+)[-]?([0-9K])$/);
  if (!match) {
    // Intentar extraer solo números
    const nums = clean.replace(/[^0-9K]/g, "");
    if (nums.length >= 5) return nums;
    throw new Error("Formato de NIT inválido. Use: 1234567-8 o 12345678");
  }
  return `${match[1]}${match[2]}`;
}

/**
 * Valida el dígito verificador de un NIT guatemalteco (módulo 11)
 */
function validarDigitoVerificador(nit) {
  const clean = nit.replace(/[^0-9K]/gi, "").toUpperCase();
  if (clean.length < 2) return false;
  const digitos = clean.slice(0, -1);
  const dv = clean.slice(-1);
  let suma = 0;
  for (let i = 0; i < digitos.length; i++) {
    suma += parseInt(digitos[i]) * (digitos.length + 1 - i);
  }
  const residuo = (11 - (suma % 11)) % 11;
  const dvCalculado = residuo === 10 ? "K" : residuo.toString();
  return dv === dvCalculado;
}

/**
 * Consulta el RTU de la SAT para obtener datos del contribuyente.
 * 
 * NOTA TÉCNICA: El portal SAT no tiene API REST oficial. Esta función hace
 * scraping del portal público RTU. En producción puede requerir manejo de
 * cookies de sesión y posiblemente rotación de User-Agent.
 * 
 * URL de consulta pública: https://portal.sat.gob.gt/portal/consulta-cui-nit/
 */
async function consultarNITEnSAT(nitRaw) {
  const nit = normalizarNIT(nitRaw);

  // Verificar caché primero
  const cached = cache.get(nit);
  if (cached) {
    console.log(`[NIT] Cache hit: ${nit}`);
    return { ...cached, fuente: "cache" };
  }

  console.log(`[NIT] Consultando SAT RTU: ${nit}`);

  try {
    // Paso 1: Obtener el token CSRF del portal
    const sessionRes = await axios.get(SAT_RTU_URL, {
      timeout: TIMEOUT_MS,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "es-GT,es;q=0.9",
      },
    });

    const $ = cheerio.load(sessionRes.data);
    const cookies = sessionRes.headers["set-cookie"]?.join("; ") || "";

    // Extraer token CSRF (el portal SAT usa Django con csrfmiddlewaretoken)
    const csrfToken = $("input[name=csrfmiddlewaretoken]").val() ||
                      $("meta[name=csrf-token]").attr("content") || "";

    // Paso 2: Enviar consulta
    const params = new URLSearchParams();
    params.append("csrfmiddlewaretoken", csrfToken);
    params.append("nit", nit);

    const consultaRes = await axios.post(SAT_RTU_URL, params.toString(), {
      timeout: TIMEOUT_MS,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Content-Type": "application/x-www-form-urlencoded",
        "Referer": SAT_RTU_URL,
        "Cookie": cookies,
        "X-CSRFToken": csrfToken,
      },
    });

    const $r = cheerio.load(consultaRes.data);

    // Paso 3: Parsear resultado del HTML
    const resultado = parsearResultadoRTU($r, nit);

    // Guardar en cache
    cache.set(nit, resultado);

    return { ...resultado, fuente: "sat-portal" };

  } catch (err) {
    // Si el portal SAT no responde, usar fallback estructurado
    console.warn(`[NIT] Error consultando SAT (${err.message}), usando modo fallback`);

    if (err.code === "ECONNREFUSED" || err.code === "ETIMEDOUT" || err.response?.status >= 500) {
      throw new Error("El portal SAT no está disponible en este momento. Intenta en unos minutos.");
    }

    throw new Error(`Error al consultar RTU: ${err.message}`);
  }
}

/**
 * Parsea el HTML de respuesta del portal RTU de la SAT.
 * Los selectores CSS pueden cambiar si SAT actualiza su portal.
 */
function parsearResultadoRTU($, nit) {
  // El portal SAT muestra los datos en una tabla con clase específica
  // Estos selectores corresponden al portal actual (2024-2025)
  
  const textoCompleto = $.root().text().toLowerCase();
  
  // Detectar si el NIT no existe
  if (textoCompleto.includes("no existe") || textoCompleto.includes("no encontrado") || textoCompleto.includes("no registrado")) {
    return {
      nit,
      existe: false,
      nombre: null,
      estado: "NO REGISTRADO",
      tipo: null,
      regimen: null,
      actividad: null,
      direccion: null,
    };
  }

  // Extraer datos de la tabla de resultados
  // El portal SAT usa diferentes estructuras según la versión
  const filas = {};
  $("table tr, .resultado-rtu tr, .datos-contribuyente tr").each((_, tr) => {
    const celdas = $(tr).find("td");
    if (celdas.length >= 2) {
      const key = $(celdas[0]).text().trim().toLowerCase();
      const val = $(celdas[1]).text().trim();
      if (key && val) filas[key] = val;
    }
  });

  // Intentar extracción por selectores específicos del portal SAT
  const nombre = filas["nombre"] || filas["razón social"] || filas["razon social"] ||
                 $(".nombre-contribuyente, #nombre, [data-field='nombre']").first().text().trim() ||
                 extraerPorPatron($, /nombre[:\s]+([^\n]+)/i);

  const estado = filas["estado"] || filas["situación"] ||
                 $(".estado-contribuyente, .situacion").first().text().trim() || "ACTIVO";

  const regimen = filas["régimen"] || filas["regimen"] || filas["régimen tributario"] ||
                  $(".regimen").first().text().trim() || "No disponible";

  const actividad = filas["actividad"] || filas["actividad económica"] ||
                    $(".actividad").first().text().trim() || "No disponible";

  const direccion = filas["dirección"] || filas["direccion"] || filas["domicilio fiscal"] ||
                    $(".direccion").first().text().trim() || "No disponible";

  const tipo = filas["tipo"] || filas["tipo de persona"] ||
               (nombre?.length > 40 ? "Jurídico" : "Natural");

  return {
    nit,
    existe: true,
    nombre: nombre || "No disponible",
    estado: estado.toUpperCase().includes("ACTIVO") ? "ACTIVO" :
            estado.toUpperCase().includes("SUSPENDIDO") ? "SUSPENDIDO" :
            estado.toUpperCase().includes("CANCELADO") ? "CANCELADO" : estado.toUpperCase(),
    tipo: tipo?.includes("jurídico") || tipo?.includes("juridico") || tipo?.includes("SA") || tipo?.includes("S.A") ? "Jurídico" : "Natural",
    regimen: regimen || "No disponible",
    actividad: actividad || "No disponible",
    direccion: direccion || "No disponible",
    dvValido: validarDigitoVerificador(nit),
  };
}

function extraerPorPatron($, patron) {
  const texto = $.root().text();
  const match = texto.match(patron);
  return match ? match[1].trim() : null;
}

module.exports = { consultarNITEnSAT, normalizarNIT, validarDigitoVerificador };
