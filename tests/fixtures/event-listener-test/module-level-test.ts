import WebSocket from 'ws';

// Module-level instance (should test module-level detection)
const globalWs = new WebSocket('ws://localhost:8080');
globalWs.on('open', () => {
  console.log('Global connection opened');
});
// Missing: globalWs.on('error', handler)

// Function-level instance (should test existing function-level detection)
function connect(url: string) {
  const ws = new WebSocket(url);
  ws.on('open', () => {
    console.log('Connected');
  });
  // Missing: ws.on('error', handler)
}
