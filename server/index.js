import express from 'express';
import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import { fileURLToPath } from 'url';
import { SessionManager } from './sessionManager.js';
import { MCPClient } from './mcpClient.js';
import { validateMessage } from './validation.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class ChessTrainerServer {
  constructor() {
    this.app = express();
    this.server = createServer(this.app);
    this.wss = new WebSocketServer({ server: this.server });
    this.sessionManager = new SessionManager();
    this.mcpClient = new MCPClient();
    this.clients = new Map(); // sessionId -> ws connection
    
    // Increase max listeners to prevent warning
    this.server.setMaxListeners(20);
    
    this.setupMiddleware();
    this.setupRoutes();
    this.setupWebSocket();
  }

  setupMiddleware() {
    this.app.use(helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'", "'wasm-unsafe-eval'"],
          workerSrc: ["'self'", "blob:"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", "data:", "blob:"],
          connectSrc: ["'self'", "ws:", "wss:"]
        }
      }
    }));
    
    this.app.use(cors());
    this.app.use(express.json());
    this.app.use(express.static(path.join(__dirname, '../client/dist')));
  }

  setupRoutes() {
    // API Routes
    this.app.get('/api/health', (req, res) => {
      res.json({ status: 'ok', timestamp: new Date().toISOString() });
    });

    this.app.get('/api/sessions/:id', (req, res) => {
      const session = this.sessionManager.getSession(req.params.id);
      if (!session) {
        return res.status(404).json({ error: 'Session not found' });
      }
      res.json(session);
    });

    this.app.post('/api/sessions', (req, res) => {
      const { mode = 'play' } = req.body;
      const session = this.sessionManager.createSession(mode);
      res.json(session);
    });

    // MCP Inbound endpoint
    this.app.post('/api/mcp/inbound', async (req, res) => {
      try {
        const message = req.body;
        await this.handleInboundMCP(message);
        res.json({ status: 'processed' });
      } catch (error) {
        console.error('MCP inbound error:', error);
        res.status(500).json({ error: 'Failed to process MCP message' });
      }
    });

    // Serve Svelte app for all other routes  
    this.app.get('*', (req, res) => {
      res.sendFile(path.join(__dirname, '../client/dist/index.html'));
    });
  }

  setupWebSocket() {
    this.wss.on('connection', (ws, req) => {
      console.log('WebSocket connection established');
      
      ws.on('message', async (data) => {
        try {
          const message = JSON.parse(data.toString());
          const isValid = validateMessage(message);
          
          if (!isValid) {
            ws.send(JSON.stringify({ 
              type: 'error', 
              message: 'Invalid message format' 
            }));
            return;
          }

          await this.handleWebSocketMessage(ws, message);
        } catch (error) {
          console.error('WebSocket message error:', error);
          ws.send(JSON.stringify({ 
            type: 'error', 
            message: 'Failed to process message' 
          }));
        }
      });

      ws.on('close', () => {
        // Clean up client mapping
        for (const [sessionId, client] of this.clients.entries()) {
          if (client === ws) {
            this.clients.delete(sessionId);
            break;
          }
        }
        console.log('WebSocket connection closed');
      });
    });
  }

  async handleWebSocketMessage(ws, message) {
    const { type, sessionId } = message;

    switch (type) {
      case 'join_session':
        this.clients.set(sessionId, ws);
        const session = this.sessionManager.getSession(sessionId);
        ws.send(JSON.stringify({
          type: 'session_state',
          session: session || null
        }));
        break;

      case 'move':
        await this.handleMove(ws, message);
        break;

      case 'request_analysis':
        await this.handleAnalysisRequest(ws, message);
        break;

      case 'end_session':
        await this.handleEndSession(ws, message);
        break;

      default:
        ws.send(JSON.stringify({
          type: 'error',
          message: `Unknown message type: ${type}`
        }));
    }
  }

  async handleMove(ws, message) {
    const { sessionId, move, fenBefore, fenAfter, evalCp, depth, timeMs } = message;
    
    const moveRecord = this.sessionManager.addMove(sessionId, {
      san: move.san,
      uci: move.uci,
      fenBefore,
      fenAfter,
      evalCp,
      depth,
      timeMs,
      clock: Date.now()
    });

    if (moveRecord) {
      // Broadcast move to all clients in session
      const updateMessage = JSON.stringify({
        type: 'move_update',
        sessionId,
        move: moveRecord,
        fen: fenAfter
      });
      
      const client = this.clients.get(sessionId);
      if (client) {
        client.send(updateMessage);
      }

      // Send MCP action for significant moves (every 3rd move or eval change > 50cp)
      if (moveRecord.ply % 3 === 0 || Math.abs(evalCp) > 50) {
        await this.mcpClient.sendEvaluateMove({
          sessionId,
          ply: moveRecord.ply,
          move: move.uci,
          fenBefore,
          fenAfter,
          evalCp,
          depth,
          timeMs
        });
      }
    }
  }

  async handleAnalysisRequest(ws, message) {
    const { sessionId, fen, depth = 15 } = message;
    
    // In a real implementation, this might trigger deeper analysis
    // For now, just acknowledge the request
    ws.send(JSON.stringify({
      type: 'analysis_started',
      sessionId,
      fen,
      depth
    }));
  }

  async handleEndSession(ws, message) {
    const { sessionId, result } = message;
    
    const summary = this.sessionManager.endSession(sessionId, result);
    if (summary) {
      // Send game summary via MCP
      await this.mcpClient.sendGameSummary(summary);
      
      // Notify client
      ws.send(JSON.stringify({
        type: 'session_ended',
        sessionId,
        summary
      }));
    }
  }

  async handleInboundMCP(message) {
    const { type, sessionId } = message;
    const client = this.clients.get(sessionId);
    
    if (!client) {
      console.warn(`No client found for session ${sessionId}`);
      return;
    }

    switch (type) {
      case 'adaptive_card':
        client.send(JSON.stringify({
          type: 'adaptive_card',
          sessionId,
          card: message.card
        }));
        break;

      case 'action':
        if (message.action === 'highlightSquares') {
          client.send(JSON.stringify({
            type: 'highlight_squares',
            sessionId,
            squares: message.parameters.squares,
            color: message.parameters.color || 'yellow'
          }));
        }
        break;

      default:
        console.warn(`Unknown inbound MCP type: ${type}`);
    }
  }

  start(port = 3456) {
    this.server.listen(port, () => {
      console.log(`Chess Trainer MCP Server running on port ${port}`);
      console.log(`GUI available at http://localhost:${port}`);
      console.log(`WebSocket at ws://localhost:${port}/ws`);
    });
  }

  shutdown() {
    console.log('Shutting down Chess Trainer MCP Server...');
    
    // Close all WebSocket connections
    this.wss.clients.forEach(ws => {
      if (ws.readyState === ws.OPEN) {
        ws.close(1000, 'Server shutting down');
      }
    });
    
    // Close WebSocket server
    this.wss.close((err) => {
      if (err) {
        console.error('Error closing WebSocket server:', err);
      } else {
        console.log('WebSocket server closed');
      }
    });
    
    // Clear client mappings
    this.clients.clear();
    
    // Close HTTP server
    this.server.close((err) => {
      if (err) {
        console.error('Error closing HTTP server:', err);
      } else {
        console.log('HTTP server closed');
      }
    });
  }
}

// Check if running as MCP server (stdio mode) 
if (process.argv.includes('--mcp') || process.env.MCP_STDIO_MODE === 'true') {
  // Import and start MCP server
  import('../bin/mcp-server.js');
} else if (import.meta.url === `file://${process.argv[1]}`) {
  // Start regular HTTP server
  const port = process.env.PORT || 3456;
  const server = new ChessTrainerServer();
  server.start(port);
}

export { ChessTrainerServer }; 