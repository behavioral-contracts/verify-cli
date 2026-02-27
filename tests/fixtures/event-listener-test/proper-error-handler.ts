import WebSocket from 'ws';

function connect(url: string) {
  const ws = new WebSocket(url);

  // Proper: error listener is attached
  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
  });

  ws.on('open', () => {
    console.log('Connected');
  });
}
