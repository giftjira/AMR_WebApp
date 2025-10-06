// server/routes/troubleshooting.js
const express = require('express');
const router = express.Router();
const pool = require('../config/db');

/**
 * Utility: map a DB row into the UI shape
 */
const partRowToUI = (r) => ({
  domain: 'part',
  start_spot: r.start_spot,
  status_start: r.status_start,
  end_spot: r.selected_end_spot,
  status_end: r.status_end,
});

const packRowToUI = (r) => ({
  domain: 'pack',
  start_spot: r.selected_start_spot,
  status_start: r.status_start,
  end_spot: r.end_spot,
  status_end: r.status_end,
});

/**
 * GET /api/troubleshooting/options
 */
router.get('/troubleshooting/options', async (req, res) => {
  try {
    const [partSpots] = await pool.query(
      `SELECT DISTINCT start_spot FROM part_prepare WHERE start_spot IS NOT NULL ORDER BY start_spot`
    );
    const [packSpots] = await pool.query(
      `SELECT DISTINCT end_spot FROM pack_prepare WHERE end_spot IS NOT NULL ORDER BY end_spot`
    );

    res.json({
      partStartSpots: partSpots.map((r) => r.start_spot),
      packEndSpots: packSpots.map((r) => r.end_spot),
    });
  } catch (err) {
    console.error('TS options error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/troubleshooting/part-rows?start_spot=ALL
 */
router.get('/troubleshooting/part-rows', async (req, res) => {
  try {
    const { start_spot } = req.query;
    const where = start_spot && start_spot !== 'ALL' ? 'WHERE start_spot = ?' : '';
    const params = start_spot && start_spot !== 'ALL' ? [start_spot] : [];

    const [rows] = await pool.query(
      `SELECT id, start_spot, selected_end_spot, status_start, status_end
       FROM part_prepare ${where}
       ORDER BY start_spot, selected_end_spot, id DESC`,
      params
    );

    const latestByPair = new Map();
    for (const r of rows) {
      const key = `${r.start_spot}__${r.selected_end_spot}`;
      if (!latestByPair.has(key)) latestByPair.set(key, r);
    }

    res.json(Array.from(latestByPair.values()).map(partRowToUI));
  } catch (err) {
    console.error('TS part-rows error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/troubleshooting/pack-rows?end_spot=ALL
 */
router.get('/troubleshooting/pack-rows', async (req, res) => {
  try {
    const { end_spot } = req.query;
    const where = end_spot && end_spot !== 'ALL' ? 'WHERE end_spot = ?' : '';
    const params = end_spot && end_spot !== 'ALL' ? [end_spot] : [];

    const [rows] = await pool.query(
      `SELECT id, selected_start_spot, end_spot, status_start, status_end
       FROM pack_prepare ${where}
       ORDER BY selected_start_spot, end_spot, id DESC`,
      params
    );

    const latestByPair = new Map();
    for (const r of rows) {
      const key = `${r.selected_start_spot}__${r.end_spot}`;
      if (!latestByPair.has(key)) latestByPair.set(key, r);
    }

    res.json(Array.from(latestByPair.values()).map(packRowToUI));
  } catch (err) {
    console.error('TS pack-rows error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/troubleshooting/reset
 * Body: { domain: 'part'|'pack', start_spot, end_spot, cartPosition: 'Start'|'End' }
 *
 * - DY / Pack:
 *    Start => status_start='Prepare', status_end='Waiting', taskdetail='Finish'
 *    End   => status_start='Waiting', status_end='Prepare', taskdetail='Finish'
 * - MB (end spot like MB-XX / MB-FG-01/02):
 *    Start => status_start='In Use', status_end='Waiting', taskdetail='Finish'
 *             mem_location: from_spot=NULL, id_partPrepare=NULL
 *             also promote part_prepare with same selected_end_spot and status_start='Queue'
 *               -> status_start='In Use', status_end='Waiting'
 *    End   => use mem_location.id_partPrepare to find *exact* part_prepare id and its start_spot
 *             update that part row to status_start='Waiting', status_end='Prepare', taskdetail='Finish'
 *             mem_location: from_spot=<remembered start_spot>, id_partPrepare=<that id>
 *
 * - NEW: After resetting **Packing** with **Cart position = Start**, update other rows in `pack_prepare`
 *        with the same `selected_start_spot` and `status_start='-'` to
 *        `status_start='Prepare'`, `status_end='Waiting'`.
 */
router.post('/troubleshooting/reset', async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const { domain, start_spot, end_spot, cartPosition } = req.body;
    if (!domain || !start_spot || !end_spot || !cartPosition) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const isMBEndSpot = /^MB-/i.test(end_spot) || end_spot === 'MB-FG-01' || end_spot === 'MB-FG-02';
    const atStart = cartPosition === 'Start';

    let status_start, status_end;
    if (isMBEndSpot) {
      status_start = atStart ? 'In Use' : 'Waiting';
      status_end   = atStart ? 'Waiting' : 'Prepare';
    } else {
      status_start = atStart ? 'Prepare' : 'Waiting';
      status_end   = atStart ? 'Waiting' : 'Prepare';
    }

    await conn.beginTransaction();

    // Update the target row in the domain table; capture id where needed
    let targetId = null;

    if (domain === 'part') {
      const [rows] = await conn.query(
        `SELECT id FROM part_prepare
         WHERE start_spot = ? AND selected_end_spot = ?
         ORDER BY id DESC LIMIT 1`,
        [start_spot, end_spot]
      );
      if (!rows.length) throw new Error('Pair not found in part_prepare');
      targetId = rows[0].id;

      await conn.query(
        `UPDATE part_prepare
           SET status_start = ?, status_end = ?, taskdetail = 'Finish'
         WHERE id = ?`,
        [status_start, status_end, targetId]
      );
    } else if (domain === 'pack') {
      const [rows] = await conn.query(
        `SELECT id FROM pack_prepare
         WHERE selected_start_spot = ? AND end_spot = ?
         ORDER BY id DESC LIMIT 1`,
        [start_spot, end_spot]
      );
      if (!rows.length) throw new Error('Pair not found in pack_prepare');
      targetId = rows[0].id;

      // For MB-End we will adjust part_prepare using mem_location.id_partPrepare instead;
      // but for non-MB or MB-Start we still update this pack row:
      if (!isMBEndSpot || atStart) {
        await conn.query(
          `UPDATE pack_prepare
             SET status_start = ?, status_end = ?, taskdetail = 'Finish'
           WHERE id = ?`,
          [status_start, status_end, targetId]
        );
      }

      // ★ NEW RULE: If resetting PACKING with Cart position = Start,
      // promote OTHER rows with same selected_start_spot and status_start='-'
      if (atStart) {
        await conn.query(
          `UPDATE pack_prepare
              SET status_start = 'Prepare', status_end = 'Waiting'
            WHERE selected_start_spot = ?
              AND id <> ?
              AND status_start = '-'`,
          [start_spot, targetId]
        );
      }
    } else {
      throw new Error('Invalid domain');
    }

    // ───────── MB-specific side effects ─────────
    if (isMBEndSpot && atStart) {
      // MB at Start: clear mem_location fields and promote queued part_prepare for same end spot
      await conn.query(
        `UPDATE mem_location
            SET from_spot = NULL, id_partPrepare = NULL
          WHERE destination_spot = ?`,
        [end_spot]
      );

      await conn.query(
        `UPDATE part_prepare
            SET status_start = 'In Use', status_end = 'Waiting'
          WHERE selected_end_spot = ?
            AND status_start = 'Queue'`,
        [end_spot]
      );
    }

    if (isMBEndSpot && !atStart) {
      // MB at End: use id_partPrepare from mem_location to find exact part row
      const [memRows] = await conn.query(
        `SELECT id_partPrepare FROM mem_location WHERE destination_spot = ? FOR UPDATE`,
        [end_spot]
      );

      let partIdForMem = memRows.length ? memRows[0].id_partPrepare : null;
      if (!partIdForMem) {
        // fall back if missing (should be rare)
        const [pp] = await conn.query(
          `SELECT id FROM part_prepare
             WHERE start_spot = ? AND selected_end_spot = ?
             ORDER BY id DESC LIMIT 1`,
          [start_spot, end_spot]
        );
        partIdForMem = pp.length ? pp[0].id : null;
      }
      if (!partIdForMem) {
        throw new Error('id_partPrepare not found in mem_location and no fallback part_prepare row');
      }

      const [ppRow] = await conn.query(
        `SELECT start_spot FROM part_prepare WHERE id = ?`,
        [partIdForMem]
      );
      if (!ppRow.length) throw new Error('part_prepare row for id_partPrepare not found');
      const rememberedStart = ppRow[0].start_spot;

      await conn.query(
        `UPDATE part_prepare
           SET status_start = 'Waiting', status_end = 'Prepare', taskdetail = 'Finish'
         WHERE id = ?`,
        [partIdForMem]
      );

      await conn.query(
        `UPDATE mem_location
            SET from_spot = ?, id_partPrepare = ?
          WHERE destination_spot = ?`,
        [rememberedStart, partIdForMem, end_spot]
      );
    }

    await conn.commit();
    res.json({
      ok: true,
      domain,
      start_spot,
      end_spot,
      cartPosition,
      status_start,
      status_end
    });
  } catch (err) {
    try { await conn.rollback(); } catch {}
    console.error('TS reset error:', err);
    res.status(500).json({ error: err.message || 'Internal server error' });
  } finally {
    if (conn) conn.release();
  }
});

module.exports = router;
