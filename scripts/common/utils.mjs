import { spawn } from 'node:child_process';
import { statSync } from 'node:fs';

const ZHOME_HOST = 'zhome@zhome.local';

export function runCommandAsync(command, input) {
    return new Promise((resolve, reject) => {
        const proc = spawn(command, {
            shell: true,
            stdio: [input ? 'pipe' : 'ignore', 'inherit', 'inherit']
        });
        proc.on('error', (error) => {
            reject(error);
        });
        if (input && proc.stdin) {
            proc.stdin.write(input, 'utf-8');
            proc.stdin.end();
        }
        proc.on('close', (code) => {
            if (code !== 0) {
                reject(new Error('Command terminated with errors'));
            } else {
                resolve();
            }
        });
    });
}

// This function is unsafe because commandWithArgs is not escaped or sanitized in any way
export async function runSshCommandAsync(commandWithArgs, input) {
    await runCommandAsync(`ssh ${ZHOME_HOST} ${commandWithArgs}`, input);
}

// This function is unsafe because the file names are not escaped or sanitized in any way
export async function pullSshFileAsync(remoteFile, localDestinationFile) {
    await runCommandAsync(`scp "${ZHOME_HOST}:${remoteFile}" "${localDestinationFile}"`);
}

export function getFileSize(file) {
    return (statSync(file).size / 1024).toFixed(2) + ' Kb';
}
