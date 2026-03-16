import { runValidate } from './validate.js';
export const runLint = async (filePath: string | undefined): Promise<void> => {
  await runValidate(filePath);
};
