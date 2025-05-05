/** @format */

import * as vscode from "vscode";

/**
 * Creates a multiline input box
 * @param title The title of the input box
 * @param placeHolder The placeholder text
 * @param value The initial value
 * @returns Promise<string | undefined> The entered text
 */
export async function createMultilineInputBox(
  title: string,
  placeHolder: string,
  value: string = ""
): Promise<string | undefined> {
  const inputBox = vscode.window.createInputBox();
  inputBox.title = title;
  inputBox.placeholder = placeHolder;
  inputBox.value = value;
  inputBox.ignoreFocusOut = true;
  inputBox.buttons = [
    {
      iconPath: new vscode.ThemeIcon("save"),
      tooltip: "Confirm (⌘+Enter)",
    },
  ];

  return new Promise((resolve) => {
    inputBox.onDidAccept(() => {
      resolve(inputBox.value);
      inputBox.hide();
      inputBox.dispose();
    });

    inputBox.onDidTriggerButton((button) => {
      if (button.tooltip?.startsWith("Confirm")) {
        resolve(inputBox.value);
        inputBox.hide();
        inputBox.dispose();
      }
    });

    inputBox.onDidHide(() => {
      // Resolve with undefined if the box was hidden without accepting
      if (inputBox.value !== undefined) {
        // Check if it wasn't already resolved
        // This check might be tricky depending on exact timing
        resolve(undefined);
      }
      inputBox.dispose();
    });

    inputBox.show();
  });
}

/**
 * Attempts to paste the clipboard content directly into the active editor
 * Simulates Ctrl+V/Cmd+V
 */
export async function directPaste(): Promise<void> {
  try {
    await vscode.commands.executeCommand("editor.action.clipboardPasteAction");
  } catch (error) {
    vscode.window.showWarningMessage(
      "Could not paste directly. Please paste manually (Ctrl+V/Cmd+V)."
    );
    console.error("Direct paste error:", error);
  }
}
