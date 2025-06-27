import { MCPServer } from './server/mcpServer.js';

async function testGeneratePGN() {
  console.log('Testing generate_pgn MCP tool...\n');
  
  const server = new MCPServer();
  
  // Ruy Lopez opening moves
  const moves = ["e4", "e5", "Nf3", "Nc6", "Bb5"];
  
  try {
    const result = await server.callTool('generate_pgn', {
      moves: moves,
      white_player: 'Player 1',
      black_player: 'Player 2'
    });
    
    console.log('Result from generate_pgn tool:');
    console.log('================================');
    console.log(result.content[0].text);
  } catch (error) {
    console.error('Error:', error.message);
  }
}

testGeneratePGN();