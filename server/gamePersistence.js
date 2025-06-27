/**
 * Game Persistence Utilities
 * Handles auto-save and cleanup of game states
 */

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
   * Save all active games to persistent storage
   */
  saveAllGames() {
    const { gameStateManager } = require('./gameStateManager.js');
    let savedCount = 0;
    
    for (const [gameId, gameState] of this.server.gameStates) {
      if (gameState.active) {
        gameStateManager.saveGameState(gameId, gameState);
        savedCount++;
      }
    }
    
    if (savedCount > 0) {
      console.log(`Auto-saved ${savedCount} active games`);
    }
  }

  /**
   * Mark games as inactive if no moves in last 24 hours
   */
  cleanupInactiveGames() {
    const { gameStateManager } = require('./gameStateManager.js');
    const inactivityThreshold = 24 * 60 * 60 * 1000; // 24 hours
    const now = Date.now();
    let cleanedCount = 0;

    for (const [gameId, gameState] of this.server.gameStates) {
      if (!gameState.active) continue;

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
        gameStateManager.saveGameState(gameId, gameState);
        
        // Remove from active memory
        this.server.gameStates.delete(gameId);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      console.log(`Cleaned up ${cleanedCount} inactive games`);
    }
  }

  /**
   * Get game statistics
   */
  getStats() {
    const activeGames = Array.from(this.server.gameStates.values())
      .filter(game => game.active).length;
    
    const totalMoves = Array.from(this.server.gameStates.values())
      .reduce((sum, game) => sum + game.moves.length, 0);

    return {
      activeGames,
      totalMoves,
      memoryGames: this.server.gameStates.size
    };
  }
}