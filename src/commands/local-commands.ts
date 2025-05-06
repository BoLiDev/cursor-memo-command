/** @format */

import * as vscode from "vscode";
import { LocalMemoService } from "../services/local-data-service";
import { MemoItem } from "../models/memo-item";
import { VSCodeUserInteractionService } from "../services/vscode-user-interaction-service";

// Temporary: Define directPaste here until it's properly handled/moved
// TODO: Move directPaste to a suitable utility or integrate into UIService
async function directPaste(): Promise<void> {
  try {
    await vscode.commands.executeCommand("editor.action.clipboardPasteAction");
  } catch (error) {
    // Use uiService for warnings in the future if needed
    console.error("Direct paste error:", error);
    // Potentially: await uiService.showWarningMessage("Could not paste directly...");
  }
}

/**
 * Creates the save command handler
 * @param dataService The local memo data service
 * @param uiService The user interaction service
 * @returns The save command handler function
 */
export function createSaveCommandHandler(
  dataService: LocalMemoService,
  uiService: VSCodeUserInteractionService
): (...args: any[]) => Promise<void> {
  return async () => {
    let clipboardText = "";
    try {
      clipboardText = await uiService.readClipboard();
    } catch (error) {
      console.warn("Failed to read clipboard:", error);
    }

    const commandText = await uiService.createMultilineInputBox(
      "Save Command",
      "Enter or paste the command content",
      clipboardText
    );

    if (commandText) {
      await dataService.addCommand(commandText);
      await uiService.showInformationMessage("Command saved");
    }
  };
}

/**
 * Creates the remove command handler
 * @param dataService The local memo data service
 * @returns The remove command handler function
 */
export function createRemoveCommandHandler(
  dataService: LocalMemoService
): (...args: any[]) => Promise<void> {
  return async (item: MemoItem) => {
    if (!item) return;

    // Directly remove the command without confirmation
    const success = await dataService.removeCommand(item.id);

    if (success) {
      console.log("Command deleted successfully (no UI message shown).");
    } else {
      console.error("Failed to delete command (no UI message shown).");
    }
  };
}

/**
 * Creates the rename command handler
 * @param dataService The local memo data service
 * @param uiService The user interaction service
 * @returns The rename command handler function
 */
export function createRenameCommandHandler(
  dataService: LocalMemoService,
  uiService: VSCodeUserInteractionService
): (...args: any[]) => Promise<void> {
  return async (item: MemoItem) => {
    if (!item) return;

    const alias = await uiService.showInputBox({
      placeHolder: "Enter new alias for the command",
      prompt: "This will change how the command appears in the list",
      value: item.alias || item.label,
    });

    if (alias !== undefined) {
      const success = await dataService.renameCommand(item.id, alias);

      if (success) {
        uiService.showInformationMessage("Command renamed");
      }
    }
  };
}

/**
 * Creates the paste to editor command handler
 * @param uiService The user interaction service (for clipboard access)
 * @returns The paste to editor command handler function
 */
export function createPasteToEditorHandler(
  uiService: VSCodeUserInteractionService
): (...args: any[]) => Promise<void> {
  return async (item: MemoItem) => {
    if (!item) return;

    await uiService.writeClipboard(item.command);
    await directPaste();
  };
}

/**
 * Creates the edit command handler
 * @param dataService The local memo data service
 * @param uiService The user interaction service
 * @returns The edit command handler function
 */
export function createEditCommandHandler(
  dataService: LocalMemoService,
  uiService: VSCodeUserInteractionService
): (...args: any[]) => Promise<void> {
  return async (item: MemoItem) => {
    if (!item) return;

    const editedCommand = await uiService.createMultilineInputBox(
      "Edit Command Content",
      "Modify command content",
      item.command
    );

    if (editedCommand !== undefined && editedCommand !== item.command) {
      const success = await dataService.editCommand(item.id, editedCommand);

      if (success) {
        uiService.showInformationMessage("Command updated");
      }
    }
  };
}
