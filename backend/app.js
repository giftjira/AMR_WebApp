const express = require('express');
const cors = require('cors');
const routes = require('./routes');
const parePreparationRoutes = require('./routes/parePreparation');
const packingPreparationRoutes = require('./routes/packingPreparation');
const manualControlRoutes = require('./routes/manualControl');
const virtualDataRoutes = require('./routes/virtualData');
const troubleshootingRoutes = require('./routes/troubleshooting');

const pool = require('./config/db');


const app = express();
const port = process.env.PORT || 3001;

require('./routes/taskStatusChecker');


// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/', routes);
app.use('/api', parePreparationRoutes);
app.use('/api', packingPreparationRoutes);
app.use('/api', manualControlRoutes);
app.use('/api', virtualDataRoutes);
app.use('/api', troubleshootingRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).send('Something broke!');
});

// Keep MySQL connection alive
setInterval(() => {
  pool.query('SELECT 1')
    .then(() => console.log('Database keep-alive query sent'))
    .catch(err => console.error('Keep-alive query error:', err));
}, 10 * 60 * 1000); // 10 minutes

// Start server
app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
}); 