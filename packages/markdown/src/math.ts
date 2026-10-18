import type { Element, Root } from 'hast';
import rehypeKatex from 'rehype-katex';
import type { Plugin } from 'unified';
import { visit } from 'unist-util-visit';

/** Only remark-math nodes render as formulas; even a ```math fence stays code. */
export const rehypeMath: Plugin<[], Root> = () => {
  const render = rehypeKatex({
    trust: false,
    strict: 'ignore',
    output: 'htmlAndMathml',
    errorColor: 'currentColor',
    maxExpand: 1000,
    maxSize: 20,
    // No shared macros object: definitions cannot leak across formulas/documents.
  });
  return (tree, file) => {
    const fences: Array<{ node: Element; classes: string[] }> = [];
    visit(tree, 'element', (node) => {
      const classes = node.properties.className;
      if (
        node.tagName === 'code' &&
        Array.isArray(classes) &&
        classes.includes('language-math') &&
        !classes.includes('math-inline') &&
        !classes.includes('math-display')
      ) {
        fences.push({ node, classes });
        node.properties.className = classes.filter(
          (name) => name !== 'language-math',
        );
      }
    });
    // rehype-katex catches parse errors and emits readable escaped source.
    render(tree, file);
    for (const { node, classes } of fences) node.properties.className = classes;
  };
};
