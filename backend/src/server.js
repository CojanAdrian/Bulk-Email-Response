require('dotenv').config();
const { createApp } = require('./app');
const { createPool } = require('./db');

const pool = createPool(process.env.DB_NAME);
const app = createApp(pool);
const port = process.env.PORT || 4000;

app.listen(port, () => {
  console.log(`Backend listening on port ${port}`);
});
