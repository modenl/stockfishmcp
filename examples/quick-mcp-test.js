#!/usr/bin/env node

/**
 * Quick test to call an MCP tool
 */

import { MCPServer } from '../server/mcpServer.js';

async function quickTest() {
  const mcpServer = new MCPServer();
  
  console.log('Testing MCP Tools:\n');
  
  // 1. Validate starting position
  console.log('1. Validating starting chess position:');
  const validateResult = await mcpServer.callTool('validate_fen', {
    fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
  });
  console.log(validateResult.content[0].text);
  
  // 2. Get best moves
  console.log('\n2. Getting best opening moves:');
  const bestMoves = await mcpServer.callTool('get_best_moves', {
    fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    count: 3
  });
  console.log(bestMoves.content[0].text);
  
  // 3. Explain an opening
  console.log('\n3. Explaining the Italian Game:');
  const explanation = await mcpServer.callTool('explain_opening', {
    moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4'],
    opening_name: 'Italian Game'
  });
  console.log(explanation.content[0].text);
}

quickTest().catch(console.error);