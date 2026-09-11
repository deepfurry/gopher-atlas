import { MarkdownPreview } from './markdown';
// Vite aliases UIW's bundled preview to this safe renderer. Source input must
// never pull the package's raw-HTML parser into the production graph.
export default function SafeEditorPreview({
  source = '',
}: {
  source?: string;
}) {
  return <MarkdownPreview source={source} />;
}
