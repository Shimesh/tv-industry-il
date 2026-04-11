import { realtimeConfig } from './config.js';
import { createRealtimeServer } from './server.js';

const { httpServer } = createRealtimeServer();

httpServer.listen(realtimeConfig.port, () => {
  console.log(
    JSON.stringify(
      {
        service: 'chat-v2-realtime',
        port: realtimeConfig.port,
        corsOrigin: realtimeConfig.corsOrigin,
        mode: realtimeConfig.persistenceMode,
      },
      null,
      2
    )
  );
});

