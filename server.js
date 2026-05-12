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
        score INTEGER DEFAULT 50,
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
    // Calculate score
    var score = 50;
    if (req.body.budget) score += 20;
    if (req.body.email) score += 15;
    if (req.body.phone) score += 15;
    
    // Save lead to database
    var source = req.body.source || 'website';
    await pool.query(
      'INSERT INTO leads (name, email, phone, budget, intent, source, score) VALUES ($1, $2, $3, $4, $5, $6, $7)',
      [
        req.body.name || 'Unknown',
        req.body.email || null,
        req.body.phone || null,
        req.body.budget || null,
        req.body.intent || null,
        source,
        score
      ]
    );
    console.log('✅ Lead saved to database');
    
    // Send SMS to agent
    var client = twilio(process.env.TWILIO_SID, process.env.TWILIO_TOKEN);
    var agentPhone = process.env.AGENT_PHONE;
    var msg = 'NEW LEAD - Meridian AI\nName: ' + (req.body.name || 'Unknown') + 
              '\nPhone: ' + (req.body.phone || 'N/A') + 
              '\nEmail: ' + (req.body.email || 'N/A') + 
              '\nBudget: ' + (req.body.budget || 'N/A') + 
              '\nIntent: ' + (req.body.intent || 'N/A') +
              '\nScore: ' + score;
    
    await client.messages.create({ 
      to: agentPhone, 
      from: process.env.TWILIO_FROM, 
      body: msg 
    });
    console.log('✅ Agent SMS sent');
    
    res.json({ success: true, score: score });
  } catch(e) {
    console.log('❌ Error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// Analytics endpoint - get channel breakdown
app.get('/api/analytics', async function(req, res) {
  try {
    // Get total leads by source
    var result = await pool.query(`
      SELECT 
        source,
        COUNT(*) as count
      FROM leads
      GROUP BY source
      ORDER BY count DESC
    `);
    
    // Get total leads
    var totalResult = await pool.query('SELECT COUNT(*) as total FROM leads');
    var total = parseInt(totalResult.rows[0].total);
    
    // Format response
    var channels = {
      website: 0,
      facebook: 0,
      sms: 0,
      email: 0,
      voice: 0,
      instagram: 0
    };
    
    result.rows.forEach(function(row) {
      var source = row.source.toLowerCase();
      if (channels.hasOwnProperty(source)) {
        channels[source] = parseInt(row.count);
      }
    });
    
    res.json({
      total: total,
      channels: channels,
      breakdown: result.rows
    });
  } catch(e) {
    console.error('Analytics error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// Get recent leads endpoint
app.get('/api/leads/recent', async function(req, res) {
  try {
    var limit = parseInt(req.query.limit) || 10;
    var result = await pool.query(
      'SELECT * FROM leads ORDER BY created_at DESC LIMIT $1',
      [limit]
    );
    res.json({ leads: result.rows });
  } catch(e) {
    console.error('Recent leads error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// Get all leads endpoint (for dashboard)
app.get('/api/leads', async function(req, res) {
  try {
    var result = await pool.query('SELECT * FROM leads ORDER BY created_at DESC');
    res.json({ leads: result.rows });
  } catch(e) {
    console.error('Get leads error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// Health check endpoint
app.get('/health', async function(req, res) {
  try {
    await pool.query('SELECT NOW()');
    res.json({ 
      status: 'healthy', 
      database: 'connected',
      timestamp: new Date().toISOString()
    });
  } catch(e) {
    res.status(500).json({ 
      status: 'unhealthy', 
      database: 'disconnected',
      error: e.message 
    });
  }
});

var PORT = process.env.PORT || 8080;
app.listen(PORT, '0.0.0.0', function() {
  console.log('🚀 Server running on port ' + PORT);
});
