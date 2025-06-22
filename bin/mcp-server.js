#!/usr/bin/env node

import { MCPServer } from '../server/mcpServer.js';
import readline from 'readline';

class StdioMCPServer {
  constructor() {
    this.mcpServer = new MCPServer();
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      crlfDelay: Infinity
    });
    
    this.requestId = 0;
    this.setupHandlers();
  }

  setupHandlers() {
    this.rl.on('line', async (line) => {
      try {
        const request = JSON.parse(line);
        const response = await this.handleRequest(request);
        this.sendResponse(response);
      } catch (error) {
        this.sendError(error.message, this.requestId);
      }
    });

    this.rl.on('close', () => {
      process.exit(0);
    });

    // Handle process termination
    process.on('SIGINT', () => {
      this.rl.close();
    });

    process.on('SIGTERM', () => {
      this.rl.close();
    });
  }

  async handleRequest(request) {
    this.requestId = request.id || 0;
    
    switch (request.method) {
      case 'initialize':
        return this.handleInitialize(request);
      
      case 'tools/list':
        const tools = await this.mcpServer.listTools();
        return {
          jsonrpc: '2.0',
          id: request.id,
          result: tools
        };
      
      case 'tools/call':
        try {
          const result = await this.mcpServer.callTool(
            request.params.name,
            request.params.arguments || {}
          );
          return {
            jsonrpc: '2.0',
            id: request.id,
            result: result
          };
        } catch (error) {
          return {
            jsonrpc: '2.0',
            id: request.id,
            error: {
              code: -32603,
              message: error.message
            }
          };
        }
      
      default:
        return {
          jsonrpc: '2.0',
          id: request.id,
          error: {
            code: -32601,
            message: `Method not found: ${request.method}`
          }
        };
    }
  }

  handleInitialize(request) {
    return {
      jsonrpc: '2.0',
      id: request.id,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: {
          tools: {
            listChanged: false
          }
        },
        serverInfo: {
          name: 'chess-trainer-mcp',
          version: '1.0.1'
        }
      }
    };
  }

  sendResponse(response) {
    console.log(JSON.stringify(response));
  }

  sendError(message, id = null) {
    const error = {
      jsonrpc: '2.0',
      id: id,
      error: {
        code: -32603,
        message: message
      }
    };
    console.log(JSON.stringify(error));
  }

  start() {
    // Send initialization complete notification
    this.sendResponse({
      jsonrpc: '2.0',
      method: 'initialized',
      params: {}
    });
  }
}

// Start the server
const server = new StdioMCPServer();
server.start(); 