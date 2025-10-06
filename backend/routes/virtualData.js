const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const axios = require('axios');

/**
 * Helper to compute AMR status in backend (robust against whitespace/nulls)
 */
function computeAmrStatus(taskdetail, status_start, status_end) {
  const td = (taskdetail || '').trim();
  const ss = (status_start || '').trim();
  const se = (status_end || '').trim();
  if (td === 'created_start_spot' && ss === 'Waiting') return 'Going ⇒';
  if (td === 'created_end_spot' && se === 'Waiting') return '⇐ Returning';
  return '';
}

// Get combined data from part_prepare and pack_prepare
router.get('/virtual-data', async (req, res) => {
  try {
    // FIXED: Always show MB-FG-01 and MB-FG-02, regardless of mem_location occupancy
    const [mbData] = await pool.query(`
      SELECT COALESCE(p.id, 0) as id,
             COALESCE(m.from_spot, '') AS start_spot,
             m.destination_spot AS end_spot,
             CASE 
               WHEN p.id IS NOT NULL THEN TRIM(p.status_start)
               ELSE ''
             END AS status_start,
             CASE 
               WHEN p.id IS NOT NULL THEN TRIM(p.status_end)
               ELSE 'Waiting'
             END AS status_end,
             COALESCE(p.taskdetail, '') as taskdetail,
             'part' AS tableType
      FROM mem_location m
      LEFT JOIN part_prepare p ON m.id_partPrepare = p.id
      WHERE m.destination_spot IN ('MB-FG-01', 'MB-FG-02')
    `);

    // Get non-MB part_prepare data (exclude rows that are already in mem_location)
    const [partData] = await pool.query(`
      SELECT p.id,
             p.start_spot,
             p.selected_end_spot AS end_spot,
             TRIM(p.status_start) AS status_start,
             TRIM(p.status_end) AS status_end,
             p.taskdetail,
             'part' AS tableType
      FROM part_prepare p
      INNER JOIN (
        SELECT selected_end_spot,
               CASE
                 WHEN MAX(CASE WHEN taskdetail IN ('created_start_spot','created_end_spot') THEN id ELSE 0 END) > 0
                 THEN MAX(CASE WHEN taskdetail IN ('created_start_spot','created_end_spot') THEN id ELSE 0 END)
                 ELSE MAX(id)
               END AS chosen_id
        FROM part_prepare
        WHERE selected_end_spot IS NOT NULL
          AND selected_end_spot NOT IN ('MB-FG-01', 'MB-FG-02')  -- Exclude MB spots
        GROUP BY selected_end_spot
      ) t ON p.id = t.chosen_id
      WHERE NOT EXISTS (
        SELECT 1 FROM mem_location m 
        WHERE m.id_partPrepare = p.id
      )
    `);

    // Get pack_prepare data (unchanged)
    const [packData] = await pool.query(`
      SELECT k.id,
             k.selected_start_spot AS start_spot,
             k.end_spot,
             TRIM(k.status_start) AS status_start,
             TRIM(k.status_end) AS status_end,
             k.taskdetail,
             'pack' AS tableType
      FROM pack_prepare k
      INNER JOIN (
        SELECT end_spot,
               CASE
                 WHEN MAX(CASE WHEN taskdetail IN ('created_start_spot','created_end_spot') THEN id ELSE 0 END) > 0
                 THEN MAX(CASE WHEN taskdetail IN ('created_start_spot','created_end_spot') THEN id ELSE 0 END)
                 ELSE MAX(id)
               END AS chosen_id
        FROM pack_prepare
        WHERE end_spot IS NOT NULL
        GROUP BY end_spot
      ) t ON k.id = t.chosen_id
    `);

    // Combine all data: MB data (from mem_location) + non-MB part data + pack data
    const combined = [...mbData, ...partData, ...packData].map(r => {
      const amr_status = computeAmrStatus(r.taskdetail, r.status_start, r.status_end);
      return {
        id: r.id,
        end_spot: r.end_spot,
        status_end: r.status_end,
        status_start: r.status_start,
        taskdetail: r.taskdetail,
        tableType: r.tableType,
        start_spot: r.start_spot,
        amr_status
      };
    });

    // Group by end_spot (shape compatible with existing FE)
    const grouped = combined.reduce((acc, curr) => {
      if (!acc[curr.end_spot]) acc[curr.end_spot] = [];
      acc[curr.end_spot].push({
        id: curr.id,
        status_end: curr.status_end,
        status_start: curr.status_start,
        taskdetail: curr.taskdetail,
        tableType: curr.tableType,
        start_spot: curr.start_spot,
        amr_status: curr.amr_status,
      });
      return acc;
    }, {});

    const result = Object.entries(grouped)
      .map(([end_spot, items]) => ({
        end_spot,
        items
      }))
      .sort((a, b) => a.end_spot.localeCompare(b.end_spot)); // FIXED: Sort by end_spot name

    res.json(result);
  } catch (error) {
    console.error('Error fetching virtual data:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update status based on end_spot
router.post('/virtual-update-status', async (req, res) => {
  const conn = pool;
  try {
    const { end_spot } = req.body;

    if (!end_spot) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    let start_spot = null;
    let tableType = null;
    let rowId = null;

    // FIXED: For MB spots, check mem_location first
    if (end_spot === 'MB-FG-01' || end_spot === 'MB-FG-02') {
      const [mbRows] = await conn.query(
        `SELECT p.id, m.from_spot as start_spot 
         FROM mem_location m
         INNER JOIN part_prepare p ON m.id_partPrepare = p.id
         WHERE m.destination_spot = ? AND p.status_end = 'Prepare'
         LIMIT 1`,
        [end_spot]
      );
      
      if (mbRows.length) {
        start_spot = mbRows[0].start_spot;
        tableType = 'part_prepare';
        rowId = mbRows[0].id;
      }
    } else {
      // Try part_prepare for non-MB
      const [partRows] = await conn.query(
        "SELECT id, start_spot FROM part_prepare WHERE selected_end_spot = ? AND (status_end = 'Prepare') LIMIT 1",
        [end_spot]
      );

      if (partRows.length) {
        start_spot = partRows[0].start_spot;
        tableType = 'part_prepare';
        rowId = partRows[0].id;
      } else {
        // Try pack_prepare
        const [packRows] = await conn.query(
          "SELECT id, selected_start_spot FROM pack_prepare WHERE end_spot = ? AND (status_end = 'Prepare') LIMIT 1",
          [end_spot]
        );
        if (packRows.length) {
          start_spot = packRows[0].selected_start_spot;
          tableType = 'pack_prepare';
          rowId = packRows[0].id;
        }
      }
    }

    if (!start_spot || !rowId) {
      return res.status(404).json({ error: 'No start_spot found for this end_spot' });
    }

    // rcs lookup
    const [endRcsRows] = await conn.query(
      'SELECT rcs_name FROM location_name WHERE location_name = ?',
      [end_spot]
    );
    const [startRcsRows] = await conn.query(
      'SELECT rcs_name FROM location_name WHERE location_name = ?',
      [start_spot]
    );

    if (!endRcsRows.length || !startRcsRows.length) {
      return res.status(404).json({ error: 'rcs_name not found for start or end spot' });
    }

    const rcsEnd = endRcsRows[0].rcs_name;
    const rcsStart = startRcsRows[0].rcs_name;

    const orderId = Date.now().toString().slice(0, 13);

    // Set proper status - end_spot should show "Ready" first
    if (tableType === 'part_prepare') {
      await conn.query(
        'UPDATE part_prepare SET status_end = ?, status_start = ? WHERE id = ?',
        ['Ready', 'Prepare', rowId]
      );
    } else if (tableType === 'pack_prepare') {
      await conn.query(
        'UPDATE pack_prepare SET status_end = ? WHERE end_spot = ?',
        ['Ready', end_spot]
      );
    } else {
      return res.status(400).json({ error: 'Invalid end_spot format' });
    }

    // Robot task (return trip: End -> Start)
    const payload = {
      modelProcessCode: "pana02",
      fromSystem: "TSC",
      orderId: orderId,
      taskOrderDetail: [
        { taskPath: `${rcsEnd},${rcsStart}` }
      ]
    };

    const apiUrl = 'http://172.16.16.209:7000/ics/taskOrder/addTask';
    try {
      const response = await axios.post(apiUrl, payload);
      if (tableType === 'part_prepare') {
        await conn.query(
          'UPDATE part_prepare SET taskid = ?, taskdetail = ? WHERE id = ?',
          [orderId, 'created_end_spot', rowId]
        );
      } else if (tableType === 'pack_prepare') {
        await conn.query(
          'UPDATE pack_prepare SET taskid = ?, taskdetail = ? WHERE id = ?',
          [orderId, 'created_end_spot', rowId]
        );
      }
      res.json({
        message: 'Status updated successfully',
        end_spot,
        start_spot,
        rcsEnd,
        rcsStart,
        status_end: 'Ready',
        orderId
      });
    } catch (robotError) {
      return res.status(200).json({
        message: 'Status updated, but robot task failed',
        robotError: robotError.message
      });
    }
  } catch (error) {
    console.error('Error updating status:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;