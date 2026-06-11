const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
});

async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS contadores (
      id SERIAL PRIMARY KEY,
      nombre VARCHAR(100) NOT NULL,
      email VARCHAR(100) UNIQUE NOT NULL,
      password VARCHAR(255) NOT NULL,
      colegiado VARCHAR(20),
      telefono VARCHAR(20),
      plan VARCHAR(20) DEFAULT 'basico',
      estado VARCHAR(20) DEFAULT 'trial',
      rol VARCHAR(20) DEFAULT 'contador',
      clientes_count INTEGER DEFAULT 0,
      declaraciones_mes INTEGER DEFAULT 0,
      fecha_registro TIMESTAMP DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS clientes (
      id SERIAL PRIMARY KEY,
      contador_id INTEGER REFERENCES contadores(id),
      nombre VARCHAR(150) NOT NULL,
      nit VARCHAR(20) NOT NULL,
      regimen VARCHAR(20) DEFAULT 'general',
      sector VARCHAR(50),
      declaraciones_pendientes INTEGER DEFAULT 0,
      ultima_declaracion VARCHAR(20) DEFAULT 'Sin declaraciones',
      fecha_creacion TIMESTAMP DEFAULT NOW()
    );
  `);
  console.log("Base de datos inicializada");
}

module.exports = { pool, initDB };