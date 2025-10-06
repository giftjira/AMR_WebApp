const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');

// Get all pare preparation data
router.get('/pare-preparation', async (req, res) => {
  try {
    const [rows] = await pool.query(`SELECT * FROM part_prepare`);
    res.json(rows);
  } catch (error) {
    console.error('Error fetching pare preparation data:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update status endpoint
router.post('/pare-preparation/update-status', async (req, res) => {
  try {
    const { id, status_start, start_spot, end_spot } = req.body;

    console.log(req.body);

    let status_end = '';
    let final_end_spot = end_spot;

    if (status_start === 'Ready') {
      status_end = 'In Use';
    } else {
      status_end = 'Prepare';
    }

    if (!id || !status_start) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Check if end_spot is MB-FG-01 or MB-FG-02
    if (end_spot === 'MB-FG-01' || end_spot === 'MB-FG-02') {
      // Check for existing rows with null or empty from_spot
      const [existingRows] = await pool.query(
        'SELECT * FROM mem_location WHERE from_spot IS NULL OR from_spot = ""'
      );

      if (existingRows.length > 0) {
        const spot = existingRows[0].destination_spot;
        if (spot === 'MB-FG-01' || spot === 'MB-FG-02') {
          final_end_spot = spot;
        }
      } else {
        return res.json({ message: 'End_spot Not empty' });
      }
    }
    console.log('final_End spot', final_end_spot);

    const [Update_selected] = await pool.query(
      'UPDATE part_prepare SET selected_end_spot = ? WHERE id = ?',
      [final_end_spot, id]
    );

    // For MB case during Going Task, status_end should be 'Waiting', not 'Prepare'
    let target_status_end = 'Prepare';
    if ((final_end_spot === 'MB-FG-01' || final_end_spot === 'MB-FG-02') && status_start === 'Ready') {
      target_status_end = 'Waiting';  // MB case should show Waiting during Going Task
    }

    const [result] = await pool.query(
      'UPDATE part_prepare SET status_start = ? , status_end = ? WHERE id = ?',
      [status_start, target_status_end, id]
    );

    if (end_spot === 'MB-FG-01' || end_spot === 'MB-FG-02') {
      await pool.query(
        'UPDATE mem_location SET from_spot = ? , id_partPrepare = ? WHERE destination_spot = ?',
        [start_spot, id, final_end_spot]
      );

      // wait 300ms
      await new Promise((resolve) => setTimeout(resolve, 300));

      const [existingRows2] = await pool.query(
        'SELECT * FROM mem_location WHERE from_spot IS NULL OR from_spot = ""'
      );
      console.log('existigRow2 = ', existingRows2.length);
      console.log(existingRows2);

      if (existingRows2.length === 0) {
        // FIXED: Only set Queue status for rows that are NOT currently assigned to mem_location
        // This prevents overwriting active MB rows that are in the middle of tasks
        await pool.query(
          `UPDATE part_prepare
           SET status_start = 'Queue', status_end = 'Waiting'
           WHERE start_spot LIKE 'MB-%'
             AND status_start != 'Waiting'
             AND NOT EXISTS (
               SELECT 1 FROM mem_location m 
               WHERE m.id_partPrepare = part_prepare.id
                 AND m.from_spot IS NOT NULL
             )`,
          []
        );
      }
    }

    if (result.affectedRows === 0 || Update_selected.affectedRows === 0) {
      return res.status(404).json({ error: 'Record not found' });
    }

    // If both start_spot and end_spot are provided, create robot task
    let robotTaskResult = null;
    let orderId = null;
    if (start_spot && final_end_spot) {
      const [startRows] = await pool.query(
        'SELECT rcs_name FROM location_name WHERE location_name = ?',
        [start_spot]
      );
      const [endRows] = await pool.query(
        'SELECT rcs_name FROM location_name WHERE location_name = ?',
        [final_end_spot]
      );

      if (!startRows.length || !endRows.length) {
        return res.status(404).json({ error: 'Location not found for robot task' });
      }

      const rcsStart = startRows[0].rcs_name;
      const rcsEnd = endRows[0].rcs_name;

      // Generate 13-digit orderId
      orderId = Date.now().toString().slice(0, 13);

      const payload = {
        modelProcessCode: 'pana02',
        fromSystem: 'TSC',
        orderId: orderId,
        taskOrderDetail: [
          {
            taskPath: `${rcsStart},${rcsEnd}`,
          },
        ],
      };

      const apiUrl = 'http://172.16.16.209:7000/ics/taskOrder/addTask';
      try {
        const response = await axios.post(apiUrl, payload);
        robotTaskResult = response.data;

        await pool.query(
          'UPDATE part_prepare SET taskid = ?, taskdetail = ? WHERE id = ?',
          [orderId, 'created_start_spot', id]
        );
      } catch (robotError) {
        return res.status(200).json({
          message: 'Status updated, but robot task failed',
          robotError: robotError.message,
        });
      }
    }

    res.json({
      message: 'Status updated successfully',
      orderId,
      final_end_spot,
    });
  } catch (error) {
    console.error('Error updating status:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update selected_end_spot endpoint
router.post('/pare-preparation/update-selected-end-spot', async (req, res) => {
  try {
    const { id, start_spot, selectedName } = req.body;

    if (!id || !start_spot || !selectedName) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const [locationResult] = await pool.query(
      'SELECT id FROM location_name WHERE location_name = ?',
      [selectedName]
    );

    if (locationResult.length === 0) {
      return res.status(404).json({ error: 'Location not found' });
    }

    const locationId = locationResult[0].id;

    const [result] = await pool.query(
      'UPDATE part_prepare SET selected_end_spot = ?, id_selected_end_spot = ? WHERE id = ? AND start_spot = ?',
      [selectedName, locationId, id, start_spot]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Record not found' });
    }

    res.json({
      message: 'Selected end spot updated successfully',
      id,
      start_spot,
      selectedName,
      locationId,
    });
  } catch (error) {
    console.error('Error updating selected end spot:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// --- NEW: Get motor models master list ---
router.get('/motor-models', async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT model FROM motorblock_model WHERE model IS NOT NULL AND model <> "" ORDER BY model ASC'
    );
    res.json(rows.map(r => r.model));
  } catch (error) {
    console.error('Error fetching motor models:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// --- NEW: Update motor_model for a part_prepare row (MB-XX only) ---
router.post('/pare-preparation/update-motor-model', async (req, res) => {
  try {
    const { id, motor_model } = req.body;
    if (!id) return res.status(400).json({ error: 'Missing id' });

    // Ensure the target row exists and is an MB start spot
    const [rows] = await pool.query(
      'SELECT start_spot FROM part_prepare WHERE id = ? LIMIT 1',
      [id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Record not found' });

    const start_spot = rows[0].start_spot || '';
    const isMB = /^MB-/i.test(start_spot);
    if (!isMB) {
      return res.status(400).json({ error: 'Motor Model is only applicable for MB-XX start spots' });
    }

    // Optional: validate model exists in motorblock_model (skip if not required)
    if (motor_model && motor_model.length) {
      const [mm] = await pool.query(
        'SELECT 1 FROM motorblock_model WHERE model = ? LIMIT 1',
        [motor_model]
      );
      if (!mm.length) {
        return res.status(400).json({ error: 'Unknown motor model' });
      }
    }

    await pool.query(
      'UPDATE part_prepare SET motor_model = ? WHERE id = ?',
      [motor_model || null, id]
    );

    res.json({ message: 'Motor model updated', id, motor_model: motor_model || null });
  } catch (error) {
    console.error('Error updating motor model:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

function get13DigitOrderId() {
  return Date.now().toString().slice(0, 13);
}

module.exports = router;