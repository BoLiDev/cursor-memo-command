/** @format */

import { Prompt } from "../models/prompt";

/**
 * Check if two prompts are the same
 * If two prompts have the same categoryId, alias/label and content, they are considered duplicates
 * @param prompt1 The first prompt
 * @param prompt2 The second prompt
 * @returns Whether they are duplicates
 */
export function isSamePrompt(prompt1: Prompt, prompt2: Prompt): boolean {
  // Use alias if it exists, otherwise use label
  const name1 = prompt1.alias || prompt1.label;
  const name2 = prompt2.alias || prompt2.label;

  return (
    prompt1.categoryId === prompt2.categoryId &&
    name1 === name2 &&
    prompt1.content === prompt2.content
  );
}

/**
 * Check if a command exists in an existing command collection
 * @param newCmd The command to check
 * @param existingCmds The existing command collection
 * @returns true if it exists, otherwise false
 */
export function isDuplicatePrompt(
  newPrompt: Prompt,
  existingPrompts: Prompt[]
): boolean {
  return existingPrompts.some((prompt) => isSamePrompt(newPrompt, prompt));
}

/**
 * Remove duplicate commands from a list of commands
 * @param commands The list of commands to remove duplicates from
 * @returns The list of commands without duplicates
 */
export function removeDuplicatePrompts(prompts: Prompt[]): Prompt[] {
  const uniquePrompts: Prompt[] = [];

  for (const prompt of prompts) {
    // Only add the prompt if it is not a duplicate
    if (!isDuplicatePrompt(prompt, uniquePrompts)) {
      uniquePrompts.push(prompt);
    }
  }

  return uniquePrompts;
}

/**
 * Remove duplicate commands from a list of commands
 * @param newCommands The list of commands to remove duplicates from
 * @param existingCommands The list of existing commands
 * @returns The list of commands without duplicates
 */
export function filterOutDuplicates(
  newPrompts: Prompt[],
  existingPrompts: Prompt[]
): Prompt[] {
  return newPrompts.filter(
    (newPrompt) => !isDuplicatePrompt(newPrompt, existingPrompts)
  );
}
