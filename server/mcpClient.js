export class MCPClient {
  constructor() {
    this.mcpHostUrl = process.env.MCP_HOST_URL || 'http://localhost:3000/mcp/inbound';
    this.serverName = 'chessCoach';
    this.enabled = process.env.MCP_ENABLED !== 'false';
  }

  async sendEvaluateMove(params) {
    if (!this.enabled) {
      console.log('MCP disabled, skipping evaluateMove');
      return;
    }

    const action = {
      type: 'action',
      server: this.serverName,
      action: 'evaluateMove',
      parameters: {
        sessionId: params.sessionId,
        ply: params.ply,
        move: params.move,
        fenBefore: params.fenBefore,
        fenAfter: params.fenAfter,
        evalCp: params.evalCp,
        depth: params.depth,
        timeMs: params.timeMs,
        timestamp: new Date().toISOString()
      }
    };

    return this.sendMCPAction(action);
  }

  async sendGameSummary(summary) {
    if (!this.enabled) {
      console.log('MCP disabled, skipping gameSummary');
      return;
    }

    const action = {
      type: 'action',
      server: this.serverName,
      action: 'gameSummary',
      parameters: {
        sessionId: summary.sessionId,
        result: summary.result,
        pgn: summary.pgn,
        averageCentipawnLoss: summary.averageCentipawnLoss,
        blunders: summary.blunders,
        mistakes: summary.mistakes,
        inaccuracies: summary.inaccuracies,
        duration: summary.duration,
        moveCount: summary.moveCount,
        timestamp: new Date().toISOString()
      }
    };

    return this.sendMCPAction(action);
  }

  async sendTrainingMetrics(sessionId, metrics) {
    if (!this.enabled) {
      console.log('MCP disabled, skipping trainingMetrics');
      return;
    }

    const action = {
      type: 'action',
      server: this.serverName,
      action: 'trainingMetrics',
      parameters: {
        sessionId,
        ...metrics,
        timestamp: new Date().toISOString()
      }
    };

    return this.sendMCPAction(action);
  }

  async sendPuzzleResult(sessionId, puzzleId, result) {
    if (!this.enabled) {
      console.log('MCP disabled, skipping puzzleResult');
      return;
    }

    const action = {
      type: 'action',
      server: this.serverName,
      action: 'puzzleResult',
      parameters: {
        sessionId,
        puzzleId,
        solved: result.solved,
        attempts: result.attempts,
        timeSpent: result.timeSpent,
        rating: result.rating,
        themes: result.themes,
        timestamp: new Date().toISOString()
      }
    };

    return this.sendMCPAction(action);
  }

  async sendPositionAnalysis(sessionId, analysis) {
    if (!this.enabled) {
      console.log('MCP disabled, skipping positionAnalysis');
      return;
    }

    const action = {
      type: 'action',
      server: this.serverName,
      action: 'positionAnalysis',
      parameters: {
        sessionId,
        fen: analysis.fen,
        evaluation: analysis.evaluation,
        bestMove: analysis.bestMove,
        principalVariation: analysis.pv,
        depth: analysis.depth,
        threats: analysis.threats,
        timestamp: new Date().toISOString()
      }
    };

    return this.sendMCPAction(action);
  }

  async sendMCPAction(action) {
    try {
      console.log(`Sending MCP action: ${action.action}`, action.parameters);
      
      const response = await fetch(this.mcpHostUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Chess-Trainer-MCP/1.0'
        },
        body: JSON.stringify(action),
        timeout: 5000 // 5 second timeout
      });

      if (!response.ok) {
        throw new Error(`MCP request failed: ${response.status} ${response.statusText}`);
      }

      const result = await response.json();
      console.log(`MCP action ${action.action} sent successfully:`, result);
      return result;

    } catch (error) {
      console.error(`Failed to send MCP action ${action.action}:`, error.message);
      
      // Don't throw - we don't want MCP failures to break the chess app
      // Instead, maybe implement a retry queue or fallback logging
      this.handleMCPError(action, error);
      return null;
    }
  }

  handleMCPError(action, error) {
    // Could implement:
    // - Retry queue with exponential backoff
    // - Local file logging as fallback
    // - Circuit breaker pattern
    // - Dead letter queue for failed actions
    
    console.warn(`MCP action ${action.action} failed, continuing without MCP integration`);
    
    // For now, just log the failure
    // In production, you might want to store failed actions for retry
  }

  // Health check for MCP host
  async checkMCPHealth() {
    if (!this.enabled) {
      return { status: 'disabled' };
    }

    try {
      const healthUrl = this.mcpHostUrl.replace('/inbound', '/health');
      const response = await fetch(healthUrl, {
        method: 'GET',
        timeout: 3000
      });

      return {
        status: response.ok ? 'healthy' : 'unhealthy',
        statusCode: response.status
      };
    } catch (error) {
      return {
        status: 'unreachable',
        error: error.message
      };
    }
  }

  // Configuration methods
  setMCPHostUrl(url) {
    this.mcpHostUrl = url;
    console.log(`MCP host URL updated: ${url}`);
  }

  enable() {
    this.enabled = true;
    console.log('MCP client enabled');
  }

  disable() {
    this.enabled = false;
    console.log('MCP client disabled');
  }

  getStatus() {
    return {
      enabled: this.enabled,
      hostUrl: this.mcpHostUrl,
      serverName: this.serverName
    };
  }
} 