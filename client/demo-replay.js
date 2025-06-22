/**
 * 象棋复盘功能演示
 * Chess Game Replay Demo
 */

// 示例游戏数据
const demoGames = {
  // 经典的学者将死
  scholarsMate: {
    white: "初学者",
    black: "新手",
    date: "2024.01.01", 
    event: "学者将死演示",
    site: "在线",
    result: "1-0",
    moves: [
      { san: "e4", uci: "e2e4", from: "e2", to: "e4", color: "white", moveNumber: 1 },
      { san: "e5", uci: "e7e5", from: "e7", to: "e5", color: "black", moveNumber: 1 },
      { san: "Bc4", uci: "f1c4", from: "f1", to: "c4", color: "white", moveNumber: 2 },
      { san: "Nc6", uci: "b8c6", from: "b8", to: "c6", color: "black", moveNumber: 2 },
      { san: "Qh5", uci: "d1h5", from: "d1", to: "h5", color: "white", moveNumber: 3 },
      { san: "Nf6??", uci: "g8f6", from: "g8", to: "f6", color: "black", moveNumber: 3 },
      { san: "Qxf7#", uci: "h5f7", from: "h5", to: "f7", color: "white", moveNumber: 4 }
    ]
  },

  // 意大利开局
  italianGame: {
    white: "白方",
    black: "黑方",
    date: "2024.01.01",
    event: "意大利开局演示", 
    site: "在线",
    result: "*",
    moves: [
      { san: "e4", uci: "e2e4", from: "e2", to: "e4", color: "white", moveNumber: 1 },
      { san: "e5", uci: "e7e5", from: "e7", to: "e5", color: "black", moveNumber: 1 },
      { san: "Nf3", uci: "g1f3", from: "g1", to: "f3", color: "white", moveNumber: 2 },
      { san: "Nc6", uci: "b8c6", from: "b8", to: "c6", color: "black", moveNumber: 2 },
      { san: "Bc4", uci: "f1c4", from: "f1", to: "c4", color: "white", moveNumber: 3 },
      { san: "Bc5", uci: "f8c5", from: "f8", to: "c5", color: "black", moveNumber: 3 },
      { san: "c3", uci: "c2c3", from: "c2", to: "c3", color: "white", moveNumber: 4 },
      { san: "Nf6", uci: "g8f6", from: "g8", to: "f6", color: "black", moveNumber: 4 },
      { san: "d3", uci: "d2d3", from: "d2", to: "d3", color: "white", moveNumber: 5 },
      { san: "d6", uci: "d7d6", from: "d7", to: "d6", color: "black", moveNumber: 5 }
    ]
  },

  // 著名的"永恒将军"游戏
  immortalGame: {
    white: "Adolf Anderssen",
    black: "Lionel Kieseritzky", 
    date: "1851.06.21",
    event: "非正式游戏",
    site: "伦敦",
    result: "1-0",
    moves: [
      { san: "e4", uci: "e2e4", from: "e2", to: "e4", color: "white", moveNumber: 1 },
      { san: "e5", uci: "e7e5", from: "e7", to: "e5", color: "black", moveNumber: 1 },
      { san: "f4", uci: "f2f4", from: "f2", to: "f4", color: "white", moveNumber: 2 },
      { san: "exf4", uci: "e5f4", from: "e5", to: "f4", color: "black", moveNumber: 2 },
      { san: "Bc4", uci: "f1c4", from: "f1", to: "c4", color: "white", moveNumber: 3 },
      { san: "Qh4+", uci: "d8h4", from: "d8", to: "h4", color: "black", moveNumber: 3 },
      { san: "Kf1", uci: "e1f1", from: "e1", to: "f1", color: "white", moveNumber: 4 },
      { san: "b5", uci: "b7b5", from: "b7", to: "b5", color: "black", moveNumber: 4 },
      { san: "Bxb5", uci: "c4b5", from: "c4", to: "b5", color: "white", moveNumber: 5 },
      { san: "Nf6", uci: "g8f6", from: "g8", to: "f6", color: "black", moveNumber: 5 }
    ]
  }
};

/**
 * 复盘功能使用演示
 */
class ReplayDemo {
  constructor() {
    this.currentGame = null;
    this.currentPosition = -1;
    this.isPlaying = false;
    this.playSpeed = 1000;
  }

  /**
   * 加载游戏进行复盘
   */
  loadGame(gameKey) {
    if (!demoGames[gameKey]) {
      console.error(`游戏 ${gameKey} 不存在`);
      return;
    }

    this.currentGame = demoGames[gameKey];
    this.currentPosition = -1;
    
    console.log(`加载游戏: ${this.currentGame.event}`);
    console.log(`白方: ${this.currentGame.white}`);
    console.log(`黑方: ${this.currentGame.black}`);
    console.log(`总移动数: ${this.currentGame.moves.length}`);
    
    this.showGameInfo();
  }

  /**
   * 显示游戏信息
   */
  showGameInfo() {
    if (!this.currentGame) return;

    console.log('\n=== 游戏信息 ===');
    console.log(`赛事: ${this.currentGame.event}`);
    console.log(`地点: ${this.currentGame.site}`);
    console.log(`日期: ${this.currentGame.date}`);
    console.log(`白方: ${this.currentGame.white}`);
    console.log(`黑方: ${this.currentGame.black}`);
    console.log(`结果: ${this.currentGame.result}`);
    console.log(`移动数: ${this.currentGame.moves.length}`);
    console.log('================\n');
  }

  /**
   * 显示移动历史
   */
  showMoveHistory() {
    if (!this.currentGame) return;

    console.log('\n=== 移动历史 ===');
    console.log('0. 起始位置');
    
    this.currentGame.moves.forEach((move, index) => {
      const isActive = index === this.currentPosition;
      const marker = isActive ? ' ← 当前位置' : '';
      const moveNumber = move.color === 'white' ? `${move.moveNumber}.` : '';
      console.log(`${index + 1}. ${moveNumber}${move.san}${marker}`);
    });
    
    console.log('================\n');
  }

  /**
   * 跳转到特定位置
   */
  goToPosition(position) {
    if (!this.currentGame) {
      console.error('没有加载游戏');
      return;
    }

    if (position < -1 || position >= this.currentGame.moves.length) {
      console.error('位置超出范围');
      return;
    }

    this.currentPosition = position;
    
    if (position === -1) {
      console.log('跳转到起始位置');
    } else {
      const move = this.currentGame.moves[position];
      console.log(`跳转到第 ${position + 1} 步: ${move.san}`);
    }
    
    this.showCurrentPosition();
  }

  /**
   * 显示当前位置信息
   */
  showCurrentPosition() {
    if (this.currentPosition === -1) {
      console.log('当前位置: 起始位置');
      console.log('轮到: 白方');
    } else {
      const move = this.currentGame.moves[this.currentPosition];
      console.log(`当前位置: 第 ${this.currentPosition + 1} 步`);
      console.log(`最后移动: ${move.san} (${move.from}-${move.to})`);
      console.log(`轮到: ${this.currentPosition % 2 === 0 ? '黑方' : '白方'}`);
    }
  }

  /**
   * 下一步
   */
  nextMove() {
    if (this.currentPosition < this.currentGame.moves.length - 1) {
      this.goToPosition(this.currentPosition + 1);
    } else {
      console.log('已到达最后一步');
    }
  }

  /**
   * 上一步
   */
  previousMove() {
    if (this.currentPosition > -1) {
      this.goToPosition(this.currentPosition - 1);
    } else {
      console.log('已在起始位置');
    }
  }

  /**
   * 跳转到开始
   */
  goToStart() {
    this.goToPosition(-1);
  }

  /**
   * 跳转到结束
   */
  goToEnd() {
    this.goToPosition(this.currentGame.moves.length - 1);
  }

  /**
   * 自动播放
   */
  autoPlay() {
    if (this.isPlaying) {
      console.log('已在播放中');
      return;
    }

    this.isPlaying = true;
    console.log(`开始自动播放 (速度: ${this.playSpeed}ms)`);
    
    const playInterval = setInterval(() => {
      if (this.currentPosition < this.currentGame.moves.length - 1) {
        this.nextMove();
      } else {
        this.stopAutoPlay();
        clearInterval(playInterval);
      }
    }, this.playSpeed);
  }

  /**
   * 停止自动播放
   */
  stopAutoPlay() {
    this.isPlaying = false;
    console.log('停止自动播放');
  }

  /**
   * 设置播放速度
   */
  setPlaySpeed(speed) {
    this.playSpeed = speed;
    console.log(`播放速度设置为: ${speed}ms`);
  }

  /**
   * 导出为PGN格式
   */
  exportToPGN() {
    if (!this.currentGame) return '';

    let pgn = '';
    
    // 添加头部信息
    pgn += `[Event "${this.currentGame.event}"]\n`;
    pgn += `[Site "${this.currentGame.site}"]\n`;
    pgn += `[Date "${this.currentGame.date}"]\n`;
    pgn += `[Round "1"]\n`;
    pgn += `[White "${this.currentGame.white}"]\n`;
    pgn += `[Black "${this.currentGame.black}"]\n`;
    pgn += `[Result "${this.currentGame.result}"]\n\n`;
    
    // 添加移动记录
    let moveText = '';
    this.currentGame.moves.forEach((move, index) => {
      if (move.color === 'white') {
        moveText += `${move.moveNumber}. `;
      }
      moveText += move.san + ' ';
    });
    
    pgn += moveText + this.currentGame.result;
    
    console.log('\n=== PGN 格式 ===');
    console.log(pgn);
    console.log('================\n');
    
    return pgn;
  }

  /**
   * 运行完整演示
   */
  runDemo() {
    console.log('🎯 象棋复盘功能演示开始\n');
    
    // 1. 加载学者将死游戏
    console.log('1. 加载学者将死游戏...');
    this.loadGame('scholarsMate');
    
    // 2. 显示移动历史
    this.showMoveHistory();
    
    // 3. 逐步演示
    console.log('3. 开始逐步演示...');
    this.nextMove(); // e4
    this.nextMove(); // e5
    this.nextMove(); // Bc4
    this.nextMove(); // Nc6
    this.nextMove(); // Qh5
    this.nextMove(); // Nf6??
    this.nextMove(); // Qxf7#
    
    console.log('\n4. 演示导航功能...');
    this.goToStart();
    this.goToEnd();
    this.goToPosition(3); // 跳转到第4步
    
    // 5. 导出PGN
    console.log('\n5. 导出PGN格式...');
    this.exportToPGN();
    
    console.log('🎉 演示完成！');
  }
}

// 使用示例
if (typeof window !== 'undefined') {
  // 浏览器环境
  window.ReplayDemo = ReplayDemo;
  window.demoGames = demoGames;
  
  // 创建全局演示实例
  window.replayDemo = new ReplayDemo();
  
  console.log('复盘演示已加载！使用方法：');
  console.log('replayDemo.loadGame("scholarsMate")');
  console.log('replayDemo.runDemo()');
} else {
  // Node.js 环境
  module.exports = { ReplayDemo, demoGames };
}

// 自动运行演示（如果直接执行此文件）
if (typeof require !== 'undefined' && require.main === module) {
  const demo = new ReplayDemo();
  demo.runDemo();
} 