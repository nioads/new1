import { ComposerLoader } from "@/components/composer-loader";

export default async function ComposePage({
  params,
}: {
  params: Promise<{ itemId: string }>;
}) {
  const { itemId } = await params;
  return <ComposerLoader itemId={itemId} />;
}
