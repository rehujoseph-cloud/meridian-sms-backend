const express = require('express');
const cors = require('cors');
const twilio = require('twilio');

const app = express();
app.use(cors());
app.use(express.json());

// POST /send-sms
// Body: { to, body, accountSid, authToken, from }
app.post('/send-sms', async (req, res) => {
  const { to, body, accountSid, authToken, from } = req.body;

  if (!to || !body || !accountSid || !authToken || !from) {
    return res.status(400).json({ error: 'Missing required fields: to, body, accountSid, authToken, from' });
  }

  try {
    const client = twilio(accountSid, authToken);
    const message = await client.messages.create({ to, from, body });
    console.log('[SMS sent]', message.sid, '→', to);
    res.json({ success: true, sid: message.sid });
  } catch (err) {
    console.error('[SMS error]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Health check
app.get('/', (req, res) => {
  res.json({ status: 'Meridian SMS Backend running ✅' });
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, '0.0.0.0', () => console.log(`Server running on port ${PORT}`));
