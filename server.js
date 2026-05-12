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
    // Save lead to database
    var source = req.body.source || 'facebook';
    await pool.query(
      'INSERT INTO leads (name, email, phone, budget, intent, source) VALUES ($1, $2, $3, $4, $5, $6)',
      [
        req.body.name || 'Unknown',
        req.body.email || null,
        req.body.phone || null,
        req.body.budget || null,
        req.body.intent || null,
        source
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
              '\nIntent: ' + (req.body.intent || 'N/A');
    
    await client.messages.create({ 
      to: agentPhone, 
      from: process.env.TWILIO_FROM, 
      body: msg 
    });
    console.log('✅ Agent SMS sent');
    
    res.json({ success: true });
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

// Dashboard route
app.get('/dashboard', function(req, res) {
  res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Meridian Dashboard - Albany</title>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body { 
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  background: #0A0E1A; 
  color: rgba(255,255,255,0.9);
  padding: 40px;
}
.container { max-width: 1200px; margin: 0 auto; }
h1 { font-size: 32px; margin-bottom: 10px; color: #B8965A; }
.subtitle { color: rgba(255,255,255,0.5); margin-bottom: 40px; }
.stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 20px; margin-bottom: 40px; }
.stat-card { 
  background: #111827; 
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 12px;
  padding: 24px;
}
.stat-label { 
  font-size: 12px; 
  text-transform: uppercase; 
  letter-spacing: 1px;
  color: rgba(255,255,255,0.4);
  margin-bottom: 8px;
}
.stat-value { font-size: 36px; font-weight: 700; color: #B8965A; }
.leads-section { 
  background: #111827;
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 12px;
  padding: 24px;
}
.leads-header { 
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}
.leads-title { font-size: 18px; font-weight: 600; }
.refresh-btn {
  background: #B8965A;
  color: white;
  border: none;
  padding: 8px 16px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
}
.refresh-btn:hover { background: #a07a40; }
table { width: 100%; border-collapse: collapse; }
th { 
  text-align: left; 
  padding: 12px;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 1px;
  color: rgba(255,255,255,0.4);
  border-bottom: 1px solid rgba(255,255,255,0.1);
}
td { 
  padding: 16px 12px;
  border-bottom: 1px solid rgba(255,255,255,0.05);
}
.lead-name { font-weight: 500; }
.lead-email { font-size: 13px; color: rgba(255,255,255,0.5); }
.score { font-weight: 600; }
.score-hot { color: #FF4757; }
.score-warm { color: #FFB800; }
.score-cold { color: #4B9EFF; }
.loading { text-align: center; padding: 40px; color: rgba(255,255,255,0.5); }
</style>
</head>
<body>
<div class="container">
  <h1>🏠 Meridian Dashboard</h1>
  <div class="subtitle">Albany Lead Capture System - Live Data</div>
  
  <div class="stats">
    <div class="stat-card">
      <div class="stat-label">Total Leads</div>
      <div class="stat-value" id="total-leads">0</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Hot Leads</div>
      <div class="stat-value" id="hot-leads">0</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">This Week</div>
      <div class="stat-value" id="week-leads">0</div>
    </div>
  </div>

  <div class="leads-section">
    <div class="leads-header">
      <div class="leads-title">📋 Recent Leads</div>
      <button class="refresh-btn" onclick="loadLeads()">↻ Refresh</button>
    </div>
    <div id="leads-content">
      <div class="loading">Loading leads...</div>
    </div>
  </div>
</div>

<script>
async function loadLeads() {
  try {
    const response = await fetch('/api/leads');
    const data = await response.json();
    
    if (data && data.leads) {
      const leads = data.leads;
      
      // Update stats
      document.getElementById('total-leads').textContent = leads.length;
      const hotLeads = leads.filter(l => (l.score || 50) >= 80).length;
      document.getElementById('hot-leads').textContent = hotLeads;
      
      // Week leads
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      const weekLeads = leads.filter(l => new Date(l.created_at) > weekAgo).length;
      document.getElementById('week-leads').textContent = weekLeads;
      
      // Render table
      if (leads.length === 0) {
        document.getElementById('leads-content').innerHTML = 
          '<div class="loading">No leads yet - system is ready to capture!</div>';
      } else {
        document.getElementById('leads-content').innerHTML = \`
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Contact</th>
                <th>Intent</th>
                <th>Source</th>
                <th>Score</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              \${leads.map(lead => {
                const score = lead.score || 50;
                const scoreClass = score >= 80 ? 'score-hot' : score >= 60 ? 'score-warm' : 'score-cold';
                const date = new Date(lead.created_at).toLocaleDateString('en-AU', {
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit'
                });
                
                return \`
                  <tr>
                    <td><div class="lead-name">\${lead.name || 'Unknown'}</div></td>
                    <td>
                      <div class="lead-email">\${lead.email || '—'}</div>
                      <div class="lead-email">\${lead.phone || '—'}</div>
                    </td>
                    <td>\${lead.intent || 'General'}</td>
                    <td>\${lead.source || 'Website'}</td>
                    <td class="score \${scoreClass}">\${score}</td>
                    <td>\${date}</td>
                  </tr>
                \`;
              }).join('')}
            </tbody>
          </table>
        \`;
      }
    }
  } catch (error) {
    document.getElementById('leads-content').innerHTML = 
      '<div class="loading">Error loading leads: ' + error.message + '</div>';
    console.error('Error:', error);
  }
}

// Load on page load
loadLeads();

// Auto-refresh every 30 seconds
setInterval(loadLeads, 30000);
</script>
</body>
</html>
  `);
});

var PORT = process.env.PORT || 8080;
app.listen(PORT, '0.0.0.0', function() {
  console.log('🚀 Server running on port ' + PORT);
});
