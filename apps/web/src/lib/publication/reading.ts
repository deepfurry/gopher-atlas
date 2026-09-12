// One HAST transformation after the shared safe parser and Shiki. Never raw HTML.
interface Node {
  type: string;
  tagName?: string;
  value?: string;
  properties?: Record<string, unknown>;
  children?: Node[];
}
const text = (value: string): Node => ({ type: 'text', value });
const element = (
  tagName: string,
  properties: Record<string, unknown>,
  children: Node[],
): Node => ({ type: 'element', tagName, properties, children });
export function readingEnhancements() {
  return (tree: Node) => {
    function walk(parent: Node) {
      if (!parent.children) return;
      parent.children = parent.children.map((node) => {
        walk(node);
        if (node.tagName === 'img')
          node.properties = {
            ...node.properties,
            loading: 'lazy',
            decoding: 'async',
            referrerPolicy: 'no-referrer',
          };
        if (
          node.tagName === 'a' &&
          /^https?:/.test(String(node.properties?.href))
        )
          node.properties = {
            ...node.properties,
            rel: ['noopener', 'noreferrer'],
          };
        if (node.tagName === 'table')
          return element(
            'div',
            {
              className: ['table-scroll'],
              tabIndex: 0,
              role: 'region',
              ariaLabel: '表格 / Table',
            },
            [node],
          );
        if (node.tagName === 'pre') {
          const language = String(
            node.properties?.dataLanguage ||
              node.properties?.['data-language'] ||
              'text',
          );
          return element('div', { className: ['code-block'] }, [
            element('div', { className: ['code-toolbar'] }, [
              element('span', {}, [text(language)]),
              element(
                'button',
                {
                  type: 'button',
                  'data-copy-code': '',
                  ariaLabel: '复制代码 / Copy code',
                },
                [text('复制代码')],
              ),
            ]),
            node,
          ]);
        }
        return node;
      });
    }
    walk(tree);
  };
}
