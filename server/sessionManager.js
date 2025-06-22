import { v4 as uuidv4 } from 'uuid';

export class SessionManager {
  constructor() {
    this.sessions = new Map();
  }

  createSession(mode = 'play') {
    const session = {
      id: uuidv4(),
      startTime: new Date().toISOString(),
      mode,
      moves: [],
      fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', // starting position
      result: null,
      metrics: null,
      active: true
    };

    this.sessions.set(session.id, session);
    console.log(`Created session ${session.id} in ${mode} mode`);
    return session;
  }

  getSession(sessionId) {
    return this.sessions.get(sessionId);
  }

  addMove(sessionId, moveData) {
    const session = this.sessions.get(sessionId);
    if (!session || !session.active) {
      return null;
    }

    const moveRecord = {
      ...moveData,
      ply: session.moves.length + 1,
      timestamp: new Date().toISOString()
    };

    session.moves.push(moveRecord);
    session.fen = moveData.fenAfter;

    console.log(`Move added to session ${sessionId}: ${moveData.san} (ply ${moveRecord.ply})`);
    return moveRecord;
  }

  endSession(sessionId, result) {
    const session = this.sessions.get(sessionId);
    if (!session || !session.active) {
      return null;
    }

    session.active = false;
    session.result = result;
    session.endTime = new Date().toISOString();
    session.metrics = this.calculateMetrics(session);

    const summary = this.generateGameSummary(session);
    console.log(`Session ${sessionId} ended: ${result?.winner || 'draw'}`);
    
    return summary;
  }

  calculateMetrics(session) {
    if (session.moves.length === 0) {
      return {
        averageCentipawnLoss: 0,
        blunders: 0,
        mistakes: 0,
        inaccuracies: 0,
        averageThinkTime: 0
      };
    }

    let totalCpLoss = 0;
    let blunders = 0;
    let mistakes = 0;
    let inaccuracies = 0;
    let totalThinkTime = 0;

    for (let i = 0; i < session.moves.length; i++) {
      const move = session.moves[i];
      const prevMove = i > 0 ? session.moves[i - 1] : null;
      
      if (prevMove) {
        const cpLoss = Math.abs(move.evalCp - prevMove.evalCp);
        totalCpLoss += cpLoss;

        // Classify move quality based on centipawn loss
        if (cpLoss >= 300) {
          blunders++;
        } else if (cpLoss >= 100) {
          mistakes++;
        } else if (cpLoss >= 50) {
          inaccuracies++;
        }
      }

      totalThinkTime += move.timeMs || 0;
    }

    return {
      averageCentipawnLoss: Math.round(totalCpLoss / session.moves.length),
      blunders,
      mistakes,
      inaccuracies,
      averageThinkTime: Math.round(totalThinkTime / session.moves.length)
    };
  }

  generateGameSummary(session) {
    const pgn = this.generatePGN(session);
    
    return {
      sessionId: session.id,
      result: session.result,
      pgn,
      ...session.metrics,
      duration: this.calculateDuration(session.startTime, session.endTime),
      moveCount: session.moves.length
    };
  }

  generatePGN(session) {
    const headers = [
      '[Event "Chess Trainer Session"]',
      `[Date "${new Date(session.startTime).toISOString().split('T')[0]}"]`,
      '[White "Player"]',
      '[Black "Engine"]',
      `[Result "${this.formatResult(session.result)}"]`
    ].join('\n');

    const moves = [];
    for (let i = 0; i < session.moves.length; i += 2) {
      const moveNumber = Math.floor(i / 2) + 1;
      const whiteMove = session.moves[i]?.san || '';
      const blackMove = session.moves[i + 1]?.san || '';
      
      if (whiteMove) {
        moves.push(`${moveNumber}.${whiteMove}${blackMove ? ' ' + blackMove : ''}`);
      }
    }

    const result = this.formatResult(session.result);
    return `${headers}\n\n${moves.join(' ')} ${result}`;
  }

  formatResult(result) {
    if (!result) return '*';
    
    switch (result.winner) {
      case 'white': return '1-0';
      case 'black': return '0-1';
      case 'draw': return '1/2-1/2';
      default: return '*';
    }
  }

  calculateDuration(startTime, endTime) {
    const start = new Date(startTime);
    const end = new Date(endTime);
    return Math.round((end - start) / 1000); // seconds
  }

  // Cleanup old sessions (could be called periodically)
  cleanupOldSessions(maxAgeHours = 24) {
    const cutoff = Date.now() - (maxAgeHours * 60 * 60 * 1000);
    
    for (const [sessionId, session] of this.sessions.entries()) {
      const sessionTime = new Date(session.startTime).getTime();
      if (sessionTime < cutoff) {
        this.sessions.delete(sessionId);
        console.log(`Cleaned up old session: ${sessionId}`);
      }
    }
  }

  // Get session statistics
  getStats() {
    const activeSessions = Array.from(this.sessions.values()).filter(s => s.active);
    const completedSessions = Array.from(this.sessions.values()).filter(s => !s.active);
    
    return {
      total: this.sessions.size,
      active: activeSessions.length,
      completed: completedSessions.length,
      modes: this.getModeStats()
    };
  }

  getModeStats() {
    const modes = {};
    for (const session of this.sessions.values()) {
      modes[session.mode] = (modes[session.mode] || 0) + 1;
    }
    return modes;
  }
} 