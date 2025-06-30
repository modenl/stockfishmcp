import { writable } from 'svelte/store';

function createWebSocketStore() {
  const { subscribe, set, update } = writable({
    isConnected: false,
    connectionStatus: 'disconnected',
    lastMessage: null,
    socket: null
  });

  let reconnectAttempts = 0;
  const maxReconnectAttempts = 5;
  const reconnectDelay = 3000;

  function connect(url) {
    if (typeof window === 'undefined') return;

    // WebSocket: Attempting to connect
    
    try {
      const socket = new WebSocket(url);
      
      // WebSocket: Socket created, waiting for connection

      socket.onopen = () => {
        // WebSocket connected successfully
        reconnectAttempts = 0;
        update(state => ({
          ...state,
          isConnected: true,
          connectionStatus: 'connected',
          socket
        }));
      };

      socket.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          // WebSocket message received
          update(state => ({
            ...state,
            lastMessage: message
          }));
        } catch (error) {
          console.error('Failed to parse WebSocket message:', error, 'Raw data:', event.data);
        }
      };

      socket.onclose = (event) => {
        // WebSocket disconnected
        update(state => ({
          ...state,
          isConnected: false,
          connectionStatus: 'disconnected',
          socket: null
        }));

        // Attempt to reconnect
        if (reconnectAttempts < maxReconnectAttempts) {
          reconnectAttempts++;
          // Attempting to reconnect
          
          update(state => ({
            ...state,
            connectionStatus: 'reconnecting'
          }));

          setTimeout(() => {
            connect(url);
          }, reconnectDelay * reconnectAttempts);
        } else {
          update(state => ({
            ...state,
            connectionStatus: 'failed'
          }));
          console.error('Max reconnection attempts reached');
        }
      };

      socket.onerror = (error) => {
        // WebSocket error occurred
      };

    } catch (error) {
      console.error('Failed to create WebSocket connection:', error);
      update(state => ({
        ...state,
        connectionStatus: 'error'
      }));
    }
  }

  function disconnect() {
    update(state => {
      if (state.socket) {
        state.socket.close();
      }
      return {
        ...state,
        isConnected: false,
        connectionStatus: 'disconnected',
        socket: null
      };
    });
  }

  function sendMessage(message) {
    update(state => {
      if (state.socket && state.isConnected) {
        try {
          const messageStr = JSON.stringify(message);
          state.socket.send(messageStr);
          // Sent WebSocket message
        } catch (error) {
          console.error('❌ Failed to send WebSocket message:', error, 'Message:', message);
        }
      } else {
        // Cannot send message: WebSocket not connected
      }
      return state;
    });
  }

  function isConnected() {
    let connected = false;
    subscribe(state => {
      connected = state.isConnected;
    })();
    return connected;
  }

  return {
    subscribe,
    connect,
    disconnect,
    sendMessage,
    isConnected
  };
}

export const webSocketStore = createWebSocketStore(); 