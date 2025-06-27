import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export async function stopChessTrainerServer(port = 3456) {
  try {
    // Try to check if server is running first
    try {
      const response = await fetch(`http://localhost:${port}/api/health`);
      if (!response.ok) {
        return {
          success: false,
          message: `No server found running on port ${port}`
        };
      }
    } catch (e) {
      return {
        success: false,
        message: `No server found running on port ${port}`
      };
    }

    // Find and kill process on the port
    try {
      // For Unix-like systems (macOS, Linux)
      if (process.platform !== 'win32') {
        // Get PID of process using the port
        const { stdout: pid } = await execAsync(`lsof -ti:${port}`);
        if (pid) {
          // Kill the process
          await execAsync(`kill -9 ${pid.trim()}`);
          return {
            success: true,
            message: `Successfully stopped Chess Trainer server on port ${port}`
          };
        }
      } else {
        // For Windows
        const { stdout } = await execAsync(`netstat -ano | findstr :${port}`);
        const lines = stdout.trim().split('\n');
        for (const line of lines) {
          const parts = line.trim().split(/\s+/);
          const pid = parts[parts.length - 1];
          if (pid && pid !== '0') {
            await execAsync(`taskkill /PID ${pid} /F`);
            return {
              success: true,
              message: `Successfully stopped Chess Trainer server on port ${port}`
            };
          }
        }
      }
    } catch (error) {
      // Process might have already been killed
      return {
        success: true,
        message: `Server on port ${port} has been stopped`
      };
    }

    return {
      success: false,
      message: `Could not find process on port ${port}`
    };
  } catch (error) {
    return {
      success: false,
      message: `Failed to stop server: ${error.message}`
    };
  }
}