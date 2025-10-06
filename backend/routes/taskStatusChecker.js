const axios = require('axios');
const pool = require('../config/db');

const ROBOT_API_URL = 'http://172.16.16.209:7000/ics/out/task/getTaskOrderStatus';

const checkAndUpdateStatus = async () => {
  try {
    const [partTasks] = await pool.query(
      "SELECT id, start_spot, taskid, selected_end_spot, taskdetail FROM part_prepare WHERE taskdetail IN ('created_end_spot', 'created_start_spot')"
    );

    const [packTasks] = await pool.query(
      "SELECT id, NULL AS start_spot, selected_start_spot, taskid, taskdetail FROM pack_prepare WHERE taskdetail IN ('created_end_spot', 'created_start_spot')"
    );

    // รวมงาน
    const tasks = [...partTasks, ...packTasks];

    for (const task of tasks) {
      const { data } = await axios.post(ROBOT_API_URL, { orderId: task.taskid });

      if (data?.code === 1000 && Array.isArray(data?.data?.taskOrderDetail) && data.data.taskOrderDetail.length > 0) {
        const subTaskStatus = data.data.taskOrderDetail[0]?.subTaskStatus;

        let status_start, status_end, taskdetailUpdate;
        const isPack = task.start_spot === null; // pack_prepare จะเป็น null ตาม SELECT
        const table = isPack ? 'pack_prepare' : 'part_prepare';

        if (task.taskdetail === 'created_start_spot') {
          if (subTaskStatus === 1) {
            // Show "Ready" status at end_spot when robot reaches destination
            status_start = 'Waiting'; 
            status_end = 'Ready';
          } else if (subTaskStatus === 2) {
            status_start = 'Waiting'; 
            status_end = 'Waiting';
          } else if (subTaskStatus === 3 || subTaskStatus === 5) {
            status_start = 'Waiting'; 
            status_end = 'Prepare'; 
            taskdetailUpdate = 'Finish';
          }
        } else if (task.taskdetail === 'created_end_spot') {
          if (subTaskStatus === 1) {
            status_start = 'Waiting'; 
            status_end = 'Waiting';
          } else if (subTaskStatus === 2) {
            status_start = 'Waiting'; 
            status_end = 'Waiting';
          } else if (subTaskStatus === 3 || subTaskStatus === 5) {
            // Clear Queue status and mem_location data AFTER task completion
            status_start = task.start_spot && task.start_spot.includes('MB') ? 'In Use' : 'Prepare';
            status_end = 'Waiting'; 
            taskdetailUpdate = 'Finish';
            
            // FIXED: Comprehensive MB handling after task completion
            if (table === 'part_prepare' && 
                (task.selected_end_spot === 'MB-FG-01' || task.selected_end_spot === 'MB-FG-02')) {
              
              console.log(`Clearing mem_location for ${task.selected_end_spot} after task completion`);
              
              // Clear mem_location data after task completion
              await pool.query(
                'UPDATE mem_location SET from_spot = ?, id_partPrepare = ? WHERE destination_spot = ?',
                [null, null, task.selected_end_spot]
              );
              
              // FIXED: Restore ALL MB queue rows back to 'In Use' regardless of their selected_end_spot
              // This handles the case where rows were queued for different MB spots but should all be available now
              console.log('Restoring ALL queued MB rows to In Use status');
              
              await pool.query(
                `UPDATE part_prepare 
                 SET status_start = 'In Use' 
                 WHERE start_spot LIKE 'MB-%'
                   AND status_start = 'Queue'`,
                []
              );
              
              console.log(`All queued MB rows restored to In Use after ${task.selected_end_spot} became available`);
            }
          }
        }

        // ถ้ายังไม่ได้เซ็ต (กันกรณี subTaskStatus อื่นๆ) ก็ข้าม
        if (typeof status_start === 'undefined' || typeof status_end === 'undefined') continue;

        await pool.query(
          `UPDATE ${table} SET status_start = ?, status_end = ?, taskdetail = COALESCE(?, taskdetail) WHERE id = ?`,
          [status_start, status_end, taskdetailUpdate, task.id]
        );

        // อัปเดตแถวคู่ที่ผูกกับ selected_start_spot สำหรับ pack_prepare
        if (
          table === 'pack_prepare' &&
          (subTaskStatus === 3 || subTaskStatus === 5) &&
          task.taskdetail === 'created_end_spot' &&
          task.selected_start_spot // กัน null/undefined
        ) {
          await pool.query(
            'UPDATE pack_prepare SET status_end = ?, status_start = ? WHERE selected_start_spot = ?',
            ['Waiting', 'Prepare', task.selected_start_spot]
          );
        }
      }
    }
  } catch (error) {
    console.error('Error during task status check:', error);
  }
};

setInterval(checkAndUpdateStatus, 5000);
console.log('Task status checker running every 5 seconds.');