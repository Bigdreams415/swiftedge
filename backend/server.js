const express = require('express');
const bcrypt = require('bcryptjs');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
const cors = require('cors');
const jwt = require('jsonwebtoken');
require('dotenv').config();
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
// const { type } = require('os');
 
const app = express();


// Serve static files from the frontend folder
app.use(express.static(path.join(__dirname, '../frontend')));

// Route to serve home.html for the homepage
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/index.html'));
});


// Middleware
app.use(express.json());
app.use(bodyParser.json());
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

// MongoDB Config
const db = process.env.MONGO_URI;

// Connect to MongoDB
mongoose.connect(db, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(() => console.log("MongoDB connected"))
    .catch(err => console.log(err));



const authenticateJWT = (req, res, next) => {
    console.log('Authenticating JWT...');
    
    const token = req.headers['authorization']?.split(' ')[1];
    if (!token) {
        console.log('Authorization token missing');
        return res.status(403).json({ message: 'No token provided' });
    }

    console.log('Received Token:', token);

    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        if (err) {
            console.error('Token verification failed:', err);
            return res.status(403).json({ message: 'Invalid token' });
        }

        console.log('Decoded Token:', user); // Log decoded JWT payload
        req.user = user;
        next();
    });
};


// User Schema
const UserSchema = new mongoose.Schema({
    fullName: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    phone: { type: String },
    lastLogin: {type: String, default: null},
    status: {type: String, default: "Inactive"}, 
    uid: { type: String, required: true, unique: true },
    totalBalance: { type: Number, default: 0 },  
    holdings: [
        {
            name: { type: String },
            symbol: { type: String },
            amount: { type: Number },
            value: { type: Number }
        }
    ],
    resetPasswordToken: { type: String },
    resetPasswordExpires: { type: Date },

});

const User = mongoose.model('User', UserSchema);

 
// deposit schema definition and model
const depositSchema = new mongoose.Schema({
  method: { type: String, required: true },
  bankDetails: {
      bankName: String,
      routingNumber: String,
      accountNumber: String,
      accountName: String,
      swiftCode: String,
  },
  cryptoDetails: [
      {
          cryptocurrency: { type: String, required: true },
          walletAddress: String,
          network: String,
      },
  ],
  digitalWalletDetails: [
      {
          walletType: { type: String, required: true },
          walletUsername: String,
          walletInfo: String,
      },
  ],
});

// Initialize the Deposit model
const Deposit = mongoose.model('Deposit', depositSchema);

// Export the Deposit model
module.exports = { Deposit };


// Fetch Bank Transfer Data
app.get('/admin/deposit/bank-transfer', authenticateJWT, async (req, res) => {
  try {
    const deposit = await Deposit.findOne({ method: 'bank-transfer' });
    res.json(deposit || {});
  } catch (error) {
    console.error('Error fetching bank transfer data:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Save Bank Transfer Data
app.post('/admin/deposit/bank-transfer', authenticateJWT, async (req, res) => {
  const { bankName, routingNumber, accountNumber, accountName, swiftCode } = req.body;
  try {
    let deposit = await Deposit.findOneAndUpdate(
      { method: 'bank-transfer' },
      { 
        bankDetails: { 
          bankName, 
          routingNumber, 
          accountNumber, 
          accountName, 
          swiftCode 
        },
        $unset: { cryptoDetails: "", digitalWalletDetails: "" }  // Remove any unwanted fields
      },
      { new: true, upsert: true }
    );
    res.json(deposit);
  } catch (error) {
    console.error('Error saving bank transfer data:', error);
    res.status(500).json({ message: 'Server error' });
  }
});


// Fetch Cryptocurrency Data
app.get('/admin/deposit/crypto', authenticateJWT, async (req, res) => {
  try {
    const deposit = await Deposit.findOne({ method: 'crypto' });
    res.json(deposit?.cryptoDetails || []);
  } catch (error) {
    console.error('Error fetching cryptocurrency data:', error);
    res.status(500).json({ message: 'Server error' });
  }
});


// Save Cryptocurrency Data
app.post('/admin/deposit/crypto', authenticateJWT, async (req, res) => {
  const { cryptocurrency, walletAddress, network } = req.body;

  try {
    // Find the deposit document for 'crypto'
    let deposit = await Deposit.findOne({ method: 'crypto' });

    // If the deposit document exists
    if (deposit) {
      // Check if the cryptocurrency already exists in the array
      const existingCrypto = deposit.cryptoDetails.find(
        (crypto) => crypto.cryptocurrency === cryptocurrency
      );

      if (existingCrypto) {
        // If the cryptocurrency exists, update only that entry
        await Deposit.updateOne(
          { method: 'crypto', 'cryptoDetails.cryptocurrency': cryptocurrency },
          {
            $set: {
              'cryptoDetails.$.walletAddress': walletAddress,
              'cryptoDetails.$.network': network,
            },
          }
        );
      } else {
        // If the cryptocurrency doesn't exist, add it to the array
        await Deposit.updateOne(
          { method: 'crypto' },
          {
            $push: {
              cryptoDetails: {
                cryptocurrency,
                walletAddress,
                network,
              },
            },
          }
        );
      }
    } else {
      // If the 'crypto' deposit document doesn't exist, create it
      deposit = new Deposit({
        method: 'crypto',
        cryptoDetails: [{ cryptocurrency, walletAddress, network }],
      });
      await deposit.save();
    }

    // Now, ensure that if there are any unwanted fields, like 'digitalWalletDetails', they are excluded or unset
    await Deposit.updateOne(
      { method: 'crypto' },
      {
        $unset: { digitalWalletDetails: "" }, // Remove 'digitalWalletDetails' if unnecessary
      }
    );

    res.status(200).json({ message: 'Cryptocurrency details saved successfully!' });
  } catch (error) {
    console.error('Error saving cryptocurrency data:', error);
    res.status(500).json({ message: 'Server error' });
  }
});


// Fetch Digital Wallets Data
app.get('/admin/deposit/digital-wallets', authenticateJWT, async (req, res) => {
  try {
    const deposit = await Deposit.findOne({ method: 'digital-wallets' });
    res.json(deposit?.digitalWalletDetails || []);
  } catch (error) {
    console.error('Error fetching digital wallet data:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Save Digital Wallet Data
app.post('/admin/deposit/digital-wallets', authenticateJWT, async (req, res) => {
  const { walletType, walletUsername, walletInfo } = req.body;

  try {
    // Find the deposit document for 'digital-wallets'
    let deposit = await Deposit.findOne({ method: 'digital-wallets' });

    // If the deposit document exists
    if (deposit) {
      // Check if the walletType already exists in the array
      const existingWallet = deposit.digitalWalletDetails.find(
        (wallet) => wallet.walletType === walletType
      );

      if (existingWallet) {
        // If the walletType exists, update only that entry
        await Deposit.updateOne(
          { method: 'digital-wallets', 'digitalWalletDetails.walletType': walletType },
          {
            $set: {
              'digitalWalletDetails.$.walletUsername': walletUsername,
              'digitalWalletDetails.$.walletInfo': walletInfo,
            },
          }
        );
      } else {
        // If the walletType doesn't exist, add it to the array
        await Deposit.updateOne(
          { method: 'digital-wallets' },
          {
            $push: {
              digitalWalletDetails: {
                walletType,
                walletUsername,
                walletInfo,
              },
            },
          }
        );
      }
    } else {
      // If the 'digital-wallets' deposit document doesn't exist, create it
      deposit = new Deposit({
        method: 'digital-wallets',
        digitalWalletDetails: [{ walletType, walletUsername, walletInfo }],
      });
      await deposit.save();
    }

    // Now, ensure that if there are any unwanted fields, like 'cryptoDetails', they are excluded or unset
    await Deposit.updateOne(
      { method: 'digital-wallets' },
      {
        $unset: { cryptoDetails: "" }, // Remove 'cryptoDetails' if unnecessary
      }
    );

    res.status(200).json({ message: 'Digital wallet details saved successfully!' });
  } catch (error) {
    console.error('Error saving digital wallet data:', error);
    res.status(500).json({ message: 'Server error' });
  }
});


// Sample route to get deposit details from the database
app.get('/api/deposit-details', async (req, res) => {
  try {
      const depositDetails = await Deposit.findOne(); // Fetch the first deposit details document (you may adjust based on your data model)
      
      if (!depositDetails) {
          return res.status(404).send('Deposit details not found');
      }
      
      res.json(depositDetails); // Send back the deposit details in JSON format
  } catch (err) {
      console.error(err);
      res.status(500).send('Server error');
  }
});



  

// User sign up and login routes...

app.post('/signup', async (req, res) => {
    const { fullName, email, username, password, phone } = req.body;

    try {
        const lowerEmail = email.toLowerCase();
        const lowerUsername = username.toLowerCase();

        // Check if the user already exists with the same email or username
        const existingUser = await User.findOne({ 
            $or: [{ email: lowerEmail }, { username: lowerUsername }]
        });

        if (existingUser) {
            return res.status(400).json({ message: 'User already exists' });
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Generate a shortened UID
        const uid = uuidv4().slice(0, 8);

        // Create new user with lowercase email and username, and shortened UID
        const user = new User({ 
            fullName, 
            email: lowerEmail, 
            username: lowerUsername, 
            password: hashedPassword, 
            phone,
            uid,  
            balance: 0,  
            holdings: []  
        });
        
        await user.save();

        res.status(201).json({ message: 'User created successfully' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
});

// User login
app.post('/login', async (req, res) => {
  const { username, password } = req.body;

  console.log("Received login request:", req.body);

  try {
      // Convert username/email to lowercase for case-insensitive comparison
      const user = await User.findOne({ 
          $or: [{ username: username.toLowerCase() }, { email: username.toLowerCase() }] 
      });
      
      console.log("User found in database:", user);

      if (!user) {
          console.log("User not found");
          return res.status(400).json({ message: 'Invalid credentials' });
      }

      // Verify password
      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) {
          console.log("Password mismatch");
          return res.status(400).json({ message: 'Invalid credentials' });
      }

      // Update status to 'Active' and set lastLogin to the current date and time
      user.status = 'Active';
      user.lastLogin = new Date().toISOString();  // You can format it as you prefer (e.g., 'YYYY-MM-DD HH:MM:SS')

      // Save the updated user data
      await user.save();

      // Create JWT token
      const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '2h' });

      res.json({ 
          token, 
          username: user.username,   
          name: user.name || user.username // Optionally include the full name if available
      });
  } catch (error) {
      console.error("Error during login:", error);
      res.status(500).json({ message: 'Server error' });
  }
});


//Backend to get user details

app.get('/user-info', async (req, res) => {
    // Get the token from the Authorization header
    const token = req.header('Authorization')?.replace('Bearer ', '');

    if (!token) {
        return res.status(401).json({ message: 'Access denied, token missing' });
    }

    try {
        // Verify the JWT token
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        // Fetch the user based on the decoded user ID
        const user = await User.findById(decoded.id).select('username uid status lastLogin');
        
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Respond with user information
        res.json({
            username: user.username,
            uid: user.uid,
            status: user.status,
            lastLogin: user.lastLogin,
        });
    } catch (error) {
        console.error("Error fetching user info:", error);
        res.status(500).json({ message: 'Server error' });
    }
});


// Fetch Holdings for a User by UID
app.get('/admin/user-holdings/:uid', authenticateJWT, async (req, res) => {
    const { uid } = req.params;  

    try {
        
        const user = await User.findOne({ uid: uid });

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        res.json({
            fullName: user.fullName,
            email: user.email,
            username: user.username,
            holdings: user.holdings   
        });

    } catch (error) {
        console.error('Error fetching user holdings:', error);
        res.status(500).json({ message: 'Server error occurred' });
    }
});

//route to add new holding

app.post('/admin/add-holding', authenticateJWT, async (req, res) => {
    const { uid, name, symbol, amount, value } = req.body;
    try {
        const user = await User.findOne({ uid });
        if (!user) return res.status(404).json({ message: 'User not found' });

        user.holdings.push({ name, symbol, amount, value });
        await user.save();
        res.json({ message: 'Holding added successfully', holdings: user.holdings });
    } catch (error) {
        console.error('Error adding holding:', error);
        res.status(500).json({ message: 'Server error' });
    }
});


// Update user's total balance
app.put('/admin/user-balance/:uid', async (req, res) => {
    const { uid } = req.params;
    const { totalBalance } = req.body;

    try {
        const user = await User.findOneAndUpdate({ uid }, { totalBalance }, { new: true });
        if (!user) return res.status(404).json({ message: "User not found" });

        res.status(200).json({ message: "Total balance updated successfully", totalBalance });
    } catch (error) {
        console.error("Error updating total balance:", error);
        res.status(500).json({ message: "Server error" });
    }
});

// Backend route to get user portfolio
app.get('/portfolio', authenticateJWT, async (req, res) => {
  try {
      console.log('Incoming request to /portfolio');
      console.log('Decoded User:', req.user); // Log user from JWT

      const user = await User.findById(req.user.id);
      if (!user) {
          console.log('User not found in the database');
          return res.status(404).json({ message: 'User not found' });
      }

      console.log('Fetched user from database:', user);

      res.json({
          totalBalance: user.totalBalance,   
          holdings: user.holdings            
      });
  } catch (error) {
      console.error('Error fetching portfolio:', error);
      res.status(500).json({ message: 'Server error' });
  }
});


// Password Reset Request Route
app.post('/request-reset', async (req, res) => {
  const { email } = req.body;

  try {
      const user = await User.findOne({ email: email.toLowerCase() });
      if (!user) {
          return res.status(404).json({ message: 'User not found' });
      }

      // Generate reset token
      const resetToken = crypto.randomBytes(32).toString('hex');
      const tokenExpiry = Date.now() + 3600000;  

      // Save token and expiry to user
      user.resetPasswordToken = resetToken;
      user.resetPasswordExpires = tokenExpiry;
      await user.save();

      // Generate reset link with query parameter
      const resetLink = `http://localhost:3000/update-password.html?token=${resetToken}`;

      // Send reset email
      const transporter = nodemailer.createTransport({
          service: 'Gmail',
          auth: {
              user: process.env.EMAIL_USER,
              pass: process.env.EMAIL_PASS,
          },
      });

      const mailOptions = {
          from: '"Your App" <no-reply@yourapp.com>',
          to: user.email,
          subject: 'Password Reset Request',
          text: `You requested a password reset. Click the link below to reset your password:\n\n${resetLink}`,
          html: `<p>You requested a password reset. Click the link below to reset your password:</p><a href="${resetLink}">${resetLink}</a>`,
      };

      await transporter.sendMail(mailOptions);
      res.status(200).json({ message: 'Password reset email sent successfully' });
  } catch (error) {
      console.error('Error in /request-reset:', error);
      res.status(500).json({ message: 'Server error' });
  }
});


//api route to verify token

app.get('/reset-password/:token', async (req, res) => {
  const { token } = req.params;

  try {
      const user = await User.findOne({
          resetPasswordToken: token,
          resetPasswordExpires: { $gt: Date.now() }, // Check if token is not expired
      });

      if (!user) {
          return res.status(400).send('Invalid or expired token');
      }

      // Redirect to the update password page
      res.redirect(`/update-password.html?userId=${user._id}`);
  } catch (error) {
      console.error('Error in /reset-password/:token:', error);
      res.status(500).send('Server error');
  }
});



//reset password route

app.post('/reset-password/:token', async (req, res) => {
  const { token } = req.params; // Token from the URL
  const { password } = req.body; // New password from the frontend

  // console.log("Received token in request:", token); // Log received token
  // console.log("Received password in request:", password); // Log received password

  try {
      // Check if user exists with the provided token and token has not expired
      const user = await User.findOne({
          resetPasswordToken: token,
          resetPasswordExpires: { $gt: Date.now() }, // Ensure token is still valid
      });

      if (!user) {
          console.log("Token not found or expired in database:", token); // Log if token is invalid or expired
          return res.status(400).json({ message: 'Invalid or expired token' });
      }

      // console.log("User found for token:", user.email); // Log user's email if found

      // Hash the new password
      const hashedPassword = await bcrypt.hash(password, 10);
      console.log("New password hashed successfully");

      // Update user's password and clear reset token/expiry
      user.password = hashedPassword;
      user.resetPasswordToken = undefined;
      user.resetPasswordExpires = undefined;
      await user.save();

      console.log("Password updated successfully for user:", user.email);
      res.status(200).json({ message: 'Password reset successfully' });
  } catch (error) {
      console.error("Error in /reset-password/:token route:", error); // Log error details
      res.status(500).json({ message: 'Server error' });
  }
});


const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
}); 