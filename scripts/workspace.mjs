// Where the KIRO repositories are. They sit side by side in one folder (the "workspace"):
//   <workspace>/kiro-qa-testing  (this repo)   <workspace>/kiro-web   <workspace>/kiro-pos   <workspace>/kiro-backend ...
// Set KIRO_WORKSPACE to use another folder. CI checks every repo out into this layout.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const QA = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const WORKSPACE = process.env.KIRO_WORKSPACE ? path.resolve(process.env.KIRO_WORKSPACE) : path.resolve(QA, '..');
export const REPOS = ['kiro-web', 'kiro-pos', 'kiro-mobile', 'kiro-backend', 'kiro-payments', 'kiro-database', 'kiro-infrastructure', 'kiro-security', 'kiro-documentation', 'kiro-qa-testing'];
export const repo = (name) => (name === 'kiro-qa-testing' ? QA : path.join(WORKSPACE, name));
export const WEB_SITE = process.env.KIRO_WEB_SITE || path.join(repo('kiro-web'), 'web/site');
export const POS_APP = process.env.KIRO_POS_APP || path.join(repo('kiro-pos'), 'app');