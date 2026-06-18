import app from './server/app.js';
import { config } from './server/config.js';

app.listen(config.port, () => {
  console.log(`[rafacar] listening on http://0.0.0.0:${config.port}`);
});
