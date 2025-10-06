const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const axios = require('axios');

// Get all locations
router.get('/locations', async (req, res) => {
    try {
        const [rows] = await pool.query(`
            SELECT id, location_name 
            FROM location_name
        `);
        res.json(rows);
    } catch (error) {
        console.error('Error fetching locations:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Handle move command
router.post('/manual-control/move', async (req, res) => {
    console.log('Manual Control Move');
    try {
        const { startSpotName, endSpotName } = req.body;

        if (!startSpotName || !endSpotName) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        // Query rcs_name for both spots
        const [startRows] = await pool.query(
            'SELECT rcs_name FROM location_name WHERE location_name = ?',
            [startSpotName]
        );
        const [endRows] = await pool.query(
            'SELECT rcs_name FROM location_name WHERE location_name = ?',
            [endSpotName]
        );

        if (!startRows.length || !endRows.length) {
            return res.status(404).json({ error: 'rcs_name not found for start or end spot' });
        }

        const rcsStart = startRows[0].rcs_name;
        const rcsEnd = endRows[0].rcs_name;

        // Generate 13-digit orderId
        const orderId = Date.now().toString().slice(0, 13);

        // Prepare payload
        const payload = {
            modelProcessCode: "pana02",
            fromSystem: "TSC",
            orderId: orderId,
            taskOrderDetail: [
                {
                    taskPath: `${rcsStart},${rcsEnd}`
                }
            ]
        };

        // Call robot API
        const apiUrl = 'http://172.16.16.209:7000/ics/taskOrder/addTask';
        let robotTaskResult = null;
        try {
            console.log('pay load = ',payload);
            const response = await axios.post(apiUrl, payload);
            robotTaskResult = response.data;
            console.log('Respornt from robot = ',response.data);
        } catch (robotError) {
            return res.status(200).json({
                message: 'Move command sent, but robot task failed',
                robotError: robotError.message
            });
        }

        res.json({
            message: 'Move command and robot task sent successfully',
            startSpotName,
            endSpotName,
            rcsStart,
            rcsEnd,
            orderId,
            robotTaskResult
        });
    } catch (error) {
        console.error('Error processing move command:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router; 