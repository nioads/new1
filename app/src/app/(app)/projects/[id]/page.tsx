import { ProjectEditor } from "@/components/project-editor";

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ProjectEditor projectId={id} />;
}
