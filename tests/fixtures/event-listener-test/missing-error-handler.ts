import WebSocket from 'ws';

function connect(url: string) {
  const ws = new WebSocket(url);
  ws.on('open', () => {
    console.log('Connected');
  });
  // Missing: ws.on('error', handler)
}
