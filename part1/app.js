var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');
var mysql = require('mysql2/promise');

var indexRouter = require('./routes/index');
var usersRouter = require('./routes/users');

var app = express();

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/', indexRouter);
app.use('/users', usersRouter);


let db;

(async () => {
  try {
    // Connect to MySQL without specifying a database
    const connection = await mysql.createConnection({
      host: 'localhost',
      user: 'root',
      password: ''
    });

    // Create the database if it doesn't exist
    await connection.query('CREATE DATABASE IF NOT EXISTS DogWalkService');
    await connection.end();

    // Now connect to the created database
    db = await mysql.createConnection({
      host: 'localhost',
      user: 'root',
      password: '',
      database: 'DogWalkService'
    });

// Insert tables if database is empty
    // Insert Users
    await db.execute(`
    INSERT IGNORE INTO Users (username, email, password_hash, role)
        VALUES
        ('alice123', 'alice@example.com', 'hashed123', 'owner'),
        ('bobwalker', 'bob@example.com', 'hashed456', 'walker'),
        ('carol123', 'carol@example.com', 'hashed789', 'owner'),
        ('alex', 'alex@example.com', 'hashed100', 'walker'),
        ('harry', 'harry@example.com', 'hashed101', 'owner');
    `);

    // Insert Dogs
    await db.execute(`
    INSERT IGNORE INTO Dogs (name, size, owner_id)
    VALUES ('Max', 'medium', (SELECT user_id FROM Users WHERE username = 'alice123'));
    `);
    await db.execute(`
    INSERT IGNORE INTO Dogs (name, size, owner_id)
    VALUES ('Bella', 'small', (SELECT user_id FROM Users WHERE username = 'carol123'));
    `);
    await db.execute(`
    INSERT IGNORE INTO Dogs (name, size, owner_id)
    VALUES ('Charlie', 'large', (SELECT user_id FROM Users WHERE username = 'alex'));
    `);
    await db.execute(`
    INSERT IGNORE INTO Dogs (name, size, owner_id)
    VALUES ('Happy', 'large', (SELECT user_id FROM Users WHERE username = 'harry'));
    `);
    await db.execute(`
    INSERT IGNORE INTO Dogs (name, size, owner_id)
    VALUES ('Rocky', 'medium', (SELECT user_id FROM Users WHERE username = 'bobwalker'));
    `);

    // Insert WalkRequests
    await db.execute(`
    INSERT IGNORE INTO WalkRequests (dog_id, requested_time, duration_minutes, location, status)
        VALUES
        ((SELECT dog_id FROM Dogs WHERE name = 'Max'), '2025-06-10 08:00:00', 30, 'Parklands', 'open'),
        ((SELECT dog_id FROM Dogs WHERE name = 'Bella'), '2025-06-10 09:30:00', 45, 'Beachside Ave', 'accepted'),
        ((SELECT dog_id FROM Dogs WHERE name = 'Charlie'), '2025-06-10 10:00:00', 20, 'Parklands', 'open'),
        ((SELECT dog_id FROM Dogs WHERE name = 'Happy'), '2025-06-10 10:30:00', 30, 'Ascot Park', 'cancelled'),
        ((SELECT dog_id FROM Dogs WHERE name = 'Rocky'), '2025-06-10 10:45:00', 40, 'Ascot Park', 'cancelled');
    `);
    }
    catch (err) {
    console.error('Error setting up database. Ensure Mysql is running: service mysql start', err);
  }
});

// Route 1 ('/api/dogs')
app.get('/api/dogs', async (req, res) => {
  try {
    const [rows] = await db.execute(`
    SELECT Dogs.name, Dogs.size, Users.username FROM Dogs
    INNER JOIN Users
    ON Dogs.owner_id = Users.user_id;
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch dogs' });
  }
});

// // Route 2 ('/api/walkrequests/open')
// app.get('/api/walkrequests/open', async (req, res) => {
//     try {
//       const [rows] = await db.execute('SELECT * FROM Dogs');

//       res.json(rows);
//     } catch (err) {
//       res.status(500).json({ error: 'Failed to open walk requests' });
//     }
//   });


// // Route 3 ('/api/walkers/summary')
// app.get('/api/walkers/summary', async (req, res) => {
//     try {
//       const [rows] = await db.execute('SELECT * FROM Dogs');

//       res.json(rows);
//     } catch (err) {
//       res.status(500).json({ error: 'Failed to fetch summary of walkers' });
//     }
//   });

app.use(express.static(path.join(__dirname, 'public')));

module.exports = app;
