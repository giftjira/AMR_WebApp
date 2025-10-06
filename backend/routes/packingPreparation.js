const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');

// Get all pare preparation data
router.get('/packing-preparation', async (req, res) => {
    try {
        const [rows] = await pool.query(`
            SELECT *FROM pack_prepare
            ORDER BY last_serve ASC
        `);
        res.json(rows);
    } catch (error) {
        console.error('Error fetching packing preparation data:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Update status endpoint
router.post('/packing-preparation/update-status', async (req, res) => {
    try {
        const { id, status_start, start_spot, end_spot } = req.body;

        if (!id || !status_start) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        // Get current time in hh:mm:ss format
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const seconds = String(now.getSeconds()).padStart(2, '0');

        const currentDateTime = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;

        // Update the current row
        const [result] = await pool.query(
            'UPDATE pack_prepare SET status_start = ?, status_end = ?, last_serve = ? WHERE id = ?',
            [status_start, 'Prepare',currentDateTime, id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Record not found' });
        }

        // Set status_start = '-' for all other rows with the same selected_start_spot, except the current row
        await pool.query(
            'UPDATE pack_prepare SET status_start = ? WHERE selected_start_spot = ? AND id != ?',
            ['-', start_spot, id]
        );

        // If both start_spot and end_spot are provided, create robot task
        let robotTaskResult = null;
        let orderId = null;
        if (start_spot && end_spot) {
            // Get rcs_name for start_spot and end_spot
            const [startRows] = await pool.query(
                'SELECT rcs_name FROM location_name WHERE location_name = ?',
                [start_spot]
            );
            const [endRows] = await pool.query(
                'SELECT rcs_name FROM location_name WHERE location_name = ?',
                [end_spot]
            );

            if (!startRows.length || !endRows.length) {
                return res.status(404).json({ error: 'Location not found for robot task' });
            }

            const rcsStart = startRows[0].rcs_name;
            const rcsEnd = endRows[0].rcs_name;

            // Generate 13-digit orderId
            orderId = Date.now().toString().slice(0, 13);

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
            try {
                const response = await axios.post(apiUrl, payload);
                robotTaskResult = response.data;

                // Update tasid and tasldetail in part_prepare
                await pool.query(
                    'UPDATE pack_prepare SET taskid = ?, taskdetail = ? WHERE id = ?',
                    [orderId, 'created_start_spot', id]
                );
            } catch (robotError) {
                // Optionally, you can still return success for the status update, but include the robot error
                return res.status(200).json({
                    message: 'Status updated, but robot task failed',
                    robotError: robotError.message
                });
            }
        }

        res.json({
            message: 'Status updated successfully',
            orderId
        });
    } catch (error) {
        console.error('Error updating status:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Update selected_start_spot endpoint
router.post('/packing-preparation/update-selected-start-spot', async (req, res) => {
    try {
        const { id, end_spot, selectedName } = req.body;
        
        if (!id || !end_spot || !selectedName) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        // First, get the location_id from location_name table
        const [locationResult] = await pool.query(
            'SELECT id FROM location_name WHERE location_name = ?',
            [selectedName]
        );

        if (locationResult.length === 0) {
            return res.status(404).json({ error: 'Location not found' });
        }

        const locationId = locationResult[0].id;

        // Update both selected_start_spot and id_selected_start_spot
        const [result] = await pool.query(
            'UPDATE pack_prepare SET selected_start_spot = ?, id_selected_start_spot = ? WHERE id = ? AND end_spot = ?',
            [selectedName, locationId, id, end_spot]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Record not found' });
        }

        res.json({ 
            message: 'Selected start spot updated successfully',
            id,
            end_spot,
            selectedName,
            locationId
        });
    } catch (error) {
        console.error('Error updating selected start spot:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router; 