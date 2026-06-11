# ContaGT Pro — Backend SAT Guatemala

Backend Node.js/Express que actúa como proxy seguro entre el frontend ContaGT Pro y los portales oficiales de la SAT Guatemala (RTU, FEL, Declaraguate).

## 🚀 Despliegue en Railway (paso a paso)

### 1. Preparar el repositorio

```bash
# Crea un repositorio en GitHub
git init
git add .
git commit -m "ContaGT Pro Backend v1.0"
git remote add origin https://github.com/TU_USUARIO/contagtpro-backend.git
git push -u origin main
```

### 2. Crear proyecto en Railway

1. Ve a **[railway.app](https://railway.app)** e inicia sesión con GitHub
2. Clic en **"New Project"** → **"Deploy from GitHub repo"**
3. Selecciona el repositorio `contagtpro-backend`
4. Railway detecta automáticamente que es Node.js y despliega

### 3. Configurar variables de entorno en Railway

En el panel de Railway → tu servicio → **"Variables"**, agrega:

| Variable | Valor |
|---|---|
| `NODE_ENV` | `production` |
| `API_KEY` | *(genera con el comando de abajo)* |
| `ALLOWED_ORIGINS` | URL de tu frontend (ej: `https://mi-frontend.vercel.app`) |
| `SAT_TIMEOUT_MS` | `12000` |

Para generar una API Key segura:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 4. Obtener tu URL pública

Railway te asigna una URL como:
```
https://contagtpro-backend-production.up.railway.app
```

Guarda esta URL — la necesitas para configurar el frontend.

---

## 📡 Endpoints disponibles

### Health Check
```
GET /health
```
Devuelve estado del servidor y disponibilidad del portal SAT.

---

### Consulta NIT / RTU
```
GET /api/nit/:nit
Headers: X-API-Key: tu-api-key

# Ejemplo:
GET /api/nit/1234567-8
```

**Respuesta:**
```json
{
  "ok": true,
  "datos": {
    "nit": "12345678",
    "nombre": "EMPRESA EJEMPLO S.A.",
    "estado": "ACTIVO",
    "tipo": "Jurídico",
    "regimen": "Afecto IVA General",
    "actividad": "Comercio al por mayor",
    "direccion": "7a Avenida 3-67 Zona 9",
    "dvValido": true,
    "fuente": "sat-portal"
  }
}
```

**Consulta por lote (hasta 10 NITs):**
```
POST /api/nit/lote
Body: { "nits": ["1234567-8", "9876543-1"] }
```

---

### Validación FEL / UUID
```
GET /api/fel/:uuid
Headers: X-API-Key: tu-api-key

# Ejemplo:
GET /api/fel/A1B2C3D4-E5F6-7890-ABCD-EF1234567890
```

**Validación en lote (hasta 20 UUIDs):**
```
POST /api/fel/lote
Body: { "uuids": ["UUID-1", "UUID-2", ...] }
```

---

### Generador FLAT Declaraguate

**IVA (SAT-1311):**
```
POST /api/flat/iva
Headers: X-API-Key: tu-api-key
Content-Type: application/json

Body:
{
  "nit": "1234567-8",
  "nombre": "EMPRESA EJEMPLO S.A.",
  "mes": 0,
  "anio": 2025,
  "baseVentas": 100000.00,
  "ivaVentas": 12000.00,
  "baseCompras": 80000.00,
  "ivaCompras": 9600.00,
  "descarga": false
}
```

Si `descarga: true` → devuelve el archivo .txt directamente para guardar.  
Si `descarga: false` → devuelve JSON con `contenidoBase64` para que el frontend lo descargue.

**ISR (SAT-1361):**
```
POST /api/flat/isr
Body: { nit, nombre, anio, trimestre, totalIngresos, totalCostos, regimen, ... }
```

**ISO (SAT-2800):**
```
POST /api/flat/iso
Body: { nit, nombre, anio, trimestre, ingresosBrutos, activoNeto, ... }
```

**Paquete completo (IVA + ISR + ISO en una llamada):**
```
POST /api/flat/paquete
Body: {
  "datosIVA": { ... },
  "datosISR": { ... },
  "datosISO": { ... }
}
```

---

## 🔧 Desarrollo local

```bash
# Instalar dependencias
npm install

# Copiar variables de entorno
cp .env.example .env
# Editar .env con tus valores

# Iniciar en modo desarrollo (hot-reload)
npm run dev

# El servidor corre en http://localhost:3000
```

**Probar endpoints localmente:**
```bash
# Health check
curl http://localhost:3000/health

# Consulta NIT
curl -H "X-API-Key: tu-api-key" http://localhost:3000/api/nit/1234567-8

# Generar FLAT IVA
curl -X POST \
  -H "Content-Type: application/json" \
  -H "X-API-Key: tu-api-key" \
  -d '{"nit":"1234567-8","nombre":"EMPRESA S.A.","mes":0,"anio":2025,"baseVentas":100000,"ivaVentas":12000,"baseCompras":80000,"ivaCompras":9600}' \
  http://localhost:3000/api/flat/iva
```

---

## 🔌 Conectar el frontend

En tu frontend React/Next.js, configura la URL base:

```javascript
// config/api.js
const API_BASE = process.env.NEXT_PUBLIC_API_URL || "https://TU-URL.railway.app";
const API_KEY  = process.env.NEXT_PUBLIC_API_KEY  || "";

export async function consultarNIT(nit) {
  const res = await fetch(`${API_BASE}/api/nit/${nit}`, {
    headers: { "X-API-Key": API_KEY }
  });
  return res.json();
}

export async function validarFEL(uuid) {
  const res = await fetch(`${API_BASE}/api/fel/${uuid}`, {
    headers: { "X-API-Key": API_KEY }
  });
  return res.json();
}

export async function generarFlatIVA(datos) {
  const res = await fetch(`${API_BASE}/api/flat/iva`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-API-Key": API_KEY },
    body: JSON.stringify(datos),
  });
  return res.json();
}
```

---

## 📋 Notas técnicas importantes

### Portal SAT y scraping
- El portal SAT Guatemala **no tiene API REST pública** oficial
- Este backend hace scraping del portal RTU y FEL
- Si SAT actualiza su HTML, puede ser necesario ajustar los selectores CSS en `nitService.js` y `felService.js`
- El backend incluye caché (NIT: 24h, FEL: 1h) para reducir la carga al portal SAT

### Rate limiting
- Global: 200 requests / 15 minutos por IP
- NIT: 30 requests / minuto
- FEL: 50 requests / minuto
- Estos límites protegen contra abuso y respetan la capacidad del portal SAT

### Formato FLAT Declaraguate
- Los archivos generados siguen el formato requerido por Declaraguate (2024)
- Si SAT actualiza el formato, edita `flatService.js`
- Verificar siempre en portal.sat.gob.gt la versión vigente

---

## 🏗️ Arquitectura

```
Frontend (Vercel/Railway)
    │
    │ HTTPS + X-API-Key
    ▼
ContaGT Backend (Railway)
    ├── /api/nit  ──→  Portal RTU SAT (scraping)
    ├── /api/fel  ──→  Portal FEL SAT (scraping + JSON)
    └── /api/flat ──→  Generación local (no requiere SAT)
```

---

## 📞 Soporte

- Portal SAT: https://portal.sat.gob.gt
- Declaraguate: https://declaraguate.sat.gob.gt
- FEL SAT: https://fel.sat.gob.gt
