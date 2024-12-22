const express = require('express');
const path = require('path');
const mysql = require('mysql2');
const session = require('express-session');
const bodyParser = require('body-parser');

const app=express();

// Use body-parser to handle URL-encoded data and JSON data
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());


// Middleware to parse POST request data
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'public'));

// MySQL Database connection pool
const pool = mysql.createPool({
    host: 'localhost',
    user: 'root', // your database username
    password: 'kashyap', // your database password
    database: 'event_manager',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// Session setup
app.use(session({
    secret: 'secretkey', // Change this to a more secure key
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false } // Set 'secure: true' for HTTPS
}));

// Function to test MySQL connection
async function testDbConnection() {
    try {
        // Attempt to execute a simple query to check the connection
        await pool.promise().query('SELECT 1');
        console.log('Database connection successful!');
    } catch (err) {
        console.error('Database connection failed:', err);
    }
}

// Test the DB connection when the server starts
testDbConnection();

// Serve static files from the 'public' folder
app.use(express.static(path.join(__dirname, 'public')));

// Route to render the dashboard
app.get('/', (req, res) => {
    if (req.session.loggedIn) {
        const query = 'SELECT * FROM events';
        pool.execute(query, (err, results) => {
        if (err) {
            console.error(err);
            return res.status(500).send('Database error');
        }
        // Pass events data to the EJS file
        res.render('dashboard', { events: results });
        console.log(results);
    });
    } else {
        res.redirect('/login');
    }
});


// Route to handle user signup
app.post('/signup', (req, res) => {
    const { fname, lname, email, password } = req.body;

    // Check if all fields are provided
    if (!fname || !lname || !email || !password) {
        return res.status(400).send('All fields are required');
    }

    // Check if the email already exists
    const checkEmailQuery = 'SELECT email FROM signup WHERE email = ?';
    pool.execute(checkEmailQuery, [email], (err, results) => {
        if (err) {
            console.error(err);
            return res.status(500).send('Database error');
        }

        if (results.length > 0) {
            return res.status(409).send('Email already exists');
        }

        // Insert the new user into the `signup` table
        const signupQuery = 'INSERT INTO signup (fname, lname, email, password) VALUES (?, ?, ?, ?)';
        pool.execute(signupQuery, [fname, lname, email, password], (err, results) => {
            if (err) {
                console.error(err);
                return res.status(500).send('Database error');
            }

            // Also insert into the `login` table
            const loginQuery = 'INSERT INTO login (username, password) VALUES (?, ?)';
            pool.execute(loginQuery, [email, password], (err, results) => {
                if (err) {
                    console.error(err);
                    return res.status(500).send('Error creating login record');
                }

                res.send('Signup successful');
            });
        });
    });
});


// Route for Login page
app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'signin.html'));
});

// Handle Login POST request
app.post('/login', (req, res) => {
    const { username, password } = req.body;

    // Query the database to check if the username and password match
    pool.execute('SELECT * FROM login WHERE username = ? AND password = ?', [username, password], (err, results) => {
        if (err) {
            console.error(err);
            res.status(500).send('Server error');
        } else if (results.length > 0) {
            // Set session data if login is successful
            req.session.loggedIn = true;
            req.session.username = username;
            res.redirect('/');
        } else {
            // Send an error message to the client-side
            res.status(401).json({ error: 'Invalid username or password' });
        }
    });
});

app.get('/events', (req, res) => {
    const query = 'SELECT * FROM events';
    pool.execute(query, (err, results) => {
        if (err) {
            console.error(err);
            return res.status(500).send('Database error');
        }
        // Pass events data to the EJS file
        res.render('events', { events: results });
    });
});

app.get('/attendees', (req, res) => {
    if (req.session.loggedIn) {
        res.sendFile(path.join(__dirname, 'public', 'pagenotfound.html'));
    } else {
        res.redirect('/login');
    }
});

app.get('/tasks', (req, res) => {
    if (req.session.loggedIn) {
        const query='Select * from tasks';
        pool.execute(query, (err, results) => {
            if (err) {
                console.error(err);
                return res.status(500).send('Database error');
            }
            // Pass events data to the EJS file
            console.log(results);
            res.render('tasks', { events: results });
        });

    } else {
        res.redirect('/login');
    }
});

app.post('/add-task', (req, res) => {
    if (req.session.loggedIn) {
        // Destructure form data from the request body
        const { title, description, priority, assignee, due_date } = req.body;

        // Default status for a new task is 'Pending'
        const status = 'Pending';

        // Insert query for adding the task to the database
        const query = 'INSERT INTO tasks (title, description, priority, status, assignee, due_date) VALUES (?, ?, ?, ?, ?, ?)';

        // Execute the query with the provided data
        pool.execute(query, [title, description, priority, status, assignee, due_date], (err, results) => {
            if (err) {
                console.error('Database error:', err);
                return res.status(500).send('Database error');
            }

            // Redirect to the tasks page or reload the tasks view
            console.log('Task added:', results);
            res.redirect('/tasks'); // Redirect to '/tasks' to refresh the list of tasks
        });
    } else {
        res.redirect('/login'); // Redirect to login if the user is not logged in
    }
});


app.post('/add-event', (req, res) => {
    if (req.session.loggedIn) {
        const { eventName, eventDescription, eventLocation,eventAttendees ,eventDate, eventCompletion } = req.body;
        console.log(eventName,eventDescription,eventLocation,eventDate,eventCompletion);

        // Validate input to prevent SQL injection or incorrect data
        if (!eventName || !eventDescription || !eventLocation || !eventDate || eventCompletion < 0 || eventCompletion > 100) {
            return res.status(400).send('Invalid input');
        }

        const query = 'INSERT INTO events (event_name, description, event_date, location, completion_percentage,attendees) VALUES (?, ?, ?, ?, ?,?);';
        pool.execute(query, [eventName, eventDescription, eventDate, eventLocation, eventCompletion,eventAttendees], (err, results) => {
            if (err) {
                console.error(err);
                return res.status(500).send('Database error');
            }

            // Redirect or send success response
            res.redirect('/events');
        });
    } else {
        res.redirect('/login');
    }
});


// Handle Logout
app.get('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            return res.status(500).send('Failed to log out');
        }
        res.redirect('/login');
    });
});

// Start the server
const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
