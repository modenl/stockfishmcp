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
    
    // 禁用所有非 JSON 输出
    this.silenceNonJsonOutput();
  }

  silenceNonJsonOutput() {
    // 重定向所有 console 输出到 stderr，确保 stdout 只有 JSON-RPC 消息
    const originalConsoleLog = console.log;
    const originalConsoleError = console.error;
    const originalConsoleWarn = console.warn;
    const originalConsoleInfo = console.info;
    
    // 保存原始的 stdout.write 用于发送 JSON-RPC 消息
    this.originalStdoutWrite = process.stdout.write.bind(process.stdout);
    
    console.log = (...args) => {
      process.stderr.write('[MCP LOG] ' + args.join(' ') + '\n');
    };
    
    console.error = (...args) => {
      process.stderr.write('[MCP ERROR] ' + args.join(' ') + '\n');
    };
    
    console.warn = (...args) => {
      process.stderr.write('[MCP WARN] ' + args.join(' ') + '\n');
    };

    console.info = (...args) => {
      process.stderr.write('[MCP INFO] ' + args.join(' ') + '\n');
    };

    // 禁用所有其他可能的输出
    process.on('warning', (warning) => {
      process.stderr.write(`[MCP WARNING] ${warning.name}: ${warning.message}\n`);
    });
  }

  setupHandlers() {
    this.rl.on('line', async (line) => {
      try {
        if (!line.trim()) return; // 忽略空行
        
        const request = JSON.parse(line);
        const response = await this.handleRequest(request);
        if (response) {
          this.sendResponse(response);
        }
      } catch (error) {
        this.sendError(`Invalid JSON: ${error.message}`, null);
      }
    });

    this.rl.on('close', () => {
      process.exit(0);
    });

    // Handle process termination gracefully
    process.on('SIGINT', () => {
      this.rl.close();
    });

    process.on('SIGTERM', () => {
      this.rl.close();
    });

    process.on('uncaughtException', (error) => {
      process.stderr.write(`[MCP UNCAUGHT] ${error.message}\n`);
      this.sendError(`Internal error: ${error.message}`, null);
      process.exit(1);
    });
  }

  async handleRequest(request) {
    this.requestId = request.id || 0;
    
    switch (request.method) {
      case 'initialize':
        return this.handleInitialize(request);
      
      case 'initialized':
        // 客户端发送的 initialized 通知，不需要响应
        return null;
      
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
        protocolVersion: '2025-06-18',
        capabilities: {
          tools: this.mcpServer.tools
        },
        serverInfo: {
          name: 'chess-trainer-mcp',
          version: '1.0.11'
        }
      }
    };
  }

  sendResponse(response) {
    // 直接写入 stdout，确保纯净的 JSON 输出
    this.originalStdoutWrite(JSON.stringify(response) + '\n');
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
    this.originalStdoutWrite(JSON.stringify(error) + '\n');
  }
}

// Start the server - 不发送任何初始化消息
const server = new StdioMCPServer(); 