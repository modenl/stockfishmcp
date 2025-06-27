#!/usr/bin/env node

/**
 * Chess Trainer MCP Workflow Demo
 * 演示完整的MCP工作流程：启动Web UI → 设置游戏 → 开始对局
 */

import { MCPServer } from './server/mcpServer.js';

async function demonstrateWorkflow() {
  console.log('🎮 Chess Trainer MCP Workflow Demo\n');
  
  const mcpServer = new MCPServer();
  
  try {
    // Step 1: 启动 Chess Trainer Web UI
    console.log('📋 Step 1: 启动 Web UI');
    console.log('Command: launch_chess_trainer');
    
    const launchResult = await mcpServer.launchChessTrainer({
      port: 3456,
      auto_open_browser: true
    });
    
    console.log(launchResult.content[0].text);
    console.log('\n' + '='.repeat(60) + '\n');
    
    // 等待服务器完全启动
    console.log('⏳ 等待服务器启动...');
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Step 2: 创建游戏并设置参数
    console.log('📋 Step 2: 创建1800 ELO AI对局');
    console.log('Command: create_game_with_settings');
    
    const gameResult = await mcpServer.createGameWithSettings({
      game_id: 'demo_vs_ai_1800',
      mode: 'human_vs_ai',
      player_color: 'white',
      ai_elo: 1800,
      ai_time_limit: 1000
    });
    
    console.log(gameResult.content[0].text);
    console.log('\n' + '='.repeat(60) + '\n');
    
    // Step 3: 检查游戏状态
    console.log('📋 Step 3: 检查游戏状态');
    console.log('Command: get_game_state');
    
    const stateResult = await mcpServer.proxyToWebServer('get_game_state', {
      game_id: 'demo_vs_ai_1800'
    });
    
    console.log(stateResult.content[0].text);
    console.log('\n' + '='.repeat(60) + '\n');
    
    // Step 4: 开始第一步棋
    console.log('📋 Step 4: 走第一步棋 (e2-e4)');
    console.log('Command: make_move');
    
    const moveResult = await mcpServer.proxyToWebServer('make_move', {
      game_id: 'demo_vs_ai_1800',
      move: 'e2e4'
    });
    
    console.log(moveResult.content[0].text);
    console.log('\n' + '='.repeat(60) + '\n');
    
    // Step 5: 获取AI建议
    console.log('📋 Step 5: 获取AI建议走法');
    console.log('Command: suggest_move');
    
    const suggestionResult = await mcpServer.proxyToWebServer('suggest_move', {
      game_id: 'demo_vs_ai_1800',
      depth: 15
    });
    
    console.log(suggestionResult.content[0].text);
    console.log('\n' + '='.repeat(60) + '\n');
    
    // Summary
    console.log('🎉 工作流程演示完成！');
    console.log('\n📝 总结：');
    console.log('✅ 1. 成功启动Chess Trainer Web UI');
    console.log('✅ 2. 创建了1800 ELO的人机对局');
    console.log('✅ 3. 检查了游戏状态');
    console.log('✅ 4. 走了第一步棋');
    console.log('✅ 5. 获取了AI建议');
    console.log('\n🌐 继续游戏：http://localhost:3456');
    console.log('💡 使用MCP命令继续控制游戏！');
    
  } catch (error) {
    console.error('❌ 演示失败:', error.message);
    console.log('\n💡 提示：');
    console.log('1. 确保没有其他进程占用3456端口');
    console.log('2. 确保所有依赖已安装 (npm install)');
    console.log('3. 检查服务器文件是否存在');
  }
}

// 运行演示
if (import.meta.url === `file://${process.argv[1]}`) {
  demonstrateWorkflow();
}

export { demonstrateWorkflow }; 