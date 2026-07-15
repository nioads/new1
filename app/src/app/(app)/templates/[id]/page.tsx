import { EditorLoader } from "@/components/editor-loader";

export default async function TemplateEditorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <EditorLoader templateId={id} />;
}
