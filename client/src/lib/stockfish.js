// Stockfish NNUE service using UCI protocol
// This version properly loads the Stockfish module and uses UCI commands

import { writable } from 'svelte/store';

// ELO to Stockfish level mapping (1-15) - reduced max level for faster play
// This is an approximation. Real ELO depends on hardware, time control, etc.
const ELO_LEVELS = {
  800: 1,
  1000: 2,
  1200: 4,
  1400: 6,
  1500: 7, // Target ELO
  1600: 8,
  1800: 10,
  2000: 12,
  2200: 13,
  2400: 14,
  2600: 15, // Max level reduced from 20 to 15
};

function eloToLevel(elo) {
  const ratings = Object.keys(ELO_LEVELS).map(Number);
  const closestElo = ratings.reduce((prev, curr) => 
    (Math.abs(curr - elo) < Math.abs(prev - elo) ? curr : prev)
  );
  return ELO_LEVELS[closestElo];
}

// Create reactive stores
export const engineReady = writable(false);
export const engineStatus = writable('loading');

class Stockfish {
  constructor() {
    this.engine = null;
    this.isReady = false;
    this.currentRequest = null;
    this.lastEvaluation = { cp: 0, mate: null };
    this._init();
  }

  async _init() {
    try {
      console.log('🔄 Loading Stockfish NNUE module...');
      engineStatus.set('loading');
      
      // Load the Stockfish module using script tag approach for Vite
      if (!window.Stockfish) {
        await this._loadStockfishScript();
      }
      
      console.log('🔄 Initializing Stockfish engine...');
      console.log('Stockfish constructor available:', typeof window.Stockfish);
      engineStatus.set('initializing');
      
      // Create engine with simplified options
      this.engine = await window.Stockfish();
      
      console.log('✅ Stockfish engine instance created');
      
      // Set up message handling
      this.engine.addMessageListener((message) => {
        this._handleMessage(message);
      });
      
      // Initialize UCI protocol
      console.log('🔄 Starting UCI protocol...');
      engineStatus.set('starting');
      this.engine.postMessage('uci');
      
      // Wait for UCI initialization with timeout
      await this._waitForUCI();
      
    } catch (error) {
      console.error('❌ Failed to initialize Stockfish:', error);
      console.error('Error details:', error.message, error.stack);
      this.isReady = false;
      engineReady.set(false);
      engineStatus.set('error');
    }
  }

  async _waitForUCI() {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('UCI initialization timeout'));
      }, 10000); // 10 second timeout
      
      const originalHandleMessage = this._handleMessage.bind(this);
      this._handleMessage = (message) => {
        originalHandleMessage(message);
        if (message === 'readyok') {
          clearTimeout(timeout);
          resolve();
        }
      };
    });
  }

  async _loadStockfishScript() {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = '/nnue/stockfish.js';
      script.onload = () => {
        console.log('✅ Stockfish script loaded');
        resolve();
      };
      script.onerror = (error) => {
        console.error('❌ Failed to load Stockfish script:', error);
        reject(error);
      };
      document.head.appendChild(script);
    });
  }

  _handleMessage(message) {
    if (message === 'uciok') {
      console.log('✅ UCI protocol initialized');
      engineStatus.set('initializing');
      this.engine.postMessage('isready');
      return;
    }
    
    if (message === 'readyok') {
      this.isReady = true;
      engineReady.set(true);
      engineStatus.set('ready');
      console.log('✅ Engine is ready for UCI commands');
      return;
    }

    if (message.startsWith('bestmove')) {
      console.log('🎯 Received bestmove:', message);
      
      const match = message.match(/^bestmove\s+(\S+)/);
      if (match) {
        const move = match[1];
        console.log('🎯 Parsed move:', move);
        
        if (this.currentRequest) {
          console.log('🎯 Resolving promise with move:', move);
          // Include the last evaluation in the result
          this.currentRequest.resolve({ 
            move,
            evaluation: this.lastEvaluation 
          });
          this.currentRequest = null;
        } else {
          console.warn('⚠️ Received bestmove but no pending request');
        }
      } else {
        console.error('❌ Failed to parse bestmove message:', message);
        if (this.currentRequest) {
          this.currentRequest.reject(new Error('Failed to parse bestmove'));
          this.currentRequest = null;
        }
      }
      return;
    }

    // Parse info messages for evaluation
    if (message.startsWith('info')) {
      this._parseInfoMessage(message);
      return;
    }
    
    // Log other important UCI messages
    if (!message.startsWith('info')) {
      console.log('📝 UCI:', message);
    }
  }

  _parseInfoMessage(message) {
    // Parse evaluation from info messages
    // Example: info depth 10 seldepth 12 multipv 1 score cp 25 nodes 12345 ...
    
    let evaluation = {};
    
    // Parse centipawn score
    const cpMatch = message.match(/score cp (-?\d+)/);
    if (cpMatch) {
      evaluation.cp = parseInt(cpMatch[1]);
    }
    
    // Parse mate score
    const mateMatch = message.match(/score mate (-?\d+)/);
    if (mateMatch) {
      evaluation.mate = parseInt(mateMatch[1]);
    }
    
    // Parse depth
    const depthMatch = message.match(/depth (\d+)/);
    if (depthMatch) {
      evaluation.depth = parseInt(depthMatch[1]);
    }
    
    // Parse principal variation (best line)
    const pvMatch = message.match(/pv (.+?)(?:\s|$)/);
    if (pvMatch) {
      evaluation.pv = pvMatch[1].split(' ');
    }
    
    // Only update if we have meaningful evaluation data
    if (evaluation.cp !== undefined || evaluation.mate !== undefined) {
      this.lastEvaluation = evaluation;
    }
  }

  async _waitForReady() {
    if (this.isReady) return;
    
    return new Promise((resolve) => {
      const checkReady = () => {
        if (this.isReady) {
          resolve();
        } else {
          setTimeout(checkReady, 100);
        }
      };
      checkReady();
    });
  }

  async getBestMove(fen, elo = 1500, timeLimit = null) {
    if (!fen || typeof fen !== 'string' || fen.trim() === '') {
      throw new Error('Invalid FEN position provided');
    }
    
    // Check if there's already a pending request
    if (this.currentRequest) {
      console.warn('⚠️ Cancelling previous request');
      this.currentRequest.reject(new Error('Request cancelled by new request'));
      this.currentRequest = null;
    }
    
    await this._waitForReady();
    
    const level = eloToLevel(elo);
    console.log(`🎯 Getting best move for ELO ${elo} (level ${level})`);
    
    // Set skill level using UCI
    this.engine.postMessage(`setoption name Skill Level value ${level}`);
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Set position using UCI
    this.engine.postMessage(`position fen ${fen}`);
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Use provided time limit or default fast time
    const timeMs = timeLimit || 1000; // Increase default time to 1 second
    
    return new Promise((resolve, reject) => {
      this.currentRequest = { resolve, reject };
      
      // Set timeout with generous extra time
      const timeout = setTimeout(() => {
        if (this.currentRequest) {
          console.error('❌ Move search timed out after', timeMs + 3000, 'ms');
          this.currentRequest.reject(new Error('Move search timed out'));
          this.currentRequest = null;
        }
      }, timeMs + 3000); // 3 seconds extra
      
      // Override resolve/reject to clear timeout
      const originalResolve = this.currentRequest.resolve;
      const originalReject = this.currentRequest.reject;
      
      this.currentRequest.resolve = (result) => {
        clearTimeout(timeout);
        originalResolve(result);
      };
      
      this.currentRequest.reject = (error) => {
        clearTimeout(timeout);
        originalReject(error);
      };
      
      // Send the UCI go command
      console.log(`➡️ Sending: go movetime ${timeMs}`);
      this.engine.postMessage(`go movetime ${timeMs}`);
    });
  }

  // Simple test method
  async testEngine() {
    try {
      console.log('🧪 Testing engine with starting position...');
      const result = await this.getBestMove('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', 1500, 2000);
      console.log('🧪 Engine test successful:', result);
      return result;
    } catch (error) {
      console.error('🧪 Engine test failed:', error);
      throw error;
    }
  }

  destroy() {
    if (this.engine) {
      console.log('🔄 Terminating Stockfish engine...');
      this.engine.postMessage('quit');
      this.engine.terminate();
      this.engine = null;
      this.isReady = false;
      console.log('✅ Stockfish engine terminated');
    }
  }
}

export const stockfish = new Stockfish();
export default stockfish; 