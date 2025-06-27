#!/usr/bin/env node

/**
 * Examples of how to call MCP tools
 */

import { spawn } from 'child_process';
import readline from 'readline';

// Example 1: Direct JSON-RPC communication with MCP server
class MCPClient {
  constructor() {
    this.mcpProcess = spawn('node', ['bin/mcp'], {
      stdio: ['pipe', 'pipe', 'pipe']
    });
    
    this.rl = readline.createInterface({
      input: this.mcpProcess.stdout,
      crlfDelay: Infinity
    });
    
    this.requestId = 0;
    this.pendingRequests = new Map();
    
    // Handle responses
    this.rl.on('line', (line) => {
      try {
        const response = JSON.parse(line);
        if (response.id !== undefined) {
          const handler = this.pendingRequests.get(response.id);
          if (handler) {
            handler(response);
            this.pendingRequests.delete(response.id);
          }
        }
      } catch (e) {
        // Ignore non-JSON lines
      }
    });
    
    // Handle errors
    this.mcpProcess.stderr.on('data', (data) => {
      console.error('MCP Server Error:', data.toString());
    });
  }
  
  async initialize() {
    const response = await this.sendRequest('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: {
        name: 'example-client',
        version: '1.0.0'
      }
    });
    
    console.log('Initialized:', response.result.serverInfo);
    return response;
  }
  
  async callTool(toolName, args) {
    const response = await this.sendRequest('tools/call', {
      name: toolName,
      arguments: args
    });
    
    return response.result;
  }
  
  sendRequest(method, params) {
    return new Promise((resolve) => {
      const id = ++this.requestId;
      const request = {
        jsonrpc: '2.0',
        id,
        method,
        params
      };
      
      this.pendingRequests.set(id, resolve);
      this.mcpProcess.stdin.write(JSON.stringify(request) + '\n');
    });
  }
  
  close() {
    this.mcpProcess.kill();
  }
}

// Example 2: Using the MCP server directly in Node.js
async function directMCPUsage() {
  console.log('\n=== Example 2: Direct MCP Server Usage ===\n');
  
  const { MCPServer } = await import('../server/mcpServer.js');
  const mcpServer = new MCPServer();
  
  // Call tool directly
  const result = await mcpServer.callTool('validate_fen', {
    fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
  });
  
  console.log('Validate FEN Result:', result.content[0].text);
}

// Example 3: JSON-RPC client usage
async function jsonRpcExample() {
  console.log('\n=== Example 3: JSON-RPC Client Usage ===\n');
  
  const client = new MCPClient();
  
  try {
    // Initialize connection
    await client.initialize();
    
    // Example 1: Validate a FEN position
    console.log('1. Validating FEN position...');
    const validateResult = await client.callTool('validate_fen', {
      fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
    });
    console.log(validateResult.content[0].text);
    
    // Example 2: Analyze a position
    console.log('\n2. Analyzing position...');
    const analyzeResult = await client.callTool('analyze_position', {
      fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1',
      depth: 10
    });
    console.log(analyzeResult.content[0].text);
    
    // Example 3: Get best moves
    console.log('\n3. Getting best moves...');
    const bestMovesResult = await client.callTool('get_best_moves', {
      fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      count: 3
    });
    console.log(bestMovesResult.content[0].text);
    
    // Example 4: Generate PGN
    console.log('\n4. Generating PGN...');
    const pgnResult = await client.callTool('generate_pgn', {
      moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5'],
      white_player: 'Magnus Carlsen',
      black_player: 'Hikaru Nakamura'
    });
    console.log(pgnResult.content[0].text);
    
    // Example 5: Launch Chess Trainer UI
    console.log('\n5. Launch Chess Trainer (example command)...');
    console.log('To launch: await client.callTool("launch_chess_trainer", { port: 3456 })');
    
    // Example 6: Create and play a game
    console.log('\n6. Game interaction examples:');
    console.log('Create game: await client.callTool("create_game_with_settings", {');
    console.log('  game_id: "test-game",');
    console.log('  mode: "human_vs_ai",');
    console.log('  player_color: "white",');
    console.log('  ai_elo: 1800');
    console.log('})');
    console.log('\nMake move: await client.callTool("make_move", {');
    console.log('  game_id: "test-game",');
    console.log('  move: "e2e4"');
    console.log('})');
    
  } finally {
    client.close();
  }
}

// Example 4: Using with Cursor/Claude/Continue
function cursorExample() {
  console.log('\n=== Example 4: Using with Cursor/Claude/Continue ===\n');
  console.log('In Cursor, Claude, or Continue, you can use natural language:');
  console.log('\n1. "Analyze this chess position: rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"');
  console.log('2. "What are the best moves in the starting position?"');
  console.log('3. "Start a chess game against AI with 1800 ELO"');
  console.log('4. "Make the move e2e4 in game test-game"');
  console.log('\nThe AI assistant will automatically call the appropriate MCP tools.');
}

// Example 5: Command-line usage
function commandLineExample() {
  console.log('\n=== Example 5: Command-line JSON-RPC ===\n');
  console.log('You can also send JSON-RPC requests via command line:');
  console.log('\necho \'{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05"}}\' | node bin/mcp');
  console.log('\necho \'{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"validate_fen","arguments":{"fen":"rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"}}}\' | node bin/mcp');
}

// Run examples
async function main() {
  console.log('=== MCP Tool Calling Examples ===\n');
  
  // Run direct usage example
  await directMCPUsage();
  
  // Run JSON-RPC example
  await jsonRpcExample();
  
  // Show other examples
  cursorExample();
  commandLineExample();
}

main().catch(console.error);