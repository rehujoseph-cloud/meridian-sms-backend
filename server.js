const express = require('express');
const cors = require('cors');
const twilio = require('twilio');

const app = express();
app.use(cors());
app.use(express.json());

const TWILIO_SID = process.env.TWILIO_SID || '';
const TWILIO_TOKEN = process.env.TWILIO_TOKEN || '';
const TWILIO_FROM = process.env.TWILIO_FROM || '';
const AGENT_PHONE = process.env.AGENT_PHONE || '';

async function sendSms(to, body, sid, token, from) {
  var accountSid = sid || TWILIO_SID;
  var authToken = token || TWILIO_TOKEN;
  var fromNumber = from || TWILIO_FROM;
  if (!accountSid || !authToken || !fromNumber || !to) {
    throw new Error('Missing Twilio credentials');
  }
  var client = twilio(accountSid, authToken);
  var message = await client.messages.create({ to: to, from: fromNumber, body: body });
  return message.sid;
}

function formatAU(num) {
  if (!num) return null;
  num = num.toString().replace(/\s/g, '');
  if (num.startsWith('+')) return num;
  if (num.startsWith('61')) return '+' + num;
  if (num.startsWith('0')) return '+61' + num.slice(1);
  return '+61' + num;
}

function scoreLead(phone, email, intent, budget) {
  var score = 40;
  if (phone) score += 20;
  if (email) score += 10;
  if (intent) {
    var i = intent.toLowerCase();
    if (i.indexOf('buy') > -1 || i.indexOf('purchase') > -1 || i.indexOf('buyer') > -1) {
      score += 20;
    } else if (i.indexOf('sell') > -1 || i.indexOf('list') > -1) {
      score += 15;
    } else {
      score += 5;
    }
  }
  if (budget) {
    var b = parseInt(budget.toString().replace(/[^0-9]/g, ''));
    if (b >= 1000000) score += 10;
    else if (b >= 500000) score += 7;
    else score += 3;
  }
  if (score > 100) score = 100;
  return score;
}

app.post('/send-sms', async function(req, res) {
  var to = req.body.to;
  var body = req.body.body;
  var accountSid = req.body.accountSid;
  var authToken = req.body.authToken;
  var from = req.body.from;
  if (!to || !body) {
    return res.status(400).json({ error: 'Missing to or body' });
  }
  try {
    var sid = await sendSms(to, body, accountSid, authToken, from);
    console.log('SMS sent to ' + to);
    res.json({ success: true, sid: sid });
  } catch (err) {
    console.error('SMS error: ' + err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post('/facebook-lead', async function(req, res) {
  console.log('Facebook Lead received');
  var name = req.body.name;
  var first_name = req.body.first_name;
  var last_name = req.body.last_name;
  var phone = req.body.phone;
  var email = req.body.email;
  var intent = req.body.intent;
  var budget = req.body.budget;
  var ad_name = req.body.ad_name;
  var accountSid = req.body.accountSid;
  var authToken = req.body.authToken;
  var from = req.body.from;
  var agentPhone = req.body.agentPhone;

  var fullName = name || ((first_name || '') + ' ' + (last_name || '')).trim() || 'New Lead';
  var firstName = first_name || fullName.split(' ')[0];
  var leadPhone = formatAU(phone);
  var agentNum = formatAU(agentPhone || AGENT_PHONE);
  var score = scoreLead(phone, email, intent, budget);
  var isHot = score >= 80;

  if (agentNum) {
    var agentMsg = (isHot ? 'HOT LEAD' : 'NEW LEAD') + ' - Meridian AI (Facebook)\n' +
      'Name: ' + fullName + '\n' +
      (leadPhone ? 'Phone: ' + leadPhone + '\n' : '') +
      (email ? 'Email: ' + email + '\n' : '') +
      (intent ? 'Intent: ' + intent + '\n' : '') +
      (budget ? 'Budget: ' + budget + '\n' : '') +
      (ad_name ? 'Ad: ' + ad_name + '\n' : '') +
      'Score: ' + score + '/100 - ' + (isHot ? 'Call ASAP!' : 'Nurture started');
    try {
      await sendSms(agentNum, agentMsg, accountSid, authToken, from);
      console.log('Agent SMS sent to ' + agentNum);
    } catch (e) {
      console.error('Agent SMS error: ' + e.message);
    }
  }

  if (leadPhone) {
    var leadMsg = 'Hi ' + firstName + '! Thanks for your enquiry with Meridian Property Group. ' +
      'I am Aria, your AI property assistant - available 24/7. ' +
      'I will be in touch shortly to help you ' + (intent || 'find your perfect property') + '. - Meridian AI';
    try {
      await sendSms(leadPhone, leadMsg, accountSid, authToken, from);
      console.log('Lead SMS sent to ' + leadPhone);
    } catch (e) {
      console.error('Lead SMS error: ' + e.message);
    }
  }

  res.json({ success: true, lead: { name: fullName, phone: leadPhone, email: email, score: score, isHot: isHot } });
});

app.post('/inbound-sms', async function(req, res) {
  var from = req.body.From;
  var body = req.body.Body;
  console.log('Inbound SMS from ' + from);
  var agentNum = formatAU(AGENT_PHONE);
  if (agentNum) {
    var fwd = 'LEAD REPLIED - Meridian AI\nFrom: ' + from + '\nMessage: ' + body;
    try {
      await sendSms(agentNum, fwd, TWILIO_SID, TWILIO_TOKEN, TWILIO_FROM);
    } catch (e) {
      console.error('Forward error: ' + e.message);
    }
  }
  res.set('Content-Type', 'text/xml');
  res.send('<?xml version="1.0" encoding="UTF-8"?><Response><Message>Thanks! Our team will be in touch shortly. - Meridian AI</Message></Response>');
});

app.get('/', function(req, res) {
  res.json({
    status: 'Meridian Backend running',
    endpoints: {
      'POST /send-sms': 'Send SMS from dashboard',
      'POST /facebook-lead': 'Facebook Lead Ads via Make',
      'POST /inbound-sms': 'Twilio inbound SMS webhook'
    }
  });
});

var PORT = process.env.PORT || 8080;
app.listen(PORT, '0.0.0.0', function() {
  console.log('Meridian backend running on port ' + PORT);
});
