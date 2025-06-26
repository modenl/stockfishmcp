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

    try {
      const socket = new WebSocket(url);

      socket.onopen = () => {
        console.log('WebSocket connected');
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
          console.log('📨 WebSocket message:', message.type || 'unknown');
          update(state => ({
            ...state,
            lastMessage: message
          }));
        } catch (error) {
          console.error('Failed to parse WebSocket message:', error, 'Raw data:', event.data);
        }
      };

      socket.onclose = (event) => {
        console.log('WebSocket disconnected:', event.code, event.reason);
        update(state => ({
          ...state,
          isConnected: false,
          connectionStatus: 'disconnected',
          socket: null
        }));

        // Attempt to reconnect
        if (reconnectAttempts < maxReconnectAttempts) {
          reconnectAttempts++;
          console.log(`Attempting to reconnect (${reconnectAttempts}/${maxReconnectAttempts})...`);
          
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
        console.error('❌ WebSocket error:', error);
        // Don't update state to 'error' immediately, let onclose handle reconnection
        console.log('WebSocket error occurred, waiting for onclose to handle reconnection');
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
          console.log('📤 Sent WebSocket message:', message.type, message);
        } catch (error) {
          console.error('❌ Failed to send WebSocket message:', error, 'Message:', message);
        }
      } else {
        console.warn('⚠️ Cannot send message: WebSocket not connected. State:', {
          hasSocket: !!state.socket,
          isConnected: state.isConnected,
          connectionStatus: state.connectionStatus
        });
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