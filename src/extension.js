const vscode = require('vscode');
const path = require('path');
const fs = require('fs').promises;

const textFileExtensions = new Set([
    // Programming languages
    '.js', '.jsx', '.ts', '.tsx', '.py', '.java', '.c', '.cpp', '.cs', '.go', '.rb', '.php',
    '.html', '.css', '.scss', '.sass', '.less', '.vue', '.svelte',
    // Data formats
    '.json', '.xml', '.yaml', '.yml', '.toml', '.ini', '.env',
    // Documentation
    '.md', '.txt', '.rst', '.tex',
    // Configuration
    '.config', '.conf', '.cfg',
    // Shell scripts
    '.sh', '.bash', '.zsh', '.fish',
    // Other common text formats
    '.csv', '.sql', '.graphql', '.prisma'
]);

function isTextFile(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    return textFileExtensions.has(ext);
}

function activate(context) {
    // Create and register a new webview view provider
    const provider = new ViewProvider(context.extensionUri);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider('vsingestView', provider)
    );
}

class ViewProvider {
    constructor(extensionUri) {
        this._extensionUri = extensionUri;
    }

    async resolveWebviewView(webviewView) {
        this.webviewView = webviewView;
        webviewView.webview.options = {
            enableScripts: true
        };

        // Set up visibility change listener
        webviewView.onDidChangeVisibility(async () => {
            if (webviewView.visible) {
                await this.updateContent();
            }
        });

        // Initial content update
        await this.updateContent();
    }

    async updateContent() {
        if (this.webviewView && this.webviewView.visible) {
            const provider = new DirectoryStructureProvider();
            const data = await provider.generateStructure();
            this.webviewView.webview.html = getWebviewContent(data);
        }
    }
}

class DirectoryStructureProvider {
    constructor() {
        this.summaryInfo = {
            fileCount: 0,
            totalSize: 0,
            estimatedTokens: 0
        };
        this.fileContents = [];
    }

    // Helper function to escape HTML and preserve formatting
    escapeHtml(unsafe) {
        return unsafe
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    async generateStructure() {
        if (!vscode.workspace.workspaceFolders) {
            return {
                structure: 'No workspace folder open',
                summary: this.summaryInfo,
                contents: []
            };
        }

        const workspaceRoot = vscode.workspace.workspaceFolders[0].uri;
        const files = await vscode.workspace.findFiles('**/*', '**/node_modules/**');
        const textFiles = files.filter(file => isTextFile(file.fsPath));

        this.summaryInfo = {
            fileCount: textFiles.length,
            totalSize: 0,
            estimatedTokens: 0
        };

        // Read contents of all text files
        this.fileContents = await Promise.all(textFiles.map(async (file) => {
            try {
                const content = await fs.readFile(file.fsPath, 'utf-8');
                const relativePath = path.relative(workspaceRoot.fsPath, file.fsPath);
                const stat = await fs.stat(file.fsPath);

                this.summaryInfo.totalSize += stat.size;
                this.summaryInfo.estimatedTokens += Math.ceil(content.length / 16);

                return {
                    path: relativePath,
                    content: this.escapeHtml(content)
                };
            } catch (error) {
                console.error(`Error reading file ${file.fsPath}:`, error);
                return {
                    path: path.relative(workspaceRoot.fsPath, file.fsPath),
                    content: `Error reading file: ${error.message}`
                };
            }
        }));

        const rootName = path.basename(workspaceRoot.fsPath);
        let structure = `${rootName}/\n`;

        const tree = {};
        files.forEach(file => {
            const relativePath = path.relative(workspaceRoot.fsPath, file.fsPath);
            const parts = relativePath.split(path.sep);
            let current = tree;
            parts.forEach(part => {
                if (!current[part]) current[part] = {};
                current = current[part];
            });
        });

        structure += this.printTree(tree);

        return {
            structure,
            summary: this.summaryInfo,
            contents: this.fileContents
        };
    }

    printTree(node, prefix = '   ', isLast = true) {
        let result = '';
        const entries = Object.entries(node);
        entries.forEach(([key, value], index) => {
            const isLastEntry = index === entries.length - 1;
            const isDirectory = Object.keys(value).length > 0;
            const marker = isLastEntry ? '└── ' : '├── ';
            const formattedKey = isDirectory ? `${key}/` : key;
            result += `${prefix}${marker}${formattedKey}\n`;
            if (isDirectory) {
                const newPrefix = prefix + (isLastEntry ? '    ' : '│   ');
                result += this.printTree(value, newPrefix, isLastEntry);
            }
        });
        return result;
    }
}

function formatSize(bytes) {
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
        size /= 1024;
        unitIndex++;
    }

    return `${size.toFixed(2)} ${units[unitIndex]}`;
}

function formatNumber(num) {
    return new Intl.NumberFormat().format(num);
}



function getWebviewContent(data) {
    const { structure, summary, contents } = data;
    return `<!DOCTYPE html>
    <html>
        <head>
            <style>
                @import url('https://fonts.googleapis.com/css2?family=Inconsolata:wght@200..900&family=Inter:ital,opsz,wght@0,14..32,100..900;1,14..32,100..900&family=Lato:ital,wght@0,100;0,300;0,400;0,700;0,900;1,100;1,300;1,400;1,700;1,900&display=swap');
                
                body {
                    background-color:#222a29;
                    color:rgb(250, 250, 250);
                    font-family: "Inter", serif;
                }

                h1 {
                    font-size: 18px;
                    line-height: 1.2;
                    display: inline-block;
                    margin: 10px 0;
                }

                .summary-container {
                    white-space: pre-wrap;
                    height: auto;
                    background-color: #4e5554;
                    backdrop-filter: blur(10px);
                    border-radius: 3px;
                    padding: 10px;
                    box-shadow: 6px 6px 2px 1px rgba(0, 0, 0, 0.2);
                    font-family: Courier New, sans-serif;
                    font-size: 12px;
                    display: flex;
                    flex-direction: column;
                    justify-content: center;
                    align-items: left;
                    text-align: left;
                }

                #structure {
                    position: relative;
                    white-space: pre-wrap;
                    background-color: #4e5554;
                    backdrop-filter: blur(10px);
                    border-radius: 3px;
                    padding: 10px;
                    box-shadow: 6px 6px 2px 1px rgba(0, 0, 0, 0.2);
                    font-size: 12px;
                    height: 225px;
                    overflow-y: auto;
                    resize: vertical;
                    scrollbar-color: rgba(255, 255, 255, 0.4) rgba(0, 0, 0, 0.1);
                    margin: 0;
                }

                #structure::-webkit-scrollbar {
                    width: 4px;
                    background: rgba(0, 0, 0, 0.1);
                }

                #structure::-webkit-scrollbar-track {
                    background: rgba(0, 0, 0, 0.1);
                    border-radius: 10px;
                }

                #structure::-webkit-scrollbar-thumb {
                    background-color: rgba(255, 255, 255, 0.6);
                    border-radius: 10px;
                    border: 1px solid rgba(255, 255, 255, 0);
                }

                #structure::-webkit-scrollbar-thumb:hover {
                    background-color: rgba(255, 255, 255, 0.8);
                }

                .content-container {                
                    position: relative;
                    white-space: pre-wrap;
                    background-color: #4e5554;
                    backdrop-filter: blur(10px);
                    border-radius: 3px;
                    padding: 10px;
                    box-shadow: 6px 6px 2px 1px rgba(0, 0, 0, 0.2);
                    font-size: 12px;
                    height: 275px;
                    overflow-y: auto;
                    resize: vertical;
                    scrollbar-color: rgba(255, 255, 255, 0.4) rgba(0, 0, 0, 0.1);
                    margin: 0;
                    font-family: 'Courier New', monospace;
                    overflow-x: hidden; /* Hides the horizontal scrollbar */
                    resize: vertical; /* Allows resizing both horizontally and vertically */
                }

                .content-container::-webkit-scrollbar {
                    width: 4px;
                    background: rgba(0, 0, 0, 0.1);
                }

                .content-container::-webkit-scrollbar-track {
                    background: rgba(0, 0, 0, 0.1);
                    border-radius: 10px;
                }

                .content-container::-webkit-scrollbar-thumb {
                    background-color: rgba(255, 255, 255, 0.6);
                    border-radius: 10px;
                    border: 1px solid rgba(255, 255, 255, 0);
                }

                .content-container::-webkit-scrollbar-thumb:hover {
                    background-color: rgba(255, 255, 255, 0.8);
                }

                .summary-item {
                    margin: 2px 0;
                }

                .timestamp {
                    font-size: 12px;
                    color: rgba(255, 255, 255, 0.5);
                    margin-top: 10px;
                    float: right;
                }

                .copy-button {
                    position: sticky;
                    top: 0px;
                    right: 0px;
                    width: 24px;
                    height: 24px;
                    background: none;
                    border: none;
                    padding: 0;
                    cursor: pointer;
                    z-index: 1;
                    float: right;
                    user-select: none;
                    -webkit-user-select: none;
                    -moz-user-select: none;
                    -ms-user-select: none;
                    transform: translateY(-30px);
                }

                .file-separator {
                    white-space: pre;
                    color:rgba(60, 255, 0, 0.85);
                    margin: 0;
                    padding: 0;
                    font-family: 'Courier New', monospace;
                }

                .file-content {
                    margin: 0;
                    padding: 0;
                    white-space: pre-wrap;
                    word-wrap: break-word;
                }
            </style>
        </head>

        <body>

            <h1>Summary</h1>
            <div class="summary-container">
                <div class="summary-item">Files analyzed: ${formatNumber(summary.fileCount)}</div>
                <div class="summary-item">Size: ${formatSize(summary.totalSize)}</div>
                <div class="summary-item">Estimated Tokens: ${formatNumber(summary.estimatedTokens)}</div>
            </div>

            <h1>Directory Structure</h1>

            <pre id="structure"><button class="copy-button" onclick="copyText()">
                <svg width="18px" height="18px" viewBox="-2.4 -2.4 28.80 28.80" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <title>Copy</title>
                    <g id="SVGRepo_bgCarrier" stroke-width="0"></g>
                    <g id="SVGRepo_tracerCarrier" stroke-linecap="round" stroke-linejoin="round"></g>
                    <g id="SVGRepo_iconCarrier">
                        <g id="Edit / Copy">
                            <path id="Vector" d="M9 9V6.2002C9 5.08009 9 4.51962 9.21799 4.0918C9.40973 3.71547 9.71547 3.40973 10.0918 3.21799C10.5196 3 11.0801 3 12.2002 3H17.8002C18.9203 3 19.4801 3 19.9079 3.21799C20.2842 3.40973 20.5905 3.71547 20.7822 4.0918C21.0002 4.51962 21.0002 5.07967 21.0002 6.19978V11.7998C21.0002 12.9199 21.0002 13.48 20.7822 13.9078C20.5905 14.2841 20.2839 14.5905 19.9076 14.7822C19.4802 15 18.921 15 17.8031 15H15M9 9H6.2002C5.08009 9 4.51962 9 4.0918 9.21799C3.71547 9.40973 3.40973 9.71547 3.21799 10.0918C3 10.5196 3 11.0801 3 12.2002V17.8002C3 18.9203 3 19.4801 3.21799 19.9079C3.40973 20.2842 3.71547 20.5905 4.0918 20.7822C4.5192 21 5.07899 21 6.19691 21H11.8036C12.9215 21 13.4805 21 13.9079 20.7822C14.2842 20.5905 14.5905 20.2839 14.7822 19.9076C15 19.4802 15 18.921 15 17.8031V15M9 9H11.8002C12.9203 9 13.4801 9 13.9079 9.21799C14.2842 9.40973 14.5905 9.71547 14.7822 10.0918C15 10.5192 15 11.079 15 12.1969L15 15" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path>
                        </g>
                    </g>
                </svg>
            </button>${structure}</pre>

            <h1>File Details</h1>

            <div class="content-container">
                <button class="copy-button" onclick="copyContent()">
                    <svg width="18px" height="18px" viewBox="-2.4 -2.4 28.80 28.80" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <title>Copy</title>
                        <g id="SVGRepo_bgCarrier" stroke-width="0"></g>
                        <g id="SVGRepo_tracerCarrier" stroke-linecap="round" stroke-linejoin="round"></g>
                        <g id="SVGRepo_iconCarrier">
                            <g id="Edit / Copy">
                                <path id="Vector" d="M9 9V6.2002C9 5.08009 9 4.51962 9.21799 4.0918C9.40973 3.71547 9.71547 3.40973 10.0918 3.21799C10.5196 3 11.0801 3 12.2002 3H17.8002C18.9203 3 19.4801 3 19.9079 3.21799C20.2842 3.40973 20.5905 3.71547 20.7822 4.0918C21.0002 4.51962 21.0002 5.07967 21.0002 6.19978V11.7998C21.0002 12.9199 21.0002 13.48 20.7822 13.9078C20.5905 14.2841 20.2839 14.5905 19.9076 14.7822C19.4802 15 18.921 15 17.8031 15H15M9 9H6.2002C5.08009 9 4.51962 9 4.0918 9.21799C3.71547 9.40973 3.40973 9.71547 3.21799 10.0918C3 10.5196 3 11.0801 3 12.2002V17.8002C3 18.9203 3 19.4801 3.21799 19.9079C3.40973 20.2842 3.71547 20.5905 4.0918 20.7822C4.5192 21 5.07899 21 6.19691 21H11.8036C12.9215 21 13.4805 21 13.9079 20.7822C14.2842 20.5905 14.5905 20.2839 14.7822 19.9076C15 19.4802 15 18.921 15 17.8031V15M9 9H11.8002C12.9203 9 13.4801 9 13.9079 9.21799C14.2842 9.40973 14.5905 9.71547 14.7822 10.0918C15 10.5192 15 11.079 15 12.1969L15 15" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path>
                            </g>
                        </g>
                    </svg>
                </button>
            ${contents.map((file, index) => `
                <div class="file-separator">${index === 0 ? '' : '\n'}====================================\nFile: ${file.path}\n====================================\n</div>
                <div class="file-content">${file.content.trim()}</div>`).join('')}

           </div>

            <div class="timestamp">Last Updated: ${new Date().toLocaleTimeString()}</div>

            <script>
                window.addEventListener('DOMContentLoaded', (event) => {
                    const container = document.querySelector('.content-container');
                    if (container) {
                        // Remove any whitespace nodes that are direct children of content-container
                        container.childNodes.forEach(node => {
                            if (node.nodeType === Node.TEXT_NODE && node.textContent.trim() === '') {
                                node.remove();
                            }
                        });

                        // Clean up any remaining whitespace between elements
                        const elements = container.children;
                        for (let elem of elements) {
                            if (elem.classList.contains('file-content')) {
                                elem.textContent = elem.textContent.trim();
                            }
                        }
                    }
                });

                async function copyText() {
                    try {
                        // Get the content of the structure element
                        const structureElement = document.getElementById('structure');
                        
                        // Create a temporary element to hold the structure content
                        const tempElement = document.createElement('div');
                        tempElement.innerHTML = structureElement.innerHTML;
                        
                        // Remove the button element from our temporary container
                        const buttonElement = tempElement.querySelector('.copy-button');
                        if (buttonElement) {
                            buttonElement.remove();
                        }
                        
                        // Get the cleaned text content
                        const textToCopy = tempElement.textContent.trim();
                        
                        // Copy to clipboard
                        await navigator.clipboard.writeText(textToCopy);
                        
                        // Visual feedback
                        const button = document.querySelector('.copy-button');
                        button.style.opacity = '0.5';
                        setTimeout(() => {
                            button.style.opacity = '1';
                        }, 200);
                        
                    } catch (err) {
                        console.error('Failed to copy text:', err);
                    }
                }

                // Helper function to decode HTML entities when copying
                function decodeHtml(html) {
                    const txt = document.createElement('textarea');
                    txt.innerHTML = html;
                    return txt.value;
                }

                async function copyContent() {
                    try {
                        const contentElement = document.querySelector('.content-container');
                        const tempElement = document.createElement('div');
                        tempElement.innerHTML = contentElement.innerHTML;
                        
                        // Remove the copy button
                        const buttonElement = tempElement.querySelector('.copy-button');
                        if (buttonElement) {
                            buttonElement.remove();
                        }
                        
                        // Get text content and decode HTML entities
                        const textToCopy = decodeHtml(tempElement.textContent.trim());
                        
                        await navigator.clipboard.writeText(textToCopy);
                        
                        const button = document.querySelector('.content-container .copy-button');
                        button.style.opacity = '0.5';
                        setTimeout(() => {
                            button.style.opacity = '1';
                        }, 200);
                        
                    } catch (err) {
                        console.error('Failed to copy content:', err);
                    }
                }

                
            </script>
        </body>
    </html>`;
}

function deactivate() { }

// Export all necessary components
module.exports = {
    activate,
    deactivate,
    DirectoryStructureProvider,
    ViewProvider,
    getWebviewContent,
    formatSize,
    formatNumber
};