const express = require('express');
const cors = require('cors');
const twilio = require('twilio');

const app = express();
app.use(cors());
app.use(express.json());

app.get('/', function(req, res) {
  res.json({ status: 'Meridian Backend running' });
});

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

app.post('/facebook-lead', async function(req, res) {
  console.log('Lead received:', req.body.name);
  try {
    var client = twilio(process.env.TWILIO_SID, process.env.TWILIO_TOKEN);
    var agentPhone = process.env.AGENT_PHONE;
    var msg = 'NEW LEAD - Meridian AI\nName: ' + (req.body.name || 'Unknown') + '\nPhone: ' + (req.body.phone || 'N/A') + '\nEmail: ' + (req.body.email || 'N/A') + '\nIntent: ' + (req.body.intent || 'N/A');
    await client.messages.create({ to: agentPhone, from: process.env.TWILIO_FROM, body: msg });
    console.log('Agent SMS sent');
    res.json({ success: true });
  } catch(e) {
    console.log('Error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

var PORT = process.env.PORT || 8080;
app.listen(PORT, '0.0.0.0', function() {
  console.log('Server running on port ' + PORT);
});
