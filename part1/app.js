var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');
var mysql = require('mysql2/promise');

var app = express();
const PORT = 8080;

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());


// Database db
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

// Create tables if they don't exist
    // Users
    await db.execute(`
    CREATE TABLE IF NOT EXISTS Users (
        user_id INT AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        email VARCHAR(100) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        role ENUM('owner', 'walker') NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    `);

    // Dogs
    await db.execute(`
    CREATE TABLE IF NOT EXISTS Dogs (
        dog_id INT AUTO_INCREMENT PRIMARY KEY,
        owner_id INT NOT NULL,
        name VARCHAR(50) NOT NULL,
        size ENUM('small', 'medium', 'large') NOT NULL,
        FOREIGN KEY (owner_id) REFERENCES Users(user_id)
    )
    `);

    // WalkRequests
    await db.execute(`
    CREATE TABLE IF NOT EXISTS WalkRequests (
        request_id INT AUTO_INCREMENT PRIMARY KEY,
        dog_id INT NOT NULL,
        requested_time DATETIME NOT NULL,
        duration_minutes INT NOT NULL,
        location VARCHAR(255) NOT NULL,
        status ENUM('open', 'accepted', 'completed', 'cancelled') DEFAULT 'open',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (dog_id) REFERENCES Dogs(dog_id)
    )
    `);

    // WalkApplication
    await db.execute(`
    CREATE TABLE IF NOT EXISTS WalkApplications (
        application_id INT AUTO_INCREMENT PRIMARY KEY,
        request_id INT NOT NULL,
        walker_id INT NOT NULL,
        applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        status ENUM('pending', 'accepted', 'rejected') DEFAULT 'pending',
        FOREIGN KEY (request_id) REFERENCES WalkRequests(request_id),
        FOREIGN KEY (walker_id) REFERENCES Users(user_id),
        CONSTRAINT unique_application UNIQUE (request_id, walker_id)
    )
    `);

    // WalkRatings
    await db.execute(`
    CREATE TABLE IF NOT EXISTS  WalkRatings (
        rating_id INT AUTO_INCREMENT PRIMARY KEY,
        request_id INT NOT NULL,
        walker_id INT NOT NULL,
        owner_id INT NOT NULL,
        rating INT CHECK (rating BETWEEN 1 AND 5),
        comments TEXT,
        rated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (request_id) REFERENCES WalkRequests(request_id),
        FOREIGN KEY (walker_id) REFERENCES Users(user_id),
        FOREIGN KEY (owner_id) REFERENCES Users(user_id),
        CONSTRAINT unique_rating_per_walk UNIQUE (request_id)
    )
    `);

    // To reset database after each testing
    await db.execute('DELETE FROM WalkRatings');
    await db.execute('DELETE FROM WalkApplications');
    await db.execute('DELETE FROM WalkRequests');
    await db.execute('DELETE FROM Dogs');
    await db.execute('DELETE FROM Users');

// Insert tables if database is empty
    // Insert Users
    const [row_user] = await db.execute('SELECT COUNT(*) AS count FROM Users');
    if (row_user[0].count === 0) {
        await db.execute(`
        INSERT INTO Users (username, email, password_hash, role) VALUES
        ('alice123', 'alice@example.com', 'hashed123', 'owner'),
        ('bobwalker', 'bob@example.com', 'hashed456', 'walker'),
        ('carol123', 'carol@example.com', 'hashed789', 'owner'),
        ('alex', 'alex@example.com', 'hashed100', 'walker'),
        ('harry', 'harry@example.com', 'hashed101', 'owner')
        `);
    }

    // Insert Dogs
    const [row_dog] = await db.execute('SELECT COUNT(*) AS count FROM Dogs');
    if (row_dog[0].count === 0) {
        await db.execute(`
        INSERT INTO Dogs (name, size, owner_id) VALUES
        ('Max', 'medium', (SELECT user_id FROM Users WHERE username = 'alice123')),
        ('Bella', 'small', (SELECT user_id FROM Users WHERE username = 'carol123')),
        ('Charlie', 'large', (SELECT user_id FROM Users WHERE username = 'alex')),
        ('Happy', 'large', (SELECT user_id FROM Users WHERE username = 'harry')),
        ('Rocky', 'medium', (SELECT user_id FROM Users WHERE username = 'bobwalker'))
        `);
    }

    // Insert WalkRequests
    const [row_request] = await db.execute('SELECT COUNT(*) AS count FROM WalkRequests');
    if (row_request[0].count === 0) {
        await db.execute(`
        INSERT INTO WalkRequests (dog_id, requested_time, duration_minutes, location, status) VALUES
        ((SELECT dog_id FROM Dogs WHERE name = 'Max'), '2025-06-10 08:00:00', 30, 'Parklands', 'open'),
        ((SELECT dog_id FROM Dogs WHERE name = 'Bella'), '2025-06-10 09:30:00', 45, 'Beachside Ave', 'accepted'),
        ((SELECT dog_id FROM Dogs WHERE name = 'Charlie'), '2025-06-10 10:00:00', 20, 'Parklands', 'open'),
        ((SELECT dog_id FROM Dogs WHERE name = 'Happy'), '2025-06-10 10:30:00', 30, 'Ascot Park', 'cancelled'),
        ((SELECT dog_id FROM Dogs WHERE name = 'Rocky'), '2025-06-10 10:45:00', 40, 'Ascot Park', 'cancelled')
        `);
        }
    } catch (err) {
    console.error('Error setting up database. Ensure Mysql is running: service mysql start', err);
  }
})();

// Route 1 ('/api/dogs')
app.get('/api/dogs', async (req, res) => {
  try {
    const [rows] = await db.execute(`
    SELECT
        Dogs.name AS dog_name,
        Dogs.size AS size,
        Users.username AS owner_username
    FROM Dogs
    INNER JOIN Users
    ON Dogs.owner_id = Users.user_id;
    `);
    res.json(rows);
  } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch dogs' });
  }
});

// Route 2 ('/api/walkrequests/open')
app.get('/api/walkrequests/open', async (req, res) => {
    try {
      const [rows] = await db.execute(`
      SELECT
        WalkRequests.request_id AS request_id,
        Dogs.name AS dog_name,
        WalkRequests.requested_time AS requested_time,
        WalkRequests.duration_minutes AS duration_minutes,
        WalkRequests.location AS location,
        Users.username AS owner_username
      FROM (( WalkRequests
      INNER JOIN Dogs ON WalkRequests.dog_id = Dogs.dog_id )
      INNER JOIN Users ON Dogs.owner_id = Users.user_id )
      WHERE WalkRequests.status = 'open';
      `);

    res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to open walk requests' });
    }
  });


// Route 3 ('/api/walkers/summary')
app.get('/api/walkers/summary', async (req, res) => {
    try {
      const [rows] = await db.execute(`
      SELECT
        Users.username AS walker_username,
        COUNT(DISTINCT WalkRatings.rating_id) AS total_ratings,
        ROUND(AVG(WalkRatings.rating_id), 1) AS average_rating,
        (
            SELECT COUNT(*)
            FROM WalkApplications
            JOIN WalkRequests ON WalkApplications.request_id = WalkRequests.request_id
            WHERE WalkApplications.walker_id = Users.user_id
            AND WalkApplications.status = 'accepted'
            AND WalkRequests.status = 'completed'
        ) AS completed_walks
        FROM Users
        LEFT JOIN WalkRatings ON Users.user_id = WalkRatings.walker_id
        WHERE Users.role = 'walker'
        GROUP BY Users.user_id
      `);

      res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch summary of walkers' });
    }
  });

app.use(express.static(path.join(__dirname, 'public')));

module.exports = app;
