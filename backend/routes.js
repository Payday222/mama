const express = require('express');
const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');
const { generateCode } = require('./utils');

const router = express.Router();


const confirmationCodes = new Map(); 

router.post('/signup', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) return res.status(400).json({ message: 'Email and password required' });

  const code = generateCode();
  const expiresAt = Date.now() + 10 * 60 * 1000;

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


router.post('/save-inputs', (req, res) => {
  const { email, date, diet, pain, exercise, notes } = req.body;

  if (!email || !date || !diet || !pain || !exercise) {
    return res.status(400).json({ message: 'All required fields must be provided.' });
  }

 
  const userDir = path.join(__dirname, '..', 'data', email); 
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

module.exports = router;