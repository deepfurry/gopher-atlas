import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { expect, it } from 'vitest';

it('keeps literal interface copy Chinese, allowing technical terms', () => {
  const root = fileURLToPath(new URL('../src', import.meta.url));
  const failures: string[] = [];
  const copyAttributes = new Set([
    'label',
    'title',
    'description',
    'placeholder',
    'aria-label',
    'alt',
    'confirm',
  ]);
  const technical =
    /\b(?:GopherAtlas|GitHub|Markdown|URL|R2|SHA-256|RSS|Pagefind|ID|HTTP|API|CMS|PNG|JPEG|WebP|GIF|SVG|KiB|MiB|SEO|Ctrl|Cmd|H[123]|v\d+)\b/gi;
  for (const relative of readdirSync(root, { recursive: true }).map(String)) {
    if (!relative.endsWith('.tsx') || relative.endsWith('.test.tsx')) continue;
    const source = ts.createSourceFile(
      relative,
      readFileSync(join(root, relative), 'utf8'),
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    );
    const check = (text: string, node: ts.Node) => {
      if (text.trim() === 'https://') return;
      if (
        !/[a-zA-Z]{2,}/.test(text.replace(technical, '')) ||
        /[\u3400-\u9fff]/.test(text)
      )
        return;
      const line =
        source.getLineAndCharacterOfPosition(node.getStart()).line + 1;
      failures.push(`${relative}:${line}: ${text.trim()}`);
    };
    const visit = (node: ts.Node) => {
      if (ts.isJsxText(node)) check(node.text, node);
      if (
        ts.isJsxAttribute(node) &&
        copyAttributes.has(node.name.getText(source)) &&
        node.initializer &&
        ts.isStringLiteral(node.initializer)
      )
        check(node.initializer.text, node);
      if (
        ts.isJsxExpression(node) &&
        node.expression &&
        ts.isStringLiteral(node.expression)
      )
        check(node.expression.text, node);
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  expect(failures).toEqual([]);
});
