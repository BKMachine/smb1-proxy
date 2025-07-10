const chokidar = require('chokidar');
const fs = require('fs'); // Changed from 'fs/promises'
const path = require('path');
const { exec } = require('child_process');

const rootDir = process.cwd();

function log(...args) {
    if (args.length === 0) return;
    args = args.map(arg => arg.replace(/\/watched/, ''));
    const msg = `[${new Date().toISOString()}] ${args.join(' ')}\n`;
    process.stdout.write(msg);
    logStream.write(msg);
}

function logError(...args) {
    if (args.length === 0) return;
    args = args.map(arg => arg.replace(/\/watched/, ''));
    const msg = `[${new Date().toISOString()}] ERROR: ${args.join(' ')}\n`;
    process.stderr.write(msg);
    logStream.write(msg);
}

const logStream = fs.createWriteStream('watcher.log', { flags: 'a' });

// Loop through root and find all /sourceX directories
function findWatchDirs(root, callback) {
    const dirs = [];
    fs.readdir(root, { withFileTypes: true }, (err, entries) => {
        if (err) return callback(err);
        let pending = entries.length;
        if (!pending) return callback(null, dirs);

        entries.forEach(entry => {
            if (entry.isDirectory() && entry.name.startsWith('source')) {
                const match = entry.name.match(/^source(\d+)$/);
                if (match) {
                    const sourceDir = path.join(root, entry.name);
                    fs.access(sourceDir, fs.constants.F_OK, (err1) => {
                        if (!err1) dirs.push(sourceDir);
                        const remoteDir = path.join(root, `remote${match[1]}`);
                        fs.access(remoteDir, fs.constants.F_OK, (err2) => {
                            if (!err2) dirs.push(remoteDir);
                            if (!--pending) callback(null, dirs);
                        });
                    });
                } else {
                    if (!--pending) callback(null, dirs);
                }
            } else {
                if (!--pending) callback(null, dirs);
            }
        });
    });
}

let watcher;

// Watch the directories and handle changes
function watchDirectories(dirs) {
    watcher = chokidar.watch(dirs, {
        persistent: true,
        ignoreInitial: true,
        awaitWriteFinish: true,
        stabilityThreshold: 1500,
    });

    watcher.on('all', async (event, filePath) => {
        const relativePath = path.relative(rootDir, filePath);
        const match = relativePath.match(/source(\d+)|remote(\d+)/) || [];
        const shareNumber = match[1] || match[2];

        const destinationDirRoot = relativePath.includes('source') ? 'remote' : 'source';
        const destinationDir = path.join(rootDir, `${destinationDirRoot}${shareNumber}`);

        // Rsync archive clone the directories
        const rsyncCommand = `rsync -a --delete --checksum "${path.dirname(filePath)}/" "${destinationDir}"`;

        try {
            exec(rsyncCommand, (error, stdout, stderr) => {
                if (error) {
                    logError(`Error executing rsync: ${error.message}`);
                    return;
                }
                if (stderr) {
                    logError(`Rsync stderr: ${stderr}`);
                }
                if (stdout) log(`Event: ${event}, File: ${relativePath}`);
            });
        } catch (err) {
            logError('Error during rsync:', err.message);
        }

    });
}

function main() {
    log(`Starting watcher in directory: ${rootDir}`);

    // Find all source directories
    findWatchDirs(rootDir, (err, watchDirs) => {
        if (err) {
            logError('Error finding source directories:', err);
            return;
        }
        if (watchDirs.length === 0) {
            logError('No source directories found.');
            return;
        }

        log(`Found source directories: ${watchDirs.join(', ')}`);

        // Watch the directories
        watchDirectories(watchDirs);
    });
}

main();

process.on('uncaughtException', (err) => {
    logError('Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
    logError('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Graceful shutdown on Docker stop (SIGTERM)
process.on('SIGTERM', async () => {
    if (!watcher) process.exit(0);
    log('Received SIGTERM, shutting down watcher...');
    try {
        await watcher.close();
        log('Watcher closed.');
    } catch (err) {
        logError('Error closing watcher:', err.message);
    }
    process.exit(0);
});
