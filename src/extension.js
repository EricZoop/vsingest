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
    }

    async generateStructure() {
        if (!vscode.workspace.workspaceFolders) {
            return {
                structure: 'No workspace folder open',
                summary: this.summaryInfo
            };
        }
    
        const workspaceRoot = vscode.workspace.workspaceFolders[0].uri;
        const files = await vscode.workspace.findFiles('**/*', '**/node_modules/**');
        
        // Filter text files
        const textFiles = files.filter(file => isTextFile(file.fsPath));
        
        this.summaryInfo = {
            fileCount: textFiles.length,
            totalSize: 0,
            estimatedTokens: 0
        };
    
        // Calculate size and tokens for text files only
        await Promise.all(textFiles.map(async (file) => {
            try {
                const stat = await fs.stat(file.fsPath);
                
                // Try to read the file content
                try {
                    const content = await fs.readFile(file.fsPath, 'utf-8');
                    this.summaryInfo.totalSize += stat.size;
                    
                    // Estimate tokens (approximately 4 chars per token)
                    this.summaryInfo.estimatedTokens += Math.ceil(content.length / 16);
                // eslint-disable-next-line no-unused-vars
                } catch (readError) {
                    // If we can't read the file as text, skip it
                    console.debug(`Skipping file ${file.fsPath}: Not readable as text`);
                }
            } catch (error) {
                console.error(`Error processing file ${file.fsPath}:`, error);
            }
        }));
    

        const rootName = path.basename(workspaceRoot.fsPath);
        let structure = `Directory structure:\n${rootName}/\n`;
        
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
            summary: this.summaryInfo
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
    const { structure, summary } = data;
    return `<!DOCTYPE html>
    <html>
        <head>
            <style>
                @import url('https://fonts.googleapis.com/css2?family=Inconsolata:wght@200..900&family=Lato:ital,wght@0,100;0,300;0,400;0,700;0,900;1,100;1,300;1,400;1,700;1,900&display=swap');

                body {
                    background-color:rgba(0, 112, 88, 0.07);
                    color:rgb(250, 250, 250);
                    font-family: "Lato", serif;
                }

                h1 {
                    font-size: 20px;
                    line-height: 1.2;
                    margin: 10px 0;
                }

                .summary-container {
                    white-space: nowrap;
                    height: auto;
                    background-color: rgba(255, 255, 255, 0.2);
                    backdrop-filter: blur(10px);
                    border-radius: 3px;
                    padding: 10px;
                    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
                    font-family: Courier New, sans-serif; /* Set desired font family */
                    font-size: 12px;
                    display: flex; /* Use flexbox for layout */
                    flex-direction: column; /* Stack rows vertically */
                    justify-content: center; /* Center rows vertically */
                    align-items: left; /* Center rows horizontally */
                    text-align: left; /* Align text in the center */
                }
                #structure {
                    white-space: pre-wrap;
                    background-color: rgba(255, 255, 255, 0.2);
                    backdrop-filter: blur(10px);
                    border-radius: 3px;
                    padding: 10px;
                    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
                    font-size: 12px;
                    height: 200px;
                    overflow-y: auto;
                    resize: vertical;
                    scrollbar-color: rgba(255, 255, 255, 0.4) rgba(0, 0, 0, 0.1); /* Light thumb, dark track */
                }

                /* Webkit scrollbar styling */
                #structure::-webkit-scrollbar {
                    width: 4px;  /* Thinner scrollbar */
                    background: rgba(0, 0, 0, 0.1); /* Transparent background */
                }

                #structure::-webkit-scrollbar-track {
                    background: rgba(0, 0, 0, 0.1); /* Darker transparent track */
                    border-radius: 10px; /* Rounded track corners */
                }

                #structure::-webkit-scrollbar-thumb {
                    background-color: rgba(255, 255, 255, 0.6); /* Transparent thumb */
                    border-radius: 10px; /* Rounded thumb corners */
                    border: 2px solid rgba(255, 255, 255, 0.3); /* Light border to distinguish thumb */
                }

                #structure::-webkit-scrollbar-thumb:hover {
                    background-color: rgba(255, 255, 255, 0.8); /* Slightly darker on hover */
                }


                .summary-item {
                    margin: 5px 0;
                }

                button svg {
                    width: 16px;
                    height: 16px;
                }

                .timestamp {
                    font-size: 12px;
                    color: #666;
                    margin-top: 10px;
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
            <pre id="structure">${structure}</pre>

            <div class="timestamp">Updated ${new Date().toLocaleTimeString()}</div>

            <script>
                function copyText() {
                    const text = document.getElementById('structure').textContent;
                    navigator.clipboard.writeText(text);
                }
            </script>
        </body>
    </html>`;
}

function deactivate() {}

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