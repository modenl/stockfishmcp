/**
 * Game Persistence Utilities
 * Handles auto-save and cleanup of game states
 */

import { gameStateManager } from './gameStateManager.js';

export class GamePersistence {
  constructor(server) {
    this.server = server;
    this.autoSaveInterval = null;
    this.cleanupInterval = null;
  }

  /**
   * Start auto-save and cleanup timers
   */
  start() {
    // Auto-save every 30 seconds
    this.autoSaveInterval = setInterval(() => {
      this.saveAllGames();
    }, 30000);

    // Cleanup old inactive games every hour
    this.cleanupInterval = setInterval(() => {
      this.cleanupInactiveGames();
    }, 3600000);

    console.log('Game persistence started: auto-save every 30s, cleanup every hour');
  }

  /**
   * Stop all timers
   */
  stop() {
    if (this.autoSaveInterval) {
      clearInterval(this.autoSaveInterval);
      this.autoSaveInterval = null;
    }
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    
    // Save all games before stopping
    this.saveAllGames();
    console.log('Game persistence stopped');
  }

  /**
   * Save the global game to persistent storage
   */
  saveAllGames() {
    try {
      const gameState = gameStateManager.getGameState();
      if (gameState && gameState.active) {
        gameStateManager.saveGame(gameState);
        console.log('Auto-saved game state');
      }
    } catch (error) {
      console.error('Error saving game state:', error);
    }
  }

  /**
   * Check if the game should be marked as inactive
   */
  cleanupInactiveGames() {
    try {
      const inactivityThreshold = 24 * 60 * 60 * 1000; // 24 hours
      const now = Date.now();
      
      const gameState = gameStateManager.getGameState();
      if (!gameState || !gameState.active) return;

      // Check last move time
      const lastMove = gameState.moves[gameState.moves.length - 1];
      const lastActivity = lastMove ? 
        new Date(lastMove.timestamp).getTime() : 
        new Date(gameState.startTime).getTime();

      if (now - lastActivity > inactivityThreshold) {
        // Mark as inactive
        gameState.active = false;
        gameState.endTime = new Date().toISOString();
        gameState.endReason = 'inactivity';
        
        // Save the updated state
        gameStateManager.saveGame(gameState);
        
        console.log('Marked game as inactive due to inactivity');
      }
    } catch (error) {
      console.error('Error during cleanup:', error);
    }
  }

  /**
   * Get game statistics
   */
  getStats() {
    const gameState = gameStateManager.getGameState();
    const activeGames = (gameState && gameState.active) ? 1 : 0;
    
    const totalMoves = gameState ? gameState.moves.length : 0;

    return {
      activeGames,
      totalMoves,
      memoryGames: activeGames
    };
  }
}