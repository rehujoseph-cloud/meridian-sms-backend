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

async function sendSms(to, body) {
  if (!TWILIO_SID || !TWILIO_TOKEN || !TWILIO_FROM || !to) {
    throw new Error('Missing Twilio credentials');
  }
  var client = twilio(TWILIO_SID, TWILIO_TOKEN);
  var message = await client.messages.create({ to: to, from: TWILIO_FROM, body: body });
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
  var body = req.body.body;
  if (!to || !body) return res.status(400).json({ error: 'Missing to or body' });
  try {
    var sid = await sendSms(to, body);
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
      await sendSms(agentNum, agentMsg);
      console.log('Agent SMS sent to ' + agentNum);
    } catch (e) { console.error('Agent SMS error: ' + e.message); }
  }

  if (leadPhone) {
    var leadMsg = 'Hi ' + firstName + '! Thanks for your enquiry with Meridian Property Group. ' +
      'I am Aria, your AI property assistant - available 24/7. ' +
      'I will be in touch shortly to help you ' + (intent || 'find your perfect property') + '. - Meridian AI';
    try {
      await sendSms(leadPhone, leadMsg);
      console.log('Lead SMS sent to ' + leadPhone);
    } catch (e) { console.error('Lead SMS error: ' + e
