const { exec } = require('child_process');

function startHyperdht() {
  exec('./start_hyperdht.sh', (error, stdout, stderr) => {
    if (error) {
      console.error(`Error starting hyperdht: ${error.message}`);
      return;
    }
    if (stderr) {
      console.error(`stderr: ${stderr}`);
      return;
    }
    console.log(`stdout: ${stdout}`);
  });
}

startHyperdht();
