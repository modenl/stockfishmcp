import { ChessTrainerServer } from './index.js';

let serverInstance = null;

export async function startChessTrainerDirectly(port = 3456) {
  if (serverInstance) {
    // Check if already running
    try {
      const response = await fetch(`http://localhost:${port}/api/health`);
      if (response.ok) {
        return {
          success: true,
          message: 'Server already running',
          url: `http://localhost:${port}`
        };
      }
    } catch (e) {
      // Server not responding, clean up
      serverInstance = null;
    }
  }

  try {
    // Create and start server
    serverInstance = new ChessTrainerServer();
    
    // Wrap start in a Promise since it uses callback
    await new Promise((resolve, reject) => {
      serverInstance.server.listen(port, (err) => {
        if (err) {
          reject(err);
        } else {
          console.log(`Chess Trainer MCP Server running on port ${port}`);
          resolve();
        }
      });
    });
    
    // Give it a moment to fully initialize
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Verify it's running
    const response = await fetch(`http://localhost:${port}/api/health`);
    
    if (response.ok) {
      return {
        success: true,
        message: 'Server started successfully',
        url: `http://localhost:${port}`
      };
    } else {
      throw new Error('Server started but health check failed');
    }
  } catch (error) {
    serverInstance = null;
    throw error;
  }
}

export function stopChessTrainerDirectly() {
  if (serverInstance) {
    try {
      serverInstance.shutdown();
      serverInstance = null;
      return { success: true, message: 'Server stopped' };
    } catch (error) {
      return { success: false, message: error.message };
    }
  }
  return { success: false, message: 'No server running' };
}