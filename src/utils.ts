/** @format */

import * as vscode from "vscode";

/**
 * Creates a multiline input box interface
 * @param title Title of the input box
 * @param placeholder Placeholder text
 * @param initialValue Initial value
 * @returns Promise<string | undefined> User input or undefined (if canceled)
 */
export async function createMultilineInputBox(
  title: string,
  placeholder: string,
  initialValue: string = ""
): Promise<string | undefined> {
  return new Promise((resolve) => {
    const panel = vscode.window.createWebviewPanel(
      "multilineInput",
      title,
      {
        viewColumn: vscode.ViewColumn.Active,
        preserveFocus: false,
      },
      {
        enableScripts: true,
        retainContextWhenHidden: true,
      }
    );

    panel.webview.html = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${title}</title>
        <style>
          body, html {
            height: 100%;
            margin: 0;
            padding: 0;
            background-color: var(--vscode-editor-background);
            color: var(--vscode-editor-foreground);
            font-family: var(--vscode-font-family);
            overflow: hidden;
          }
          .container {
            display: flex;
            flex-direction: column;
            height: 100vh;
            max-height: 400px;
            padding: 10px;
            box-sizing: border-box;
          }
          textarea {
            flex: 1;
            resize: none;
            padding: 8px;
            min-height: 100px;
            max-height: 300px;
            background-color: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border);
            font-family: var(--vscode-editor-font-family);
            font-size: var(--vscode-editor-font-size);
            line-height: 1.5;
            margin-bottom: 10px;
          }
          .buttons {
            margin-top: 5px;
            text-align: right;
            flex-shrink: 0;
          }
          button {
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            padding: 6px 12px;
            cursor: pointer;
            margin-left: 8px;
          }
          button:hover {
            background-color: var(--vscode-button-hoverBackground);
          }
          .placeholder {
            color: var(--vscode-input-placeholderForeground);
            position: absolute;
            pointer-events: none;
            padding: 8px;
            display: none;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="placeholder" id="placeholder">${placeholder}</div>
          <textarea id="input" placeholder="${placeholder}" autofocus>${initialValue}</textarea>
          <div class="buttons">
            <button id="cancel">Cancel</button>
            <button id="save">Save</button>
          </div>
        </div>
        <script>
          const vscode = acquireVsCodeApi();
          const textarea = document.getElementById('input');

          document.getElementById('save').addEventListener('click', () => {
            vscode.postMessage({
              type: 'save',
              value: textarea.value
            });
          });

          document.getElementById('cancel').addEventListener('click', () => {
            vscode.postMessage({
              type: 'cancel'
            });
          });

          // Support Ctrl+Enter or Cmd+Enter to submit
          textarea.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
              vscode.postMessage({
                type: 'save',
                value: textarea.value
              });
            }

            if (e.key === 'Escape') {
              vscode.postMessage({
                type: 'cancel'
              });
            }
          });

          // Auto focus and place cursor at the end
          textarea.focus();
          textarea.selectionStart = textarea.selectionEnd = textarea.value.length;
        </script>
      </body>
      </html>
    `;

    panel.webview.onDidReceiveMessage((message) => {
      if (message.type === "save") {
        resolve(message.value);
        panel.dispose();
      } else if (message.type === "cancel") {
        resolve(undefined);
        panel.dispose();
      }
    });

    panel.onDidDispose(() => {
      resolve(undefined);
    });
  });
}

/**
 * Direct paste to editor
 * Pastes clipboard content to the Cursor editor
 */
export async function directPaste(): Promise<void> {
  try {
    await vscode.commands.executeCommand("composer.startComposerPrompt");

    setTimeout(async () => {
      await vscode.commands.executeCommand(
        "editor.action.clipboardPasteAction"
      );
    }, 100);
  } catch (error) {
    vscode.window.showErrorMessage(
      `Error during paste: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Helper function to display error messages
 * @param message Error prefix
 * @param error Error object
 */
export function showError(message: string, error: unknown): void {
  vscode.window.showErrorMessage(
    `${message}: ${error instanceof Error ? error.message : String(error)}`
  );
}

/**
 * Creates and registers a VS Code command with error handling
 * @param commandId The command ID to register
 * @param callback The command handler function
 * @param errorMessage Error message prefix to show if command fails
 * @returns The disposable command registration
 */
export function createCommand<T = any>(
  commandId: string,
  callback: (...args: any[]) => Promise<T>,
  errorMessage: string
): vscode.Disposable {
  return vscode.commands.registerCommand(commandId, async (...args: any[]) => {
    try {
      return await callback(...args);
    } catch (error) {
      showError(errorMessage, error);
      return undefined;
    }
  });
}
