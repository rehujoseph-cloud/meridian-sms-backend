const express = require('express');
const cors = require('cors');
const twilio = require('twilio');
const { Pool } = require('pg');

const app = express();
app.use(cors());
app.use(express.json());

// PostgreSQL connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

// Initialize database table
async function initDatabase() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS leads (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255),
        email VARCHAR(255),
        phone VARCHAR(50),
        budget VARCHAR(100),
        intent TEXT,
        source VARCHAR(50),
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log('✅ Database initialized');
  } catch(e) {
    console.error('❌ Database init error:', e.message);
  }
}

initDatabase();

// Root endpoint
app.get('/', function(req, res) {
  res.json({ 
    status: 'Meridian Backend running',
    database: pool ? 'connected' : 'not connected'
  });
});

// Send SMS endpoint (direct)
app.post('/send-sms', async function(req, res) {
  try {
    var client = twilio(process.env.TWILIO_SID, process.env.TWILIO_TOKEN);
    var msg = await client.messages.create({
      to: req.body.to,
      from: process.env.TWILIO_FROM,
      body: req.body.body
    });
    res.json({ success: true, sid: msg.sid });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// Facebook lead endpoint (with database storage)
app.post('/facebook-lead', async function(req, res) {
  console.log('Lead received:', req.body.name);
  
  try {
    //
