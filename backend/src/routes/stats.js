const express = require('express');
const asyncHandler = require('../lib/asyncHandler');

const SERIES_DAYS = 7;

function median(values) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function average(values) {
  if (values.length === 0) return null;
  return Math.round(values.reduce((sum, v) => sum + v, 0) / values.length);
}

function createStatsRouter(pool) {
  const router = express.Router();

  // The numbers for the board's Today panel: loads booked today, average
  // gross profit per load for each of the last seven days, and how quickly
  // inquiries were answered today. "Today" is the server's calendar day.
  router.get('/today', asyncHandler(async (req, res) => {
    const userId = req.session.userId;

    // Each booked load's gross profit is on its latest carrier run.
    const [booked] = await pool.query(
      `SELECT DATE_FORMAT(l.booked_at, '%Y-%m-%d') AS day, h.gp
       FROM loads l
       LEFT JOIN (
         SELECT load_id, gp, ROW_NUMBER() OVER (PARTITION BY load_id ORDER BY created_at DESC) AS rn
         FROM carrier_lane_history WHERE load_id IS NOT NULL
       ) h ON h.load_id = l.id AND h.rn = 1
       WHERE l.user_id = ? AND l.status = 'booked' AND l.booked_at >= CURDATE() - INTERVAL ? DAY`,
      [userId, SERIES_DAYS - 1]
    );
    const [[{ today }]] = await pool.query("SELECT DATE_FORMAT(CURDATE(), '%Y-%m-%d') AS today");

    const byDay = new Map();
    for (const row of booked) {
      const entry = byDay.get(row.day) || { count: 0, gps: [] };
      entry.count += 1;
      if (row.gp !== null && row.gp !== undefined) entry.gps.push(Number(row.gp));
      byDay.set(row.day, entry);
    }
    const series = [];
    const start = new Date(`${today}T00:00:00Z`);
    for (let offset = SERIES_DAYS - 1; offset >= 0; offset -= 1) {
      const day = new Date(start.getTime() - offset * 86400000).toISOString().slice(0, 10);
      const entry = byDay.get(day) || { count: 0, gps: [] };
      series.push({ day, booked: entry.count, avgGp: average(entry.gps) });
    }

    const [replies] = await pool.query(
      `SELECT TIMESTAMPDIFF(SECOND, received_at, reply_sent_at) AS seconds
       FROM email_inquiries
       WHERE user_id = ? AND reply_status IN ('sent', 'auto_sent') AND reply_sent_at >= CURDATE() AND received_at IS NOT NULL`,
      [userId]
    );
    const minutes = replies.map((row) => Math.max(0, Number(row.seconds)) / 60);
    // Reply time per hour of the day, for the small bar chart.
    const [hourly] = await pool.query(
      `SELECT HOUR(reply_sent_at) AS hour, COUNT(*) AS replies
       FROM email_inquiries
       WHERE user_id = ? AND reply_status IN ('sent', 'auto_sent') AND reply_sent_at >= CURDATE()
       GROUP BY HOUR(reply_sent_at)`,
      [userId]
    );

    const todayEntry = byDay.get(today) || { count: 0, gps: [] };
    res.json({
      today,
      bookedToday: todayEntry.count,
      avgGpToday: average(todayEntry.gps),
      // Total gross profit of today's booked loads (null: none logged yet).
      gpToday: todayEntry.gps.length ? todayEntry.gps.reduce((sum, gp) => sum + gp, 0) : null,
      gpLoggedToday: todayEntry.gps.length,
      series,
      // Every booked load with a logged GP in the 7 days counts once, so a
      // busy day weighs more than a quiet one.
      weekAvgGp: average(booked.filter((row) => row.gp !== null && row.gp !== undefined).map((row) => Number(row.gp))),
      repliedToday: replies.length,
      medianReplyMinutes: minutes.length ? Math.round(median(minutes)) : null,
      repliesByHour: hourly.map((row) => ({ hour: Number(row.hour), replies: Number(row.replies) })),
    });
  }));

  return router;
}

module.exports = createStatsRouter;
