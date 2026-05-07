const express = require('express');
const cors = require('cors');
const twilio = require('twilio');

const app = express();
app.use(cors());
app.use(express.json());

// ── ENV CONFIG ──
const TWILIO_SID   = process.env.TWILIO_SID   || '';
const TWILIO_TOKEN = process.env.TWILIO_TOKEN  || '';
const TWILIO_FROM  = process.env.TWILIO_FROM   || '';
const AGENT_PHONE  = process.env.AGENT_PHONE   || '';

// ── HELPER: Send SMS ──
async function sendSms(to, body, sid, token, from) {
  const accountSid = sid   || TWILIO_SID;
  const authToken  = token || TWILIO_TOKEN;
  const fromNumber = from  || TWILIO_FROM;
  if (!accountSid || !authToken || !fromNumber || !to) throw new Error('Missing Twilio credentials');
  const client = twilio(accountSid, authToken);
  const message = await client.messages.create({ to, from: fromNumber, body });
  return message.sid;
}

// ── HELPER: Format AU number ──
function formatAU(num) {
  if (!num) return null;
  num = num.toString().replace(/\s/g, '');
  if (num.startsWith('+')) return num;
  if (num.startsWith('61')) return '+' + num;
  if (num.startsWith('0')) return '+61' + num.slice(1);
  return '+61' + num;
}

// ── HELPER: Score a lead ──
function scoreLead({ phone, email, intent, budget }) {
  let score = 40;
  if (phone) score += 20;
  if (email) score += 10;
  const highIntent
