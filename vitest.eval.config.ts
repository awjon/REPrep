import { defineConfig } from 'vitest/config';
import base from './vitest.config';

// Live model evals (cost real tokens). `ANTHROPIC_API_KEY=… npm run eval:review`
export default defineConfig({ ...base, test: { ...base.test, include: ['evals/**/*.eval.ts'] } });
