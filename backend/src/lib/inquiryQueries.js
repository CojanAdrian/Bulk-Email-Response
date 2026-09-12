const { composeReply } = require('./replyComposer');

// Columns joined in from the matched load, aliased so they can sit
// alongside the email_inquiries row without colliding. Deliberately
// includes everything composeReply needs (not just the stops/comment/rate
// fields the multi-stop badge and rate toggle use) so a live reply can be
// recomposed from the load's CURRENT data -- see attachLiveReplyBody.
const INQUIRY_JOIN_FIELDS = `
    l.origin_city AS matched_load_origin_city, l.origin_state AS matched_load_origin_state,
    l.dest_city AS matched_load_dest_city, l.dest_state AS matched_load_dest_state,
    l.early_pu AS matched_load_early_pu, l.late_pu AS matched_load_late_pu,
    l.early_del AS matched_load_early_del, l.late_del AS matched_load_late_del,
    l.weight AS matched_load_weight, l.stops AS matched_load_stops, l.comment AS matched_load_comment,
    l.target_pay AS matched_load_target_pay, l.include_rate AS matched_load_include_rate,
    l.extra_stops AS matched_load_extra_stops, l.custom_reply_body AS matched_load_custom_reply_body`;

// email_inquiries.reply_body is a one-time snapshot composed the moment the
// carrier's email first arrived. If the load gets edited afterward (PU/DEL
// times filled in, extra stops added) that snapshot goes stale -- the review
// queue would keep showing the old/empty text. live_reply_body recomposes
// the reply from the matched load's CURRENT joined data every time an
// inquiry is read, so the queue always reflects the load as it stands now.
// A custom_reply_body on the load still always wins, same as at poll time.
function attachLiveReplyBody(row) {
  if (!row.matched_load_id) return { ...row, live_reply_body: null };
  const loadLike = {
    origin_city: row.matched_load_origin_city,
    origin_state: row.matched_load_origin_state,
    dest_city: row.matched_load_dest_city,
    dest_state: row.matched_load_dest_state,
    early_pu: row.matched_load_early_pu,
    late_pu: row.matched_load_late_pu,
    early_del: row.matched_load_early_del,
    late_del: row.matched_load_late_del,
    weight: row.matched_load_weight,
    target_pay: row.matched_load_target_pay,
    include_rate: row.matched_load_include_rate,
    extra_stops: row.matched_load_extra_stops,
  };
  const liveReplyBody = row.matched_load_custom_reply_body || composeReply(loadLike);
  return { ...row, live_reply_body: liveReplyBody };
}

async function fetchInquiryWithLoad(pool, id) {
  const [rows] = await pool.query(
    `SELECT ei.*, ${INQUIRY_JOIN_FIELDS}
     FROM email_inquiries ei
     LEFT JOIN loads l ON l.id = ei.matched_load_id
     WHERE ei.id = ?`,
    [id]
  );
  return rows[0] ? attachLiveReplyBody(rows[0]) : null;
}

module.exports = { INQUIRY_JOIN_FIELDS, attachLiveReplyBody, fetchInquiryWithLoad };
