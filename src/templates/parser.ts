import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATES_FOLDER = path.join(__dirname, '../../plantillas');

let currentTemplate = '';

export async function loadTemplate(filename: string): Promise<string> {
  const filePath = path.join(TEMPLATES_FOLDER, filename);
  currentTemplate = await fs.readFile(filePath, 'utf-8');
  return currentTemplate;
}

export function setTemplate(content: string): void {
  currentTemplate = content;
}

export function getTemplate(): string {
  return currentTemplate;
}

export async function listTemplates(): Promise<string[]> {
  try {
    const files = await fs.readdir(TEMPLATES_FOLDER);
    return files.filter((f) => f.endsWith('.txt'));
  } catch {
    return [];
  }
}

export interface TemplateVariables {
  nombre: string;
  telefono?: string;
  [key: string]: string | undefined;
}

export function parseTemplate(variables: TemplateVariables): string {
  let result = currentTemplate;

  for (const [key, value] of Object.entries(variables)) {
    const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'gi');
    result = result.replace(regex, value || '');
  }

  return result.trim();
}

export function getRequiredVariables(): string[] {
  const regex = /\{\{(\w+)\}\}/g;
  const matches = currentTemplate.matchAll(regex);
  return [...new Set([...matches].map((m) => m[1]))];
}

export function extractFirstName(fullName: string): string {
  return fullName.split(' ')[0];
}
