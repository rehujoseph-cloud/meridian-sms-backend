const express = require('express');
const cors = require('cors');
const https = require('https');

const app = express();
app.use(cors());
app.use(express.json());

const VONAGE_API_KEY = process.env.VONAGE_API_KEY || '';
const VONAGE_API_SECRET = process.env.VONAGE_API_SECRET || '';
const AGENT_PHONE = process.env.AGENT_PHONE || '';

async function sendSms(to, text, apiKey, apiSecret) {
  var key = apiKey || VONAGE_API_KEY;
  var secret = apiSecret || VONAGE_API_SECRET;
  if (!key || !secret || !to) throw new Error('Missing Vonage credentials or recipient');

  var toNum = to.toString().replace(/\s/g, '');
  if (toNum.startsWith('0')) toNum = '61' + toNum.slice(1);
  if (toNum.startsWith('+')) toNum = toNum.slice(1);

  var body = JSON.stringify({
    from: 'MeridianAI',
    to: toNum,
    text: text,
    api_key: key,
    api_secret: secret
  });

  return new Promise(function(resolve, reject) {
    var options = {
      hostname: 'rest.nexmo.com',
      path: '/sms/json',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      }
    };

    var req = https.request(options, function(res) {
      var data = '';
      res.on('data', function(chunk) { data += chunk; });
      res.on('end', function() {
        try {
          var parsed = JSON.parse(data);
          var msg = parsed.messages && parsed.messages[0];
          if (msg && msg.status === '0') {
            console.log('SMS sent via Vonage to ' + toNum);
            resolve({ success: true, id: msg['message-id'] });
          } else {
            reject(new Error(msg ? msg['error-text'] : 'Unknown error'));
          }
        } catch(e) { reject(e); }
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
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
    if (i.indexOf('buy') > -1 || i.indexOf('purchase') > -1 || i.indexOf('buyer') > -1) score += 20;
    else if (i.indexOf('sell') > -1 || i.indexOf('list') > -1) score += 15;
    else score += 5;
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
  var text = req.body.body;
  var apiKey = req.body.apiKey;
  var apiSecret = req.body.apiSecret;
  if (!to || !text) return res.status(400).json({ error: 'Missing to or body' });
  try {
    var result = await sendSms(to, text, apiKey, apiSecret);
    res.json({ success: true, id: result.id });
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
  var apiKey = req.body.apiKey || VONAGE_API_KEY;
  var apiSecret = req.body.apiSecret || VONAGE_API_SECRET;
  var agentPhone = req.body.agentPhone || AGENT_PHONE;

  var fullName = name || ((first_name || '') + ' ' + (last_name || '')).trim() || 'New Lead';
  var firstName = first_name || fullName.split(' ')[0];
  var leadPhone = formatAU(phone);
  var agentNum = formatAU(agentPhone);
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
      await sendSms(agentNum, agentMsg, apiKey, apiSecret);
    } catch (e) { console.error('Agent SMS error: ' + e.message); }
  }

  if (leadPhone) {
    var leadMsg = 'Hi ' + firstName + '! Thanks for your enquiry with Meridian Property Group. ' +
      'I am Aria, your AI property assistant - available 24/7. ' +
      'I will be in touch shortly to help you ' + (intent || 'find your perfect property') + '. - Meridian AI';
    try {
      await sendSms(leadPhone, leadMsg, apiKey, apiSecret);
    } catch (e) { console.error('Lead SMS error: ' + e.message); }
  }

  res.json({ success: true, lead: { name: fullName, phone: leadPhone, email: email, score: score, isHot: isHot } });
});

app.get('/', function(req, res) {
  res.json({
    status: 'Meridian Backend running - Vonage SMS',
    endpoints: {
      'POST /send-sms': 'Send SMS via Vonage',
      'POST /facebook-lead': 'Facebook Lead Ads via Make',
      'POST /inbound-sms': 'Inbound SMS webhook'
    }
  });
});

var PORT = process.env.PORT || 8080;
app.listen(PORT, '0.0.0.0', function() {
  console.log('Meridian backend running on port ' + PORT);
});
