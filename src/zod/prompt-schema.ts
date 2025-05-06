/** @format */

import { z } from "zod";

export const PromptContentSchema = z.object({
  content: z.string(),
});

export const CategoryCommandsSchema = z.record(z.string(), PromptContentSchema);

export const PromptsStructureSchema = z.record(
  z.string(),
  CategoryCommandsSchema
);

/**
 * Serialize prompt data to JSON string
 * @param data Prompt data structure
 * @returns Formatted JSON string
 */
export function serializePrompts(
  data: z.infer<typeof PromptsStructureSchema>
): string {
  return JSON.stringify(data, null, 2);
}

/**
 * Parse JSON string to prompt data structure
 * @param jsonData JSON string
 * @returns Parsed prompt data structure
 * @throws If parsing fails
 */
export function parsePrompts(
  jsonData: string
): z.infer<typeof PromptsStructureSchema> {
  try {
    const data = JSON.parse(jsonData);
    const validationResult = PromptsStructureSchema.safeParse(data);

    if (!validationResult.success) {
      throw new Error(
        `Invalid prompt data format: ${validationResult.error.message}`
      );
    }
    return validationResult.data;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`Invalid JSON: ${error.message}`);
    }
    throw error;
  }
}
