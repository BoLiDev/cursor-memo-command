/** @format */

import * as vscode from "vscode";
import { LocalService } from "../services/local-service";
import { Prompt } from "../models/prompt";
import { VSCodeUserInteractionService } from "../services/vscode-user-interaction-service";

// TODO: Move directPaste to a suitable utility
async function directPaste(): Promise<void> {
  try {
    await vscode.commands.executeCommand("editor.action.clipboardPasteAction");
  } catch {
    // ignore
  }
}

/**
 * Creates the save command handler
 * @param dataService The local memo data service
 * @param uiService The user interaction service
 * @returns The save command handler function
 */
export function createSaveCommandHandler(
  dataService: LocalService,
  uiService: VSCodeUserInteractionService
): (...args: any[]) => Promise<void> {
  return async () => {
    let clipboardText = "";
    try {
      clipboardText = await uiService.readClipboard();
    } catch {
      // ignore
    }

    const promptContent = await uiService.createMultilineInputBox(
      "Save Prompt",
      "Enter or paste the prompt content",
      clipboardText
    );

    if (promptContent) {
      const result = await dataService.addPrompt(promptContent);

      if ("error" in result) {
        await uiService.showErrorMessage(result.error);
      } else {
        await uiService.showInformationMessage("Prompt saved");
      }
    }
  };
}

/**
 * Creates the remove command handler
 * @param dataService The local memo data service
 * @returns The remove command handler function
 */
export function createRemoveCommandHandler(
  dataService: LocalService,
  uiService: VSCodeUserInteractionService
): (...args: any[]) => Promise<void> {
  return async (item: Prompt) => {
    if (!item) return;

    const success = await dataService.removePrompt(item.id);

    if (success) {
      uiService.showInformationMessage("Prompt deleted");
    } else {
      uiService.showErrorMessage("Failed to delete prompt");
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
  dataService: LocalService,
  uiService: VSCodeUserInteractionService
): (...args: any[]) => Promise<void> {
  return async (item: Prompt) => {
    if (!item) return;

    const alias = await uiService.showInputBox({
      placeHolder: "Enter new alias for the prompt",
      prompt: "This will change how the prompt appears in the list",
      value: item.alias || item.label,
    });

    if (alias !== undefined) {
      const result = await dataService.renamePrompt(item.id, alias);

      if (result.success) {
        uiService.showInformationMessage("Prompt renamed");
      } else if (result.error) {
        uiService.showErrorMessage(result.error);
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
  return async (item: Prompt) => {
    if (!item) return;

    await uiService.openCursorChat();
    await uiService.writeClipboard(item.content);
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
  dataService: LocalService,
  uiService: VSCodeUserInteractionService
): (...args: any[]) => Promise<void> {
  return async (item: Prompt) => {
    if (!item) return;

    const editedPrompt = await uiService.createMultilineInputBox(
      "Edit Prompt Content",
      "Modify prompt content",
      item.content
    );

    if (editedPrompt !== undefined && editedPrompt !== item.content) {
      const result = await dataService.editPrompt(item.id, editedPrompt);

      if (result.success) {
        uiService.showInformationMessage("Prompt updated");
      } else if (result.error) {
        uiService.showErrorMessage(result.error);
      }
    }
  };
}
