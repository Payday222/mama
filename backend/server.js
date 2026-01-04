const express = require('express');
const nodemailer = require('nodemailer');
const bodyParser = require('body-parser');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

const confirmationCodes = new Map(); // Key: email, Value: { code, password, expiresAt }

app.use(cors());
app.use(bodyParser.json());

function generateCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Helper: Load all user data
function loadUserData(email) {
  const userDir = path.join(__dirname, 'data', email);
  if (!fs.existsSync(userDir)) return [];

  const dates = fs.readdirSync(userDir).filter(dir => fs.statSync(path.join(userDir, dir)).isDirectory());
  const data = [];
  dates.forEach(date => {
    const filePath = path.join(userDir, date, 'inputs.json');
    if (fs.existsSync(filePath)) {
      try {
        const entry = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        data.push({ date, ...entry });
      } catch (err) {
        console.error(`Error reading ${filePath}:`, err);
      }
    }
  });
  return data;
}

// Helper: Analyze correlations (pain level vs. diet words)
// Helper: Analyze correlations (pain level vs. selected category words)
function analyzeCorrelations(data, painLevel, category) {
    
  const matchingEntries = data.filter(entry => entry.pain.toLowerCase().includes(painLevel.toLowerCase()));
  if (matchingEntries.length < 2) return { message: `Not enough data for pain '${painLevel}' (found ${matchingEntries.length} entries).` };

 
  const wordCounts = {};
  matchingEntries.forEach(entry => {
    const text = entry[category] || ''; 
    const words = text.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/).filter(word => word.length > 2); // Ignore short words
    words.forEach(word => {
      wordCounts[word] = (wordCounts[word] || 0) + 1;
    });
  });

  const stopWords = ['the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by'];
  const sortedWords = Object.entries(wordCounts)
    .filter(([word]) => !stopWords.includes(word))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5); // Top 5

  return {
    painLevel,
    category,
    matchingDates: matchingEntries.map(e => e.date),
    correlations: sortedWords.map(([word, count]) => `${word} (${count})`).join(', '),
    message: `Found correlations for pain '${painLevel}' with ${category} on ${matchingEntries.length} dates.`
  };
}

app.post('/signup', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) return res.status(400).json({ message: 'Email and password required' });

  const code = generateCode();
  const expiresAt = Date.now() + 10 * 60 * 1000; // Expires in 10 minutes

  confirmationCodes.set(email, { code, password, expiresAt });

  console.log(`Confirmation code for ${email}: ${code}`);

  try {
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: process.env.SMTP_PORT,
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    await transporter.sendMail({
      from: `"MAMA App" <${process.env.SMTP_USER}>`,
      to: email,
      subject: 'Confirm Your M.A.M.A. Account',
      text: `Your confirmation code is: ${code}. It expires in 10 minutes.`,
      html: `<h3>Confirm Your Account</h3><p>Your confirmation code is: <b>${code}</b></p><p>This code expires in 10 minutes.</p>`,
    });

    res.status(200).json({ message: 'Confirmation code sent to your email!' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error sending email' });
  }
});

app.post('/confirm', (req, res) => {
  const { email, code, password } = req.body;

  if (!email || !code || !password) {
    return res.status(400).json({ message: 'Email, code, and password required' });
  }

  const stored = confirmationCodes.get(email);
  if (!stored) {
    return res.status(400).json({ message: 'No confirmation code found for this email. Please request a new one.' });
  }

  if (Date.now() > stored.expiresAt) {
    confirmationCodes.delete(email); 
    return res.status(400).json({ message: 'Confirmation code has expired. Please request a new one.' });
  }

  if (stored.code !== code) {
    return res.status(400).json({ message: 'Invalid confirmation code.' });
  }

  console.log(`Account created for ${email} with password: ${password}`);
  confirmationCodes.delete(email); 

  res.status(200).json({ message: 'Account confirmed and created successfully!' });
});

app.post('/save-inputs', (req, res) => {
  const { email, date, diet, pain, exercise, notes } = req.body;

  if (!email || !date || !diet || !pain || !exercise) {
    return res.status(400).json({ message: 'All required fields must be provided.' });
  }

  const userDir = path.join(__dirname, 'data', email);
  const dateDir = path.join(userDir, date);

  if (!fs.existsSync(userDir)) fs.mkdirSync(userDir, { recursive: true });
  if (!fs.existsSync(dateDir)) fs.mkdirSync(dateDir, { recursive: true });

  const filePath = path.join(dateDir, 'inputs.json');
  const dataToSave = { diet, pain, exercise, notes, timestamp: new Date().toISOString() };

  fs.writeFile(filePath, JSON.stringify(dataToSave, null, 2), (err) => {
    if (err) {
      console.error('Error saving file:', err);
      return res.status(500).json({ message: 'Error saving inputs.' });
    }
    console.log(`Inputs saved for ${email} on ${date}`);
    res.status(200).json({ message: 'Inputs saved successfully!' });
  });
});

app.post('/analyze-data', (req, res) => {
  const { email, painLevel = 'severe', category = 'diet' } = req.body;

  if (!email) return res.status(400).json({ message: 'Email required' });

  const data = loadUserData(email);
  if (data.length === 0) return res.status(404).json({ message: 'No data found for this email.' });

  const result = analyzeCorrelations(data, painLevel, category);
  res.status(200).json(result);
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));