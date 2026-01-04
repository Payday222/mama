const express = require('express');
const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');
const { generateCode } = require('./utils'); // Import helper from utils

const router = express.Router();

// Temporary storage for confirmation codes (use a database in production)
const confirmationCodes = new Map(); // Key: email, Value: { code, password, expiresAt }

router.post('/signup', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) return res.status(400).json({ message: 'Email and password required' });

  // Generate confirmation code
  const code = generateCode();
  const expiresAt = Date.now() + 10 * 60 * 1000; // Expires in 10 minutes

  // Store temporarily (in production, save to DB with expiration)
  confirmationCodes.set(email, { code, password, expiresAt });

  console.log(`Confirmation code for ${email}: ${code}`);

  // Send confirmation email
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

// Confirm the code and create the account
router.post('/confirm', (req, res) => {
  const { email, code, password } = req.body;

  if (!email || !code || !password) {
    return res.status(400).json({ message: 'Email, code, and password required' });
  }

  const stored = confirmationCodes.get(email);
  if (!stored) {
    return res.status(400).json({ message: 'No confirmation code found for this email. Please request a new one.' });
  }

  if (Date.now() > stored.expiresAt) {
    confirmationCodes.delete(email); // Clean up expired code
    return res.status(400).json({ message: 'Confirmation code has expired. Please request a new one.' });
  }

  if (stored.code !== code) {
    return res.status(400).json({ message: 'Invalid confirmation code.' });
  }

  // Code is valid - "create" the account (log it; in production, save to DB)
  console.log(`Account created for ${email} with password: ${password}`);
  confirmationCodes.delete(email); // Remove code after use

  res.status(200).json({ message: 'Account confirmed and created successfully!' });
});

// Save daily inputs
router.post('/save-inputs', (req, res) => {
  const { email, date, diet, pain, exercise, notes } = req.body;

  if (!email || !date || !diet || !pain || !exercise) {
    return res.status(400).json({ message: 'All required fields must be provided.' });
  }

  // Create folder structure: data/email/date/
  const userDir = path.join(__dirname, '..', 'data', email); // Adjust path since backend/ is a subfolder
  const dateDir = path.join(userDir, date);

  // Ensure directories exist
  if (!fs.existsSync(userDir)) fs.mkdirSync(userDir, { recursive: true });
  if (!fs.existsSync(dateDir)) fs.mkdirSync(dateDir, { recursive: true });

  // Save data as JSON
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

module.exports = router;